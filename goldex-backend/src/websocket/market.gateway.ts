// market.gateway.ts
import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  ConnectedSocket,
  MessageBody,
} from "@nestjs/websockets";
import { Server, Socket } from "socket.io";
import { Logger } from "@nestjs/common";
import { JwtService } from "@nestjs/jwt";
import { ConfigService } from "@nestjs/config";
import { MarketService } from "./market.service";
import { RedisService } from "../redis/redis.service";

const ONLINE_SET = "online_users";
const ONLINE_CONN = "online_conn";

@WebSocketGateway({
  namespace: "market",
  cors: {
    origin: "*",
    credentials: true,
  },
})
export class MarketGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(MarketGateway.name);
  private socketPairs: Map<string, Set<string>> = new Map();
  private streamingCallbacks: Map<string, Function> = new Map();

  constructor(
    private marketService: MarketService,
    private readonly jwtService: JwtService,
    private readonly configService: ConfigService,
    private readonly redisService: RedisService
  ) {}

  // Reset stale presence keys on (re)start — sockets from before don't survive.
  async afterInit() {
    try {
      await this.redisService.getClient().del(ONLINE_SET, ONLINE_CONN);
    } catch (e) {
      this.logger.warn(`presence reset failed: ${(e as Error).message}`);
    }
  }

  async handleConnection(client: Socket) {
    this.logger.log(`✅ Client connected: ${client.id}`);
    this.socketPairs.set(client.id, new Set());
    await this.trackPresence(client, true);

    client.emit("connected", {
      message: "Connected to market WebSocket",
      socketId: client.id,
      timestamp: new Date().toISOString(),
    });
  }

  async handleDisconnect(client: Socket) {
    this.logger.log(`❌ Client disconnected: ${client.id}`);
    await this.trackPresence(client, false);

    const subscribedPairs = this.socketPairs.get(client.id);
    if (subscribedPairs) {
      for (const pair of subscribedPairs) {
        await this.checkAndStopStreaming(pair);
      }
    }
    this.socketPairs.delete(client.id);
  }

  // Maintain a distinct-online-users SET keyed by a per-user connection counter,
  // so multiple tabs count once. Best-effort — never breaks the socket.
  private async trackPresence(client: Socket, connected: boolean) {
    try {
      let userId = client.data?.userId as string | undefined;
      if (connected) {
        const token = client.handshake?.auth?.token || client.handshake?.headers?.authorization?.split(" ")[1];
        if (!token) return;
        const secret = (this.configService.get("user") as any)?.userJwtSecret;
        const payload: any = this.jwtService.verify(token, { secret });
        userId = payload?.userId;
        if (!userId) return;
        client.data.userId = userId;

        // Load the user's effective market types (role defaults when no
        // explicit assignment), so price broadcasts and market data follow the
        // same rules as the REST pairs endpoint.
        try {
          const mts = await this.marketService.getEffectiveMarketTypes(userId);
          client.data.marketTypes = mts;
        } catch {
          client.data.marketTypes = [];
        }
      }
      if (!userId) return;

      const redis = this.redisService.getClient();
      const n = await redis.hincrby(ONLINE_CONN, userId, connected ? 1 : -1);
      if (connected && n >= 1) {
        await redis.sadd(ONLINE_SET, userId);
      } else if (!connected && n <= 0) {
        await redis.srem(ONLINE_SET, userId);
        await redis.hdel(ONLINE_CONN, userId);
      }
    } catch {
      // ignore — presence is non-critical
    }
  }

  @SubscribeMessage("subscribe-prices")
  async handleSubscribePrices(@ConnectedSocket() client: Socket, @MessageBody() data: { pairs: string[] }) {
    try {
      const pairs = data.pairs;
      const socketId = client.id;

      this.logger.log(`📡 Client ${socketId} subscribing to: ${pairs.join(", ")}`);

      // Store subscriptions
      if (!this.socketPairs.has(socketId)) {
        this.socketPairs.set(socketId, new Set());
      }
      const subscriptions = this.socketPairs.get(socketId);

      for (const pair of pairs) {
        subscriptions.add(pair);
      }

      // Send initial prices
      const initialPrices = await this.marketService.getMultiplePrices(pairs);
      this.logger.log(`💰 Sending initial prices: ${JSON.stringify(initialPrices)}`);

      if (Object.keys(initialPrices).length > 0) {
        client.emit("price-update", initialPrices);
      } else {
        client.emit("price-error", { message: "No price data available", pairs });
      }

      // Setup streaming - expand __all__ to actual pair keys
      const allPairs = pairs.includes("__all__")
        ? Array.from(this.marketService.getCachedPairKeys())
        : pairs;

      for (const pair of allPairs) {
        if (!this.streamingCallbacks.has(pair)) {
          const callback = (priceData: any) => {
            this.broadcastToSubscribers(pair, priceData);
          };
          this.streamingCallbacks.set(pair, callback);
          await this.marketService.startStreaming([pair], callback);
        }
      }

      return { success: true, message: "Subscribed to price updates" };
    } catch (error) {
      this.logger.error(`Subscribe error: ${(error as any).message}`);
      throw error;
    }
  }

  @SubscribeMessage("unsubscribe-prices")
  async handleUnsubscribePrices(@ConnectedSocket() client: Socket, @MessageBody() data: { pairs: string[] }) {
    const pairs = data.pairs;
    const socketId = client.id;

    this.logger.log(`Client ${socketId} unsubscribing from: ${pairs.join(", ")}`);

    const subscriptions = this.socketPairs.get(socketId);
    if (subscriptions) {
      for (const pair of pairs) {
        subscriptions.delete(pair);
      }
    }

    for (const pair of pairs) {
      await this.checkAndStopStreaming(pair);
    }

    return { success: true };
  }

  @SubscribeMessage("get-market-data")
  async handleGetMarketData(
    @ConnectedSocket() client: Socket,
    @MessageBody() data: { baseCode?: string; quoteCode?: string; limit?: number }
  ) {
    try {
      let marketData = await this.marketService.getMarketData(data.baseCode, data.quoteCode, data.limit || 50);
      const userMarketTypes = client.data?.marketTypes as string[] | undefined;
      if (userMarketTypes && userMarketTypes.length > 0) {
        marketData = marketData.filter((d: any) => userMarketTypes.includes(d.marketType));
      }
      client.emit("market-data", marketData);
      return { success: true };
    } catch (error) {
      this.logger.error(`Get market data error: ${(error as any).message}`);
      throw error;
    }
  }

  @SubscribeMessage("get-pair-details")
  async handleGetPairDetails(@ConnectedSocket() client: Socket, @MessageBody() data: { pairId: string }) {
    try {
      // Implement pair details logic
      client.emit("pair-details", { pairId: data.pairId });
      return { success: true };
    } catch (error) {
      this.logger.error(`Get pair details error: ${(error as any).message}`);
      throw error;
    }
  }

  private broadcastToSubscribers(pair: string, priceData: any) {
    if (!this.server) {
      this.logger.warn(`Cannot broadcast: server not initialized yet`);
      return;
    }

    const sockets = this.server.sockets;
    if (!sockets) {
      this.logger.warn(`Cannot broadcast: sockets not available`);
      return;
    }

    const pairMarketType = priceData?.marketType as string | undefined;

    let broadcastCount = 0;
    for (const [socketId, subscriptions] of this.socketPairs.entries()) {
      if (!subscriptions.has(pair) && !subscriptions.has("__all__")) continue;

      const socket = sockets.sockets?.get(socketId);
      if (!socket || !socket.connected) {
        try {
          this.server.to(socketId).emit("price-update", { [pair]: priceData });
          broadcastCount++;
        } catch { /* ignore */ }
        continue;
      }

      // Skip if user has explicit market type restrictions and this pair's type is not allowed
      const userMarketTypes = socket.data?.marketTypes as string[] | undefined;
      if (userMarketTypes && userMarketTypes.length > 0 && pairMarketType && !userMarketTypes.includes(pairMarketType)) {
        continue;
      }

      const updateData = { [pair]: priceData };
      socket.emit("price-update", updateData);
      broadcastCount++;
    }

    if (broadcastCount > 0) {
      this.logger.debug(`Broadcasted update for ${pair} to ${broadcastCount} clients`);
    } else if (this.socketPairs.size > 0) {
      this.logger.debug(`No subscribers found for ${pair}, skipping broadcast`);
    }
  }

  private async checkAndStopStreaming(pair: string) {
    // Check if any socket is still subscribed
    let hasSubscribers = false;
    for (const subscriptions of this.socketPairs.values()) {
      if (subscriptions.has(pair)) {
        hasSubscribers = true;
        break;
      }
    }

    if (!hasSubscribers && this.streamingCallbacks.has(pair)) {
      await this.marketService.stopStreaming([pair]);
      this.streamingCallbacks.delete(pair);
      this.logger.log(`Stopped streaming for ${pair}`);
    }
  }
}
