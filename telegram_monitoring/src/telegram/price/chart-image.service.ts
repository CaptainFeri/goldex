import { Injectable } from '@nestjs/common';
import { StructuredLogger } from '../../logger/structured-logger';
import { ArbitrageOpportunity, PriceSnapshot } from './price.types';

/**
 * Renders the price chart for an arbitrage bucket to a PNG via QuickChart
 * (https://quickchart.io). Self-hostable: point QUICKCHART_URL at your own
 * instance so data never leaves your network.
 *
 * The Chart.js config is built with English labels on purpose — QuickChart's
 * default fonts don't shape Persian/RTL text well; the full Persian context
 * lives in the message caption instead.
 */
@Injectable()
export class ChartImageService {
  private readonly logger = new StructuredLogger(ChartImageService.name);
  private readonly baseUrl = (
    process.env.QUICKCHART_URL ?? 'https://quickchart.io'
  ).replace(/\/+$/, '');

  /** Builds the QuickChart request payload (pure — unit-testable offline). */
  buildPayload(
    opportunity: ArbitrageOpportunity,
    snapshots: readonly PriceSnapshot[],
  ): Record<string, unknown> {
    const sorted = [...snapshots].sort((a, b) => a.date - b.date);
    const labels = sorted.map((s) => timeLabel(s.date));

    const line = (
      action: 'WE_BUY' | 'WE_SELL',
      label: string,
      color: string,
    ) => ({
      label,
      data: sorted.map((s) => (s.ourAction === action ? s.price : null)),
      borderColor: color,
      backgroundColor: color,
      spanGaps: true,
      pointRadius: 2,
      borderWidth: 2,
      tension: 0.15,
    });

    const mark = (snapshot: PriceSnapshot, label: string, color: string) => {
      const idx = sorted.findIndex((s) => s.messageId === snapshot.messageId);
      if (idx < 0) return undefined;
      return {
        label,
        data: sorted.map((_, i) => (i === idx ? snapshot.price : null)),
        borderColor: color,
        backgroundColor: color,
        pointRadius: 7,
        pointStyle: 'rectRot',
        showLine: false,
      };
    };

    const datasets: unknown[] = [
      line('WE_BUY', 'We Buy', '#3ddc84'),
      line('WE_SELL', 'We Sell', '#e0524a'),
    ];
    const buyMark = mark(opportunity.buy, 'Buy ▲', '#1f9d57');
    const sellMark = mark(opportunity.sell, 'Sell ▼', '#b23a33');
    if (buyMark) datasets.push(buyMark);
    if (sellMark) datasets.push(sellMark);

    const title =
      `Buy ${fmt(opportunity.buy.price)} -> Sell ${fmt(opportunity.sell.price)}` +
      `  (+${fmt(opportunity.spread)})`;

    return {
      width: 760,
      height: 380,
      devicePixelRatio: 2,
      format: 'png',
      backgroundColor: '#11151c',
      version: '4',
      chart: {
        type: 'line',
        data: { labels, datasets },
        options: {
          plugins: {
            title: { display: true, text: title, color: '#e6e6e6' },
            legend: { labels: { color: '#cbd3df' } },
          },
          scales: {
            x: { ticks: { color: '#9aa4b2' }, grid: { color: '#222a36' } },
            y: { ticks: { color: '#9aa4b2' }, grid: { color: '#222a36' } },
          },
        },
      },
    };
  }

  /** Renders the chart to a PNG buffer; throws on network/HTTP failure. */
  async render(
    opportunity: ArbitrageOpportunity,
    snapshots: readonly PriceSnapshot[],
  ): Promise<Buffer> {
    const payload = this.buildPayload(opportunity, snapshots);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);
    try {
      const res = await fetch(`${this.baseUrl}/chart`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      if (!res.ok) {
        throw new Error(`QuickChart responded ${res.status}`);
      }
      return Buffer.from(await res.arrayBuffer());
    } finally {
      clearTimeout(timeout);
    }
  }
}

function fmt(value: number): string {
  return value.toLocaleString('en-US');
}

function timeLabel(unixSeconds: number): string {
  return new Date(unixSeconds * 1000).toLocaleTimeString('en-GB');
}
