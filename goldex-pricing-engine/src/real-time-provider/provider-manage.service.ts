import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConsoleFormatterService } from '../common/console-formatter.service';
import { ProviderConfig } from './types/provider-config.type';
import { IRealtimePriceProvider } from './types/provider.interface';
import { ZaryarSignalRProvider } from './providers/zaryar-signalr.provider';
import { TalaAbWebSocketProvider } from './providers/talaab-websocket.provider';
import { PriceData, RedisService } from '../redis/redis.service';
import { ItemMetadataService } from './item-metadata.service';
import { ProviderEntity } from './entity/provider.entity';
import { resolvePriceUnit } from '../common/currency-unit';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RabbitMQService, MessagePatterns } from '../rabbitmq/rabbitmq.module';
import { ProviderCategory } from './types';

export interface ProviderHealthEntry {
  key: string;
  category: string;
  active: boolean;
  /** Runtime state of the provider relative to its desired (DB) state. */
  state: 'connected' | 'connecting' | 'disconnected' | 'stopped' | 'inactive';
  connected: boolean;
}

@Injectable()
export class ProviderManagerService implements OnModuleInit, OnModuleDestroy {
  private providers = new Map<string, IRealtimePriceProvider>();
  /** Keys whose connect() is currently in flight (prevents overlapping starts). */
  private connecting = new Set<string>();
  private healthCheckTimer: NodeJS.Timeout | null = null;
  private reconciling = false;
  private readonly healthCheckIntervalMs = parseInt(
    process.env.PROVIDER_HEALTHCHECK_INTERVAL_MS ?? '30000',
    10,
  );

  constructor(
    private readonly httpService: HttpService,
    private readonly redisService: RedisService,
    private readonly metadataService: ItemMetadataService,
    @InjectRepository(ProviderEntity)
    private providerRepo: Repository<ProviderEntity>,
    private readonly formatter: ConsoleFormatterService,
    private readonly rabbitMQService?: RabbitMQService,
  ) {}

  onModuleInit(): void {
    // Never block app bootstrap on provider connectivity. Kick off the initial
    // start in the background and let the periodic health check do the rest, so
    // the HTTP server and other modules come up regardless of provider state.
    void this.bootstrapProviders();
    this.startHealthCheck();
  }

