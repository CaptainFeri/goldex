import * as XLSX from 'xlsx';
import { GRAMS_PER_MITHQAL } from '../price/price.types';
import type { OurAction } from '../price/price.types';
import type { TradeRecord, WalletSnapshot } from './wallet.types';

const SOURCE_LABELS: Record<TradeRecord['source'], string> = {
  ARBITRAGE: 'آربیتراژ',
  MARKET_MAKER: 'مارکت میکر',
  REBALANCE: 'تعادل دارایی',
};

const SIDE_LABELS: Record<TradeRecord['side'], string> = {
  BUY: 'خرید',
  SELL: 'فروش',
};

const ACTION_LABELS: Record<OurAction, string> = {
  WE_BUY: 'فروش ما',
  WE_SELL: 'خرید ما',
};

/** Tehran time as "YYYY-MM-DD HH:mm:ss" — practical for spreadsheets. */
function formatDateTime(unixSeconds: number): string {
  return new Date(unixSeconds * 1000).toLocaleString('sv-SE', {
    timeZone: 'Asia/Tehran',
  });
}

function statusSheet(snapshot: WalletSnapshot): XLSX.WorkSheet {
  const rows: (string | number)[][] = [
    ['گزارش کیف پول ربات'],
    ['زمان گزارش', formatDateTime(Math.floor(Date.now() / 1000))],
    ['موجودی ریال (تومان)', snapshot.irrBalance],
    ['ارزش دارایی‌ها (نقد + بهای تمام‌شده طلا)', snapshot.equity],
    ['ذخیره نقدی (تومان)', snapshot.cashReserve],
    ['قدرت خرید (تومان)', snapshot.buyingPower],
    ['سود کل تحقق‌یافته (تومان)', snapshot.totalRealizedProfit],
    ['تعداد معاملات اجراشده', snapshot.trades.filter((t) => t.executed).length],
    [],
    ['نماد', 'موجودی طلا (کیلوگرم)', 'تعداد سهم‌ها'],
  ];
  for (const s of snapshot.symbols) {
    rows.push([s.symbol, s.goldKg, s.lots.length]);
  }
  rows.push([]);
  rows.push(['جزئیات سهم‌ها', '', '', '']);
  rows.push([
    'نماد',
    'شناسه سهم',
    'بهای تمام‌شده هر کیلو (تومان)',
    'مقدار (کیلوگرم)',
  ]);
  for (const s of snapshot.symbols) {
    for (const lot of s.lots) {
      rows.push([s.symbol, lot.id, lot.pricePerKg, lot.qtyKg]);
    }
  }
  const sheet = XLSX.utils.aoa_to_sheet(rows);
  sheet['!cols'] = [{ wch: 18 }, { wch: 24 }, { wch: 24 }, { wch: 22 }];
  return sheet;
}

function ordersSheet(trades: TradeRecord[]): XLSX.WorkSheet {
  const rows: (string | number)[][] = [
    [
      'شناسه',
      'زمان',
      'منبع',
      'نماد',
      'سمت',
      'اقدام ما',
      'قیمت (گرم/تومان)',
      'مقدار (کیلوگرم)',
      'مبلغ (تومان)',
      'کمیسیون (تومان)',
      'سود (تومان)',
      'وضعیت',
      'دلیل',
    ],
  ];
  for (const t of trades) {
    rows.push([
      t.id,
      formatDateTime(t.date),
      SOURCE_LABELS[t.source],
      t.symbol,
      SIDE_LABELS[t.side],
      ACTION_LABELS[t.ourAction!],
      Math.round(t.price / GRAMS_PER_MITHQAL),
      t.quantityKg,
      t.amount,
      t.fee ?? 0,
      t.profit,
      t.executed ? 'اجراشده' : 'اجرا نشد',
      t.reason ?? '',
    ]);
  }
  const sheet = XLSX.utils.aoa_to_sheet(rows);
  sheet['!cols'] = [
    { wch: 8 },
    { wch: 20 },
    { wch: 14 },
    { wch: 14 },
    { wch: 10 },
    { wch: 10 },
    { wch: 16 },
    { wch: 12 },
    { wch: 16 },
    { wch: 14 },
    { wch: 14 },
    { wch: 10 },
    { wch: 40 },
  ];
  return sheet;
}

/** Builds an .xlsx buffer: wallet status sheet + orders (market maker & arbitrage). */
export function buildWalletExcel(
  snapshot: WalletSnapshot,
  trades: TradeRecord[],
): Buffer {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, statusSheet(snapshot), 'کیف پول');
  XLSX.utils.book_append_sheet(wb, ordersSheet(trades), 'سفارش‌ها');
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
}
