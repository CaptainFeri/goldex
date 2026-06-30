import {
  ArbitrageOpportunity,
  PriceSnapshot,
  SUBTYPE_LABELS,
} from './price.types';

/** Groups 3-digit thousands for readability: 74000000 -> "74,000,000". */
function formatPrice(value: number): string {
  return value.toLocaleString('en-US');
}

/**
 * Order id is the 3rd field of the callback data, e.g.
 * "grp|ord|574929|602|1" -> "574929".
 */
function orderId(snapshot: PriceSnapshot): string | undefined {
  return snapshot.orderButton?.data?.split('|')[2];
}

/**
 * Deep link to the source message so the operator can open it and press the
 * real (bot-owned) order button there. User accounts can't send inline
 * buttons, so this link is how an order gets placed.
 *
 * "-1003944865897" -> "https://t.me/c/3944865897/<messageId>"
 */
function messageLink(snapshot: PriceSnapshot): string | undefined {
  const match = /^-?100(\d+)$/.exec(snapshot.chatId ?? '');
  if (!match) return undefined;
  return `https://t.me/c/${match[1]}/${snapshot.messageId}`;
}

/** Renders one side (buy/sell) of the opportunity with its order details. */
function formatOrder(title: string, snapshot: PriceSnapshot): string[] {
  const lines = [
    title,
    `   💰 قیمت: ${formatPrice(snapshot.price)}`,
    `   📦 تعداد: ${snapshot.quantity}`,
    `   🚚 تحویل: ${snapshot.deliveryType}`,
  ];
  const id = orderId(snapshot);
  if (id) lines.push(`   🧾 سفارش: ${id}`);
  if (snapshot.description) lines.push(`   📝 ${snapshot.description}`);
  return lines;
}

/**
 * Builds the arbitrage report sent to the target channel, detailing both
 * orders plus tap-to-open links for placing each one.
 *
 * Semantics reminder: خرید = a price we can SELL at, فروش = a price we can BUY
 * at. We buy the lowest فروش and sell the highest خرید in the same bucket.
 */
export function formatArbitrageMessage(opportunity: ArbitrageOpportunity): string {
  const lines = [
    '⚡️ فرصت آربیتراژ',
    `🏷 دسته: ${SUBTYPE_LABELS[opportunity.subType]}`,
    '',
    ...formatOrder('⬇️ خرید (ما می‌خریم)', opportunity.buy),
    '',
    ...formatOrder('⬆️ فروش (ما می‌فروشیم)', opportunity.sell),
    '',
    `📈 سود هر واحد: ${formatPrice(opportunity.spread)}`,
    `🔢 حجم قابل اجرا: ${opportunity.quantity}`,
    `💵 سود کل: ${formatPrice(opportunity.totalProfit)}`,
  ];

  const buyLink = messageLink(opportunity.buy);
  const sellLink = messageLink(opportunity.sell);
  if (buyLink || sellLink) {
    lines.push('', '🛒 ثبت سفارش:');
    if (buyLink) lines.push(`🟢 خرید 👈 ${buyLink}`);
    if (sellLink) lines.push(`🔴 فروش 👈 ${sellLink}`);
  }

  return lines.join('\n');
}
