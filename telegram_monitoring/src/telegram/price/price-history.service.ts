import { Injectable } from '@nestjs/common';
import {
  OrderButton,
  ParsedPrice,
  PriceSnapshot,
} from './price.types';

const MAX_PER_CATEGORY = 1000;

@Injectable()
export class PriceHistoryService {
  private readonly history = new Map<string, PriceSnapshot[]>();

  categoryKeyFor(parsed: ParsedPrice): string {
    return parsed.subType;
  }

  record(
    parsed: ParsedPrice,
    messageId: number,
    date: number,
    orderButton?: OrderButton,
    chatId?: string,
  ): PriceSnapshot {
    const categoryKey = this.categoryKeyFor(parsed);
    const snapshot: PriceSnapshot = {
      ...parsed,
      messageId,
      date,
      categoryKey,
      chatId,
      orderButton,
    };

    const bucket = this.history.get(categoryKey) ?? [];
    bucket.push(snapshot);
    if (bucket.length > MAX_PER_CATEGORY) bucket.shift();
    this.history.set(categoryKey, bucket);

    return snapshot;
  }

  getHistory(categoryKey: string): readonly PriceSnapshot[] {
    return this.history.get(categoryKey) ?? [];
  }
}
