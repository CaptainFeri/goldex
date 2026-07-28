import { Controller, Get, MessageEvent, Query, Sse } from '@nestjs/common';
import { Observable, map } from 'rxjs';
import { PricePersistenceService } from './price-persistence.service';
import { MarketMakerService } from './market-maker.service';
import type {
  MarketOpportunityType,
  MarketState,
  OpportunityRecord,
  OurAction,
  PricePoint,
  PriceQuery,
  PriceSubType,
} from './price.types';

@Controller('api/prices')
export class PriceController {
  constructor(private readonly persistence: PricePersistenceService) {}

  @Get()
  list(
    @Query('subType') subType?: string,
    @Query('deliveryType') deliveryType?: string,
    @Query('action') action?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('limit') limit?: string,
  ): PricePoint[] {
    const filter: PriceQuery = {
      subType: subType as PriceSubType | undefined,
      deliveryType: deliveryType || undefined,
      action: action as OurAction | undefined,
      from: from ? Number(from) : undefined,
      to: to ? Number(to) : undefined,
      limit: limit ? Number(limit) : undefined,
    };
    return this.persistence.query(filter);
  }

  @Get('filters')
  filters() {
    return this.persistence.filters();
  }

  @Sse('stream')
  stream(): Observable<MessageEvent> {
    return this.persistence.stream.pipe(map((point) => ({ data: point })));
  }
}

@Controller('api/market')
export class MarketMakerController {
  constructor(private readonly market: MarketMakerService) {}

  @Get()
  overview(): MarketState[] {
    return this.market.getMarketOverview();
  }

  @Get('best-buys')
  bestBuys(@Query('limit') limit?: string): MarketState[] {
    return this.market.getBestBuys(limit ? Number(limit) : 10);
  }

  @Get('best-sells')
  bestSells(@Query('limit') limit?: string): MarketState[] {
    return this.market.getBestSells(limit ? Number(limit) : 10);
  }
}

@Controller('api/opportunities')
export class OpportunityController {
  constructor(private readonly market: MarketMakerService) {}

  @Get()
  list(
    @Query('type') type?: string,
    @Query('deliveryType') deliveryType?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ): OpportunityRecord[] {
    return this.market.getOpportunities({
      type: type as MarketOpportunityType | undefined,
      deliveryType: deliveryType || undefined,
      from: from ? Number(from) : undefined,
      to: to ? Number(to) : undefined,
    });
  }

  @Get('summary')
  summary(
    @Query('from') from?: string,
    @Query('to') to?: string,
  ) {
    return this.market.getSummary({
      from: from ? Number(from) : undefined,
      to: to ? Number(to) : undefined,
    });
  }
}
