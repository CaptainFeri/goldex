import { Injectable } from '@nestjs/common';
import { StructuredLogger } from '../../logger/structured-logger';
import { ArbitrageOpportunity, PriceSnapshot } from './price.types';

/** One sample of the wallet's asset mix for the assets chart. */
export interface WalletChartPoint {
  /** Unix seconds. */
  date: number;
  /** Cash balance in Toman. */
  cash: number;
  /** Mark-to-market value of held gold in Toman. */
  goldValue: number;
}

@Injectable()
export class ChartImageService {
  private readonly logger = new StructuredLogger(ChartImageService.name);
  private readonly baseUrl = (
    process.env.QUICKCHART_URL ?? 'https://quickchart.io'
  ).replace(/\/+$/, '');

  buildPayload(
    snapshots: readonly PriceSnapshot[],
    title?: string,
    opportunity?: ArbitrageOpportunity,
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

    const datasets: unknown[] = [
      line('WE_BUY', 'We Buy', '#3ddc84'),
      line('WE_SELL', 'We Sell', '#e0524a'),
    ];

    let chartTitle = title;
    if (opportunity) {
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

      const buyMark = mark(opportunity.buy, 'Buy ▲', '#1f9d57');
      const sellMark = mark(opportunity.sell, 'Sell ▼', '#b23a33');
      if (buyMark) datasets.push(buyMark);
      if (sellMark) datasets.push(sellMark);

      chartTitle =
        `Buy ${fmt(opportunity.buy.price)} -> Sell ${fmt(opportunity.sell.price)}` +
        `  (+${fmt(opportunity.spread)})`;
    }

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
            title: chartTitle
              ? { display: true, text: chartTitle, color: '#e6e6e6' }
              : undefined,
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

  /** Wallet assets chart: cash, gold value and equity over time. */
  buildWalletPayload(
    points: readonly WalletChartPoint[],
    title: string,
  ): Record<string, unknown> {
    const sorted = [...points].sort((a, b) => a.date - b.date);
    const labels = sorted.map((p) => timeLabel(p.date));

    const line = (label: string, data: (number | null)[], color: string) => ({
      label,
      data,
      borderColor: color,
      backgroundColor: color,
      spanGaps: true,
      pointRadius: 1,
      borderWidth: 2,
      tension: 0.15,
    });

    const datasets = [
      line(
        'Cash',
        sorted.map((p) => p.cash),
        '#3ddc84',
      ),
      line(
        'Gold Value',
        sorted.map((p) => p.goldValue),
        '#ffd34d',
      ),
      line(
        'Equity',
        sorted.map((p) => p.cash + p.goldValue),
        '#4aa3ff',
      ),
    ];

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

  /** Renders the wallet assets chart (Cash / Gold Value / Equity). */
  async renderWalletChart(
    points: readonly WalletChartPoint[],
    title: string,
  ): Promise<Buffer> {
    return this.postChart(this.buildWalletPayload(points, title));
  }

  async render(
    snapshots: readonly PriceSnapshot[],
    title?: string,
    opportunity?: ArbitrageOpportunity,
  ): Promise<Buffer> {
    return this.postChart(this.buildPayload(snapshots, title, opportunity));
  }

  private async postChart(payload: Record<string, unknown>): Promise<Buffer> {
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

function timeLabel(unixSeconds: number): string {
  return new Date(unixSeconds * 1000).toLocaleTimeString('en-GB', {
    timeZone: 'Asia/Tehran',
  });
}

function fmt(value: number): string {
  return value.toLocaleString('en-US');
}