  private async bootstrapProviders(): Promise<void> {
    try {
      const entities = await this.providerRepo.find();
      const activeEntities = entities.filter((e) => e.active);
      this.formatter.log(
        'ProviderManager',
        `Bootstrapping ${activeEntities.length} active providers`,
      );
      for (const entity of activeEntities) {
        // Fire-and-forget: a failing provider must not block the others.
        void this.startProvider(entity);
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.formatter.error('ProviderManager', `Bootstrap failed: ${message}`);
    }
  }

  private createProvider(entity: ProviderEntity): IRealtimePriceProvider {
    switch (entity.category) {
      case ProviderCategory.ZARYAR:
        return new ZaryarSignalRProvider(
          this.httpService,
          this.metadataService,
          this.redisService,
          this.formatter,
          this.rabbitMQService,
        );
      case ProviderCategory.TALAAB:
        return new TalaAbWebSocketProvider(
          this.httpService,
          this.redisService,
          this.metadataService,
          this.formatter,
          this.rabbitMQService,
        );
      default:
        throw new Error(`Unknown category: ${entity.category}`);
    }
  }

  async startProvider(entity: ProviderEntity): Promise<void> {
    // Guard against overlapping start attempts (bootstrap + health check).
    if (this.connecting.has(entity.key)) return;
    if (this.providers.has(entity.key)) {
      await this.stopProvider(entity.key);
    }

    const config: ProviderConfig = {
      key: entity.key,
      category: entity.category,
      baseUrl: entity.baseUrl,
      apiBaseUrl: entity.apiBaseUrl ?? undefined,
      originUrl: entity.config?.originUrl as string | undefined,
      auth: entity.auth,
      priceUnit: resolvePriceUnit(entity.priceUnit),
      metadataRefreshIntervalMs: entity.metadataRefreshIntervalMs || 60000,
    };

    this.connecting.add(entity.key);

    let provider: IRealtimePriceProvider;
    try {
      provider = this.createProvider(entity);
      await provider.init(config);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.formatter.error('ProviderManager', `Provider ${entity.key} init failed: ${message}`);
      this.connecting.delete(entity.key);
      return;
    }

    // Register immediately so the provider is tracked while it connects; the
    // health check can then observe and recover it if the connection drops.
    this.providers.set(entity.key, provider);

    try {
      await provider.connect();
      this.formatter.log('ProviderManager', `Provider ${entity.key} started.`);
      await this.publishConnected(entity);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.formatter.error('ProviderManager', `Provider ${entity.key} connect failed: ${message}`);
      provider.stop();
      this.providers.delete(entity.key);
    } finally {
      this.connecting.delete(entity.key);
    }
  }

  private async publishConnected(entity: ProviderEntity): Promise<void> {
    const metadataIds = new Set(await this.metadataService.getAllItemIds(entity.key));
    await this.redisService.publishSnapshot(entity.key, metadataIds);

    if (this.rabbitMQService) {
      await this.rabbitMQService.publish(
        MessagePatterns.PROVIDER_CONNECTED,
        {
          key: entity.key,
          category: entity.category,
          baseUrl: entity.baseUrl,
        },
        entity.key,
      );

      const allPrices = await this.redisService.getAllCurrentPrices(entity.key);
      const filteredItems = allPrices.filter((p) => metadataIds.has(p.itemId));
      await this.rabbitMQService.publish(
        MessagePatterns.PRICE_SNAPSHOT,
        { providerKey: entity.key, items: filteredItems, timestamp: new Date().toISOString() },
        entity.key,
      );
    }
  }

  // ── Health check / reconciliation ────────────────────────────────────────

  private startHealthCheck(): void {
    if (this.healthCheckTimer) return;
    this.healthCheckTimer = setInterval(() => {
      void this.reconcileProviders();
    }, this.healthCheckIntervalMs);
    this.formatter.log(
      'ProviderManager',
      `Health check scheduled every ${this.healthCheckIntervalMs / 1000}s`,
    );
  }

  /**
   * Reconcile desired state (DB `active` flag) with runtime state. Starts
   * active providers that aren't running, reconnects dropped ones, retries
   * failed initial connects, and stops providers that were deactivated.
   * Safe to call concurrently — overlapping runs are skipped.
   */
  async reconcileProviders(): Promise<ProviderHealthEntry[]> {
    if (this.reconciling) return this.getHealthReport();
    this.reconciling = true;
    try {
      const entities = await this.providerRepo.find();
      for (const entity of entities) {
        const running = this.providers.get(entity.key);
        const isConnecting = this.connecting.has(entity.key);

        if (entity.active) {
          if (isConnecting) continue; // attempt already in flight
          if (!running) {
            this.formatter.log('ProviderManager', `Health: starting ${entity.key}`);
            void this.startProvider(entity);
          } else if (!running.isConnected()) {
            this.formatter.warn('ProviderManager', `Health: reconnecting ${entity.key}`);
            void this.startProvider(entity); // startProvider stops the stale instance first
          }
        } else if (running) {
          this.formatter.log('ProviderManager', `Health: stopping deactivated ${entity.key}`);
          await this.stopProvider(entity.key);
        }
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.formatter.error('ProviderManager', `Reconcile failed: ${message}`);
    } finally {
      this.reconciling = false;
    }
    return this.getHealthReport();
  }

  getHealthReport(): ProviderHealthEntry[] {
    const report: ProviderHealthEntry[] = [];
    for (const [key, provider] of this.providers) {
      const connected = provider.isConnected();
      report.push({
        key,
        category: provider.config.category,
        active: true,
        state: this.connecting.has(key) ? 'connecting' : connected ? 'connected' : 'disconnected',
        connected,
      });
    }
    return report;
  }

  async stopProvider(key: string): Promise<void> {
    const provider = this.providers.get(key);
    if (provider) {
      provider.stop();
      this.providers.delete(key);
      this.formatter.log('ProviderManager', `Provider ${key} stopped.`);
      if (this.rabbitMQService) {
        await this.rabbitMQService.publish(MessagePatterns.PROVIDER_DISCONNECTED, { key }, key);
      }
    }
  }

  async restartProvider(key: string): Promise<void> {
    const entity = await this.providerRepo.findOne({ where: { key } });
    if (!entity) throw new Error('Provider not found');
    await this.stopProvider(key);
    if (entity.active) {
      // Don't block the caller on connect/handshake; let it connect in the background.
      void this.startProvider(entity);
    }
  }

  async getPricesForProvider(providerKey: string): Promise<PriceData[]> {
    return this.redisService.getAllCurrentPrices(providerKey);
  }

  getProvider(key: string): IRealtimePriceProvider | undefined {
    return this.providers.get(key);
  }

  getAllProviders(): Map<string, IRealtimePriceProvider> {
    return this.providers;
  }

  async onModuleDestroy(): Promise<void> {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = null;
    }
    for (const [key, provider] of this.providers) {
      try {
        provider.stop();
        this.formatter.log('ProviderManager', `Stopped ${key}`);
      } catch {
        // ignore stop errors during shutdown
      }
    }
    this.providers.clear();
  }
}

// Initial hardcoded configurations (for reference / seeding)
// private loadConfigurations(): ProviderConfig[] {
//   return [
//     {
//       key: 'mirrokni',
//       category: 'zaryar',
//       baseUrl: 'https://pnlapi.mirrokni.ir/signalr',
//       auth: {
//         sessionId: 'd37dfcc7-5c95-4dd2-b9ce-30a9790344e9',
//         shopkeeperId: '4c8d255e-80b3-ec11-9aaf-00505600229b',
//         user: 'token:"J1r6ecQze9mAlO5Y_2J0TV6qwPhIpnmmeLnj2KdHIBFkKLMzPrNo7UJ-cFZ9VVtXqL9PL7eXq96pYw-9VfosGmaNdAL8QmY5ou5UoYx-_uUB4Qk30KbgKu1MBPULnKbz17Vi8dlOX9gFFJ12u9lTZ8MgoDw4_ZCmBP7zNLgEddNCDPDr20afoSmzaxfm5M3n35cDRR_Oe2EekozNNc-DIdomRvsPu9KPFj6kEDaUtUUNa35ojthL5fs-hMFMA9dtfweJT0oh_GVcUEssKvRt_Dq8IqKcMrtX1aRvtW6Sxih-G-SVMhp6fUToxAaadHzsXneabrRKpn4lqBHcIdAcf2vpdlj8nXobx2wZStt8NHmnUDadU6ibw4kmr5YeEFjOU-W99l2U2kH-4xGXdqIgP-VfAWZVBRJqNk4umAlTM0i-S7R0p9jwfQgbEK-SHhvMt6UetZn5SENXwUrXFkQqp3O-p7JgBXHhoUofTOmfR8JIIc8B1s_C6VDzzuZuz6BE_gBMv10ReLSttq-cCUNK4JWIbFKmKqa-L3bU5h0odvCvrFT58uam1IzwqH5uFdB_0cCSEKydYhopLjcSu2FEw7jV9zlOJhpBX-e5NvnZxEwbllX_V-KPCnRtvRRz3vKZAfVcctD0J3Hm-O5NxgefjbwG8tIteaZtAZOVpBlqrPNyV3kBQnrfaWBEN1BUcmM843KMT2VS40BiThEPweSeVFqi5KWamreN1SR7tSOvATs-cVJWf3EJnfHDaDTReeFfIzEms5hMsGkyia4Q3JJqXLgra8qQiuDV3hLwP1Enu1EzigQz2bKZmmeSd3UtjAqQSWQgDQBxSfbukG3ID98J7Ka1kqYih3TvZkLZD8a9ZG60rGjH0fe4mZLeapScMCFXhBbpkg", uId:"whFe9JM0YEiLgqSpSfkkRA", userId:"f45e11c2-3493-4860-8b82-a4a949f92444"',
//         roleType: '0',
//         uId: 'whFe9JM0YEiLgqSpSfkkRA',
//         UserAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36',
//         token: 'J1r6ecQze9mAlO5Y_2J0TV6qwPhIpnmmeLnj2KdHIBFkKLMzPrNo7UJ-cFZ9VVtXqL9PL7eXq96pYw-9VfosGmaNdAL8QmY5ou5UoYx-_uUB4Qk30KbgKu1MBPULnKbz17Vi8dlOX9gFFJ12u9lTZ8MgoDw4_ZCmBP7zNLgEddNCDPDr20afoSmzaxfm5M3n35cDRR_Oe2EekozNNc-DIdomRvsPu9KPFj6kEDaUtUUNa35ojthL5fs-hMFMA9dtfweJT0oh_GVcUEssKvRt_Dq8IqKcMrtX1aRvtW6Sxih-G-SVMhp6fUToxAaadHzsXneabrRKpn4lqBHcIdAcf2vpdlj8nXobx2wZStt8NHmnUDadU6ibw4kmr5YeEFjOU-W99l2U2kH-4xGXdqIgP-VfAWZVBRJqNk4umAlTM0i-S7R0p9jwfQgbEK-SHhvMt6UetZn5SENXwUrXFkQqp3O-p7JgBXHhoUofTOmfR8JIIc8B1s_C6VDzzuZuz6BE_gBMv10ReLSttq-cCUNK4JWIbFKmKqa-L3bU5h0odvCvrFT58uam1IzwqH5uFdB_0cCSEKydYhopLjcSu2FEw7jV9zlOJhpBX-e5NvnZxEwbllX_V-KPCnRtvRRz3vKZAfVcctD0J3Hm-O5NxgefjbwG8tIteaZtAZOVpBlqrPNyV3kBQnrfaWBEN1BUcmM843KMT2VS40BiThEPweSeVFqi5KWamreN1SR7tSOvATs-cVJWf3EJnfHDaDTReeFfIzEms5hMsGkyia4Q3JJqXLgra8qQiuDV3hLwP1Enu1EzigQz2bKZmmeSd3UtjAqQSWQgDQBxSfbukG3ID98J7Ka1kqYih3TvZkLZD8a9ZG60rGjH0fe4mZLeapScMCFXhBbpkg',
//       },
//     },
//     {
//       key: 'arianatala',
//       category: 'zaryar',
//       baseUrl: 'https://pnlapi.arianatala.com/signalr',
//       auth: {
//         sessionId: 'c55ad0cb-234a-4158-bcc5-7d1d3252e73a',
//         shopkeeperId: 'ffd9f629-ccdf-f011-b37a-941882086b2b',
//         user: 'token:"g_6f5FZx11nSdHq7IX9Tyu_2dTF7m1bFknAnXts9aUcIQZ99R3bmIgCySWUjMasaAoOY9b2w4E17ifH3TEoF7fHkrnmMiIDOHLL4XmZsDDBb8C-hTMhwnI-nsmWK5hIRgAX2QM4vsCDbhpXghOEWQOMpDa9qhY9YKzqiGa-uXTHOtPN7zMJxt61Vb47ta3_AAmCQXNnNRGFHu3qmEjbWorJR6dFwHyyYTclBNoFr0LbhVdbK19ZmQ4lGQF3xEo1HcnZgM619C_O6aE4B_LKAjtS94GrUlvUvFnc_xOp1EZFJvvI7bSUVCfuCsv2Nbv4Bmiz55DnI6-eRO9T4TPo7AMAXP5Zv1e3-uPue2-CPIPA-prwEU3bze-eILHbMfeVkx6JLs5b7eiYbnY50mak24VdS9YdiCGCR8U9ZOw-iuYkaWvihAO_jkmamuobWyHmmr5PNFKhKkRr6qCaofRP0b2JpofDWYdFTQdqoLoLJNeIprp44tnlCM1VCjpDskOCHfONiDQuuirq1VaiFIFJ3ekl1OWlGuNebkcriwIasrgfONPts7kR07P7dWGpgBUXsNeJ3ez9o7FCdaGbTRXc4B6Y0Q08gASYuxNCbM31Gc4i5Oj6mtyOpzvDubDh1EqwtyVgIJl8hSxp5xwXyuCnEl8As_hc0aGtDcCQeZ7BMyeLak7JyXMlsKDSbwO_9WYIimPhPVsohKF7mpfXBt2_uYphl2DgUmxZUnL-0mpVdUq3h-CmmzvQFUtYzC4gtaoT-O1FdysV2AS-8K5JZ8cbD7YHHGejwPm0rTKLUoS-AFADjie5YNZPD-WjXxlfywZx8puBEQ2x3JId9VNb8XGZjtEeSs4iCoc3nvqLWpUZXH4iVTo53yPD54IWpstbs5PptWHtjQMiY0mg3Ayr8MDCxEfv5jDo", uId:"pixA48vUBEejy-tNG-obig", userId:"pixA48vUBEejy-tNG-obig"',
//         roleType: '0',
//         uId: 'pixA48vUBEejy-tNG-obig',
//         UserAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/149.0.0.0 Safari/537.36',
//         token: 'g_6f5FZx11nSdHq7IX9Tyu_2dTF7m1bFknAnXts9aUcIQZ99R3bmIgCySWUjMasaAoOY9b2w4E17ifH3TEoF7fHkrnmMiIDOHLL4XmZsDDBb8C-hTMhwnI-nsmWK5hIRgAX2QM4vsCDbhpXghOEWQOMpDa9qhY9YKzqiGa-uXTHOtPN7zMJxt61Vb47ta3_AAmCQXNnNRGFHu3qmEjbWorJR6dFwHyyYTclBNoFr0LbhVdbK19ZmQ4lGQF3xEo1HcnZgM619C_O6aE4B_LKAjtS94GrUlvUvFnc_xOp1EZFJvvI7bSUVCfuCsv2Nbv4Bmiz55DnI6-eRO9T4TPo7AMAXP5Zv1e3-uPue2-CPIPA-prwEU3bze-eILHbMfeVkx6JLs5b7eiYbnY50mak24VdS9YdiCGCR8U9ZOw-iuYkaWvihAO_jkmamuobWyHmmr5PNFKhKkRr6qCaofRP0b2JpofDWYdFTQdqoLoLJNeIprp44tnlCM1VCjpDskOCHfONiDQuuirq1VaiFIFJ3ekl1OWlGuNebkcriwIasrgfONPts7kR07P7dWGpgBUXsNeJ3ez9o7FCdaGbTRXc4B6Y0Q08gASYuxNCbM31Gc4i5Oj6mtyOpzvDubDh1EqwtyVgIJl8hSxp5xwXyuCnEl8As_hc0aGtDcCQeZ7BMyeLak7JyXMlsKDSbwO_9WYIimPhPVsohKF7mpfXBt2_uYphl2DgUmxZUnL-0mpVdUq3h-CmmzvQFUtYzC4gtaoT-O1FdysV2AS-8K5JZ8cbD7YHHGejwPm0rTKLUoS-AFADjie5YNZPD-WjXxlfywZx8puBEQ2x3JId9VNb8XGZjtEeSs4iCoc3nvqLWpUZXH4iVTo53yPD54IWpstbs5PptWHtjQMiY0mg3Ayr8MDCxEfv5jDo',
//       },
//     },
//     {
//       key: 'afrogh',
//       category: 'talaab',
//       baseUrl: 'wss://pusher.goldab.ir/app/app-key?protocol=7&client=js&version=8.4.0&flash=false',
//       auth: {
//         token: '421|GlANRv1GVEeHcrnnSRUWHzLAh5Vqnosiq8Tk8pgWad4ecdf9',
//         apiBaseUrl: 'https://api.afroghnegaremana.ir/api/v1/profile/homepage',
//       },
//     },
//   ];
// }

// [
//   {
//     "id": "2b676dad-f0dc-4dd0-82dd-954087fdef6f",
//     "key": "mirrokni",
//     "category": "zaryar",
//     "baseUrl": "https://pnlapi.mirrokni.ir/signalr",
//     "apiBaseUrl": "https://pnlapi.mirrokni.ir",
//     "phone": "09122650904",
//     "sendOtpUrl": "https://pnlapi.mirrokni.ir/api/User/SendConfirmCode",
//     "verifyCodeUrl": "https://pnl.mirrokni.ir/auth/verifyCode",
//     "auth": {},
//     "config": {},
//     "active": false,
//     "metadataRefreshIntervalMs": 60000,
//     "createdAt": "2026-06-17T08:52:43.897Z",
//     "updatedAt": "2026-06-17T08:52:43.897Z"
//   },
//   {
//     "id": "d0d600e1-e1e8-45da-8057-7e60d3b0dcf5",
//     "key": "arianatala",
//     "category": "zaryar",
//     "baseUrl": "https://pnlapi.arianatala.com/signalr",
//     "apiBaseUrl": "https://pnlapi.arianatala.com",
//     "phone": "09122650904",
//     "sendOtpUrl": "https://pnlapi.arianatala.com/api/User/SendConfirmCode",
//     "verifyCodeUrl": "https://subpnl.arianatala.com/auth/verifyCode",
//     "auth": {},
//     "config": {},
//     "active": false,
//     "metadataRefreshIntervalMs": 60000,
//     "createdAt": "2026-06-17T08:54:58.391Z",
//     "updatedAt": "2026-06-17T08:54:58.391Z"
//   },
//   {
//     "id": "13659105-a954-47bf-8ab5-655cca471bd3",
//     "key": "afrogh",
//     "category": "talaab",
//     "baseUrl": "wss://pusher.goldab.ir/app/app-key?protocol=7&client=js&version=8.4.0&flash=false",
//     "apiBaseUrl": "https://api.afroghnegaremana.ir/api/v1/profile/homepage",
//     "phone": "09122650904",
//     "sendOtpUrl": "https://api.afroghnegaremana.ir/api/v1/auth/check-mobile-exists",
//     "verifyCodeUrl": "https://api.afroghnegaremana.ir/api/v1/auth/login",
//     "auth": {},
//     "config": {},
//     "active": false,
//     "metadataRefreshIntervalMs": 60000,
//     "createdAt": "2026-06-17T08:56:49.195Z",
//     "updatedAt": "2026-06-17T08:56:49.195Z"
//   }
// ]
