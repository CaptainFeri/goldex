import { Injectable } from '@nestjs/common';
import { StructuredLogger } from '../../logger/structured-logger';
import { PriceSnapshot } from './price.types';

@Injectable()
export class ChartImageService {
  private readonly logger = new StructuredLogger(ChartImageService.name);
  private readonly baseUrl = (
    process.env.QUICKCHART_URL ?? 'https://quickchart.io'
  ).replace(/\/+$/, '');

  buildPayload(
    snapshots: readonly PriceSnapshot[],
    title?: string,
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
            title: title ? { display: true, text: title, color: '#e6e6e6' } : undefined,
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

  async render(
    snapshots: readonly PriceSnapshot[],
    title?: string,
  ): Promise<Buffer> {
    const payload = this.buildPayload(snapshots, title);
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
  return new Date(unixSeconds * 1000).toLocaleTimeString('en-GB');
}
