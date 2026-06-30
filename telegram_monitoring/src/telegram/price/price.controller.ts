import { Controller, Get, MessageEvent, Query, Sse } from '@nestjs/common';
import { Observable, map } from 'rxjs';
import { PricePersistenceService } from './price-persistence.service';
import { ArbitragePersistenceService } from './arbitrage-persistence.service';
import type {
  ArbitrageQuery,
  ArbitrageRecord,
  ArbitrageSummary,
  OurAction,
  PricePoint,
  PriceQuery,
  PriceSubType,
} from './price.types';

/** REST API backing the price chart frontend. */
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

  /** Live stream of new price points (Server-Sent Events). */
  @Sse('stream')
  stream(): Observable<MessageEvent> {
    return this.persistence.stream.pipe(map((point) => ({ data: point })));
  }
}

/** REST API for the realized arbitrage profit report. */
@Controller('api/arbitrages')
export class ArbitrageController {
  constructor(private readonly arbitrages: ArbitragePersistenceService) {}

  @Get()
  list(
    @Query('subType') subType?: string,
    @Query('deliveryType') deliveryType?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ): ArbitrageRecord[] {
    return this.arbitrages.query(this.toFilter(subType, deliveryType, from, to));
  }

  @Get('summary')
  summary(
    @Query('subType') subType?: string,
    @Query('deliveryType') deliveryType?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ): ArbitrageSummary {
    return this.arbitrages.summary(
      this.toFilter(subType, deliveryType, from, to),
    );
  }

  private toFilter(
    subType?: string,
    deliveryType?: string,
    from?: string,
    to?: string,
  ): ArbitrageQuery {
    return {
      subType: subType as PriceSubType | undefined,
      deliveryType: deliveryType || undefined,
      from: from ? Number(from) : undefined,
      to: to ? Number(to) : undefined,
    };
  }
}
