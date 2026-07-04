import { Controller, Get, Req, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { AdminPairService } from "./admin-pair.service";
import { PricePairEntity } from "./entity/price.pair.entity";
import { GainTypeEnum } from "../admin-symbol/enum/gain.type.enum";
import { MarketTypeEnum } from "./enum/market.type.enum";
import { MESQAL_TO_GRAM } from "../common/constants";
import { UserAuthGuard } from "../user/auth/Guard/user.guard";
import { UserRoleEnum } from "../shared/enum/user.role.enum";
import { UserExpressRequest } from "../user/auth/types/user-express-request";
import { UserMarketTypeEntity } from "../user/entity/user.market.type.entity";

@ApiTags("Market")
@ApiBearerAuth()
@UseGuards(UserAuthGuard)
@Controller("market")
export class MarketController {
  constructor(
    private readonly pairService: AdminPairService,
    @InjectRepository(UserMarketTypeEntity)
    private readonly userMarketTypeRepo: Repository<UserMarketTypeEntity>,
  ) {}

  @Get("pairs")
  @ApiOperation({ summary: "List valid trading pairs with user-facing prices" })
  async getPairs(@Req() req: UserExpressRequest) {
    const pairs = await this.pairService.findValidWithSymbols();
    const user = req.user;
    let visible: PricePairEntity[];

    if (user) {
      const userMts = await this.userMarketTypeRepo.find({ where: { userId: user.id } });
      if (userMts.length > 0) {
        const allowed = new Set(userMts.map((r) => r.marketType));
        visible = pairs.filter((p) => allowed.has(p.marketType));
      } else {
        // Fallback: no explicit assignment — use legacy role-based logic
        visible = user.role === UserRoleEnum.PARTNER
          ? pairs
          : pairs.filter((p) => p.marketType === MarketTypeEnum.FORMAL);
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
      // raw best prices (reference)
      bestBuyPrice,
      bestSellPrice,
      // user-facing prices (what the socket also streams)
      displayBuyPrice,
      displaySellPrice,
      // per-gram equivalents (mesghal → gram)
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
      marketType: p.marketType,
      lastUpdated: p.lastUpdated,
    };
  }
}
