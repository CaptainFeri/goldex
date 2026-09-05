import * as fs from 'node:fs';
import { ChartImageService } from '../telegram/price/chart-image.service';
import { PriceSnapshot } from '../telegram/price/price.types';

function snap(over: Partial<PriceSnapshot>): PriceSnapshot {
  return {
    price: 0,
    sideLabel: 'فروش',
    ourAction: 'WE_BUY',
    subType: 'shena',
    deliveryType: 'با حواله',
    quantity: 1,
    raw: '',
    messageId: 0,
    date: 0,
    categoryKey: 'shena',
    ...over,
  };
}

const base = Math.floor(Date.now() / 1000) - 300;
const snapshots: PriceSnapshot[] = [];
for (let i = 0; i < 12; i++) {
  snapshots.push(
    snap({
      messageId: 100 + i,
      date: base + i * 25,
      price: 73_800_000 + (i % 4) * 25_000,
      ourAction: 'WE_BUY',
      sideLabel: 'فروش',
    }),
  );
  snapshots.push(
    snap({
      messageId: 200 + i,
      date: base + i * 25 + 10,
      price: 73_950_000 + (i % 3) * 20_000,
      ourAction: 'WE_SELL',
      sideLabel: 'خرید',
    }),
  );
}

async function main() {
  const service = new ChartImageService();
  const png = await service.render(snapshots, 'Preview: Buy/Sell prices');
  fs.writeFileSync('chart-preview.png', png);
  console.log(`Wrote chart-preview.png (${png.length} bytes)`);
}

main().catch((err) => {
  console.error('Preview failed:', err);
  process.exit(1);
});
