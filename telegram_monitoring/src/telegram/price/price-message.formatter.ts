import { MarketOpportunity } from './price.types';

function formatPrice(value: number): string {
  return value.toLocaleString('en-US');
}

const DIRECTION_LABELS: Record<string, string> = {
  UP: '📈 افزایش',
  DOWN: '📉 کاهش',
  FLAT: '➡️ ثابت',
};

const TYPE_LABELS: Record<string, string> = {
  PRICE_MOVEMENT: 'تغییر قیمت',
  BEST_PRICE: 'بهترین قیمت',
};

export function formatPriceMovementAlert(opportunity: MarketOpportunity): string {
  const direction = DIRECTION_LABELS[opportunity.direction] ?? opportunity.direction;
  const changeSign = opportunity.changePercent > 0 ? '+' : '';

  const lines = [
    `⚡️ ${TYPE_LABELS[opportunity.type]}`,
    `🏷 ${opportunity.deliveryType}`,
    `${direction}: ${formatPrice(opportunity.previousPrice)} → ${formatPrice(opportunity.price)}`,
    `📊 تغییر: ${changeSign}${opportunity.changePercent}%`,
    `📦 تعداد: ${opportunity.quantity}`,
  ];

  if (opportunity.description) {
    lines.push(`📝 ${opportunity.description}`);
  }

  return lines.join('\n');
}

export function formatBestPriceAlert(opportunity: MarketOpportunity): string {
  const direction = opportunity.direction === 'UP' ? 'بالاترین' : 'پایین‌ترین';

  const lines = [
    `🏆 ${direction} قیمت در ${opportunity.deliveryType}`,
    `💰 قیمت: ${formatPrice(opportunity.price)}`,
    `📦 تعداد: ${opportunity.quantity}`,
  ];

  if (opportunity.changePercent !== 0) {
    const changeSign = opportunity.changePercent > 0 ? '+' : '';
    lines.push(`📊 تغییر: ${changeSign}${opportunity.changePercent}% نسبت به قبلی`);
  }

  if (opportunity.description) {
    lines.push(`📝 ${opportunity.description}`);
  }

  return lines.join('\n');
}
