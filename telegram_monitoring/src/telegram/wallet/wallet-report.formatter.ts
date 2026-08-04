import { MITHQALS_PER_KILO } from '../price/price.types';
import type { TradeRecord, WalletSnapshot } from './wallet.types';

function formatPrice(value: number): string {
  return value.toLocaleString('en-US');
}

function formatKg(value: number): string {
  return `${value.toLocaleString('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 3,
  })} کیلوگرم`;
}

/** Tehran (Asia/Tehran) time — the market's local zone. */
function formatDateTime(unixSeconds: number): string {
  return new Date(unixSeconds * 1000).toLocaleString('fa-IR', {
    timeZone: 'Asia/Tehran',
  });
}

const SIDE_LABELS: Record<TradeRecord['side'], string> = {
  BUY: '⬇️ خرید',
  SELL: '⬆️ فروش',
};

const SOURCE_LABELS: Record<TradeRecord['source'], string> = {
  ARBITRAGE: 'آربیتراژ',
  MARKET_MAKER: 'مارکت میکر',
  REBALANCE: 'تعادل دارایی',
};

function kgToMesqal(kg: number): number {
  return kg * MITHQALS_PER_KILO;
}

function formatTrade(trade: TradeRecord): string[] {
  const lines = [
    `${SIDE_LABELS[trade.side]} ${formatKg(trade.quantityKg)} @ ${formatPrice(trade.price)} (مثقال)`,
    `   💵 ${trade.side === 'BUY' ? 'هزینه' : 'درآمد'}: ${formatPrice(trade.amount)} تومان`,
  ];
  if (trade.profit > 0) {
    lines.push(`   💰 سود: ${formatPrice(trade.profit)} تومان`);
  }
  if (!trade.executed) {
    lines.push(`   ⛔️ اجرا نشد: ${trade.reason ?? 'موجودی کافی نیست'}`);
  }
  return lines;
}

export function formatWalletTradeReport(
  trades: TradeRecord[],
  snapshot: WalletSnapshot,
): string {
  const first = trades[0];
  const lines = [
    '🤖 گزارش ربات — سفارش شبیه‌سازی',
    `🏷 نماد: ${first?.symbol ?? 'نامشخص'} (عادی)`,
    `🕐 زمان: ${formatDateTime(first?.date ?? Math.floor(Date.now() / 1000))}`,
    `🔗 منبع سیگنال: ${first ? SOURCE_LABELS[first.source] : '-'}`,
    '',
    ...trades.flatMap((t) => formatTrade(t)),
  ];

  if (trades.some((t) => t.executed)) {
    const profit = trades.reduce((sum, t) => sum + t.profit, 0);
    if (profit !== 0) {
      lines.push('', `💰 سود معامله: ${formatPrice(profit)} تومان`);
    }
    lines.push('', '📊 وضعیت کیف پول:');
    for (const s of snapshot.symbols) {
      lines.push(`   • ${s.symbol}: ${formatKg(s.goldKg)}`);
    }
    lines.push(`   • موجودی ریال: ${formatPrice(snapshot.irrBalance)} تومان`);
    lines.push(
      `   • سود کل تحقق‌یافته: ${formatPrice(snapshot.totalRealizedProfit)} تومان`,
    );
  }

  return lines.join('\n');
}

export function formatWalletStatusReport(snapshot: WalletSnapshot): string {
  const profit = snapshot.totalRealizedProfit;
  const profitLabel =
    profit >= 0
      ? `💰 سود کل تحقق‌یافته: +${formatPrice(profit)} تومان`
      : `📉 زیان کل تحقق‌یافته: ${formatPrice(profit)} تومان`;

  const lines = [
    '📊 گزارش وضعیت کیف پول ربات',
    `🕐 زمان: ${formatDateTime(Math.floor(Date.now() / 1000))}`,
    '',
    `💵 موجودی ریال: ${formatPrice(snapshot.irrBalance)} تومان`,
    `💼 ارزش داراییها (نقد + بهای تمامشده طلا): ${formatPrice(snapshot.equity)} تومان`,
    `🛡 ذخیره نقدی: ${formatPrice(snapshot.cashReserve)} تومان`,
    `⚡ قدرت خرید: ${formatPrice(snapshot.buyingPower)} تومان`,
    profitLabel,
    `🔢 تعداد معاملات اجراشده: ${snapshot.trades.filter((t) => t.executed).length}`,
    '',
    '🏷 نمادها (عادی):',
  ];

  if (snapshot.symbols.length === 0) {
    lines.push('   (هنوز نمادی دیده نشده است)');
  } else {
    for (const s of snapshot.symbols) {
      const costLabel =
        s.lots.length > 0
          ? ` — تعداد سهم‌ها: ${s.lots.length}`
          : ' — (بدون موجودی)';
      lines.push(`   • ${s.symbol}: ${formatKg(s.goldKg)}${costLabel}`);
    }
  }

  return lines.join('\n');
}

export { kgToMesqal };
