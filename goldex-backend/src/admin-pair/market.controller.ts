import { Controller, Get, Req, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { AdminPairService } from "./admin-pair.service";
import { PricePairEntity } from "./entity/price.pair.entity";
import { GainTypeEnum } from "../admin-symbol/enum/gain.type.enum";
import { MarketTypeEnum } from "./enum/market.type.enum";
import { MarketKindEnum } from "./enum/market.kind.enum";
import { defaultMarketKindsForRole, defaultMarketTypesForRole } from "../shared/market-access.helper";
import { MESQAL_TO_GRAM } from "../common/constants";
import { UserAuthGuard } from "../user/auth/Guard/user.guard";
import { UserExpressRequest } from "../user/auth/types/user-express-request";
import { UserMarketTypeEntity } from "../user/entity/user.market.type.entity";
import { UserMarketKindEntity } from "../user/entity/user.market.kind.entity";
import { UserLevelService } from "../user-level/user-level.service";

@ApiTags("Market")
@ApiBearerAuth()
@UseGuards(UserAuthGuard)
@Controller("market")
export class MarketController {
  constructor(
    private readonly pairService: AdminPairService,
    @InjectRepository(UserMarketTypeEntity)
    private readonly userMarketTypeRepo: Repository<UserMarketTypeEntity>,
    @InjectRepository(UserMarketKindEntity)
    private readonly userMarketKindRepo: Repository<UserMarketKindEntity>,
    private readonly levelService: UserLevelService,
  ) {}

  @Get("access")
  @ApiOperation({ summary: "The current user's effective market access (kinds + pair types)" })
  async getAccess(@Req() req: UserExpressRequest) {
    const user = req.user;
    if (!user) return { data: null };

    const typeRows = await this.userMarketTypeRepo.find({ where: { userId: user.id } });
    const marketTypes = typeRows.length > 0
      ? typeRows.map((r) => r.marketType)
      : defaultMarketTypesForRole(user.role);

    const kindRows = await this.userMarketKindRepo.find({ where: { userId: user.id } });
    let marketKinds = kindRows.length > 0
      ? kindRows.map((r) => r.marketKind)
      : defaultMarketKindsForRole(user.role);

    // Order-kind features on the user's level gate which market kinds are usable.
    const kindGate: [MarketKindEnum, string][] = [
      [MarketKindEnum.MARKET, "MARKET_ORDER_ENABLED"],
      [MarketKindEnum.LIMIT, "LIMIT_ORDER_ENABLED"],
      [MarketKindEnum.OFFER, "QUOTE_REQUEST_ENABLED"],
    ];
    marketKinds = marketKinds.filter((k) =>
      kindGate.some(([kind, key]) => kind === k && this.featureEnabledPromise(user.id, key))
    );

    return { data: { marketTypes, marketKinds } };
  }

  private async featureEnabledPromise(userId: string, key: string): Promise<boolean> {
    const value = await this.levelService.getFeatureValue(userId, key);
    if (typeof value === "object" && "enabled" in value) return value.enabled === true;
    if (typeof value === "boolean") return value;
    return true;
  }

  @Get("pairs")
  @ApiOperation({ summary: "List valid trading pairs with user-facing prices" })
  async getPairs(@Req() req: UserExpressRequest) {
    const pairs = await this.pairService.findValidWithSymbols();
    const user = req.user;
    let visible: PricePairEntity[];

    if (user) {
      const userMts = await this.userMarketTypeRepo.find({ where: { userId: user.id } });
      // Explicit assignment wins; otherwise fall back to role defaults
      // (CUSTOMER → formal only, PARTNER → formal + informal).
      const allowed = new Set(
        userMts.length > 0
          ? userMts.map((r) => r.marketType)
          : defaultMarketTypesForRole(user.role)
      );
      visible = pairs.filter((p) => p.baseSymbol && allowed.has(p.baseSymbol.marketType));
      // Level pairs win: if the user's level explicitly grants pairs, restrict to those.
      const levelPairIds = await this.levelService.getUserAllowedPairIds(user.id);
      if (levelPairIds.length > 0) {
        const levelSet = new Set(levelPairIds);
        visible = visible.filter((p) => levelSet.has(p.id));
      }
    } else {
      visible = pairs;
    }

    return { data: visible.map((p) => this.toMarketView(p)) };
  }

  // Mirrors MarketService/PairPriceConsumer: the price the user trades at is the
  // best price adjusted for commission and the base symbol's gain. Keeping this
  // identical means the REST snapshot matches what arrives over the socket.
  private toMarketView(p: PricePairEntity) {
    const buyCommission = parseFloat(p.buyCommission as any) || 0;
    const sellCommission = parseFloat(p.sellCommission as any) || 0;
    const baseGain = parseFloat((p.baseSymbol?.gain as any) ?? 0) || 0;
    const baseGainType = p.baseSymbol?.gainType || GainTypeEnum.NUMBER;
    const bestBuyPrice = parseFloat(p.bestBuyPrice as any) || 0;
    const bestSellPrice = parseFloat(p.bestSellPrice as any) || 0;

    const gainAdjBuy = baseGainType === GainTypeEnum.PERCENT ? (bestBuyPrice * baseGain) / 100 : baseGain;
    const gainAdjSell = baseGainType === GainTypeEnum.PERCENT ? (bestSellPrice * baseGain) / 100 : baseGain;

    const displayBuyPrice = Math.max(0, bestBuyPrice * (1 + buyCommission / 100) + gainAdjBuy);
    const displaySellPrice = Math.max(0, bestSellPrice * (1 - sellCommission / 100) - gainAdjSell);

    return {
      id: p.id,
      pairKey: `${p.baseSymbol?.slug}-${p.quoteSymbol?.slug}`,
      baseSymbol: p.baseSymbol
        ? { id: p.baseSymbol.id, name: p.baseSymbol.name, slug: p.baseSymbol.slug, picPath: p.baseSymbol.picPath }
        : null,
      quoteSymbol: p.quoteSymbol
        ? { id: p.quoteSymbol.id, name: p.quoteSymbol.name, slug: p.quoteSymbol.slug }
        : null,
      bestBuyPrice,
      bestSellPrice,
      displayBuyPrice,
      displaySellPrice,
      bestBuyGramPrice: bestBuyPrice / MESQAL_TO_GRAM,
      bestSellGramPrice: bestSellPrice / MESQAL_TO_GRAM,
      displayBuyGramPrice: displayBuyPrice / MESQAL_TO_GRAM,
      displaySellGramPrice: displaySellPrice / MESQAL_TO_GRAM,
      buyCommission,
      sellCommission,
      minBuy: parseFloat(p.minBuy as any) || 0,
      maxBuy: parseFloat(p.maxBuy as any) || 0,
      minSell: parseFloat(p.minSell as any) || 0,
      maxSell: parseFloat(p.maxSell as any) || 0,
      decimals: p.decimals ?? 2,
      marketType: p.baseSymbol?.marketType,
      lastUpdated: p.lastUpdated,
      buyWarnHours: p.buyWarnHours ?? null,
      buyExpireHours: p.buyExpireHours ?? null,
      buyGraceHours: p.buyGraceHours ?? null,
      sellWarnHours: p.sellWarnHours ?? null,
      sellExpireHours: p.sellExpireHours ?? null,
      sellGraceHours: p.sellGraceHours ?? null,
    };
  }
}
