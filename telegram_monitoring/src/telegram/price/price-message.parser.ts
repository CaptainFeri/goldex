import { ParsedPrice, OurAction, PriceSubType } from './price.types';

/** Strips pictographic emojis + variation selectors and collapses whitespace. */
function stripEmojis(input: string): string {
  return input
    .replace(/[\p{Extended_Pictographic}️‌‏‎]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Matches a cleaned first line, e.g. "74,000,000 خرید با حواله 1 تا شنا".
 *   1: price digits w/ commas
 *   2: side label (خرید | فروش)
 *   3: delivery descriptor (lazy)
 *   4: quantity
 *   5: optional sub-type keyword
 */
const PRICE_LINE =
  /^([\d,]+)\s*(خرید|فروش)\s*(.*?)\s*(\d+)\s*تا\s*(شنا|معکوس)?\s*$/u;

const SUBTYPE_BY_KEYWORD: Record<string, PriceSubType> = {
  شنا: 'shena',
  معکوس: 'makus',
};

/**
 * Parses a raw channel message into a {@link ParsedPrice}, or `null` if the
 * text is not a recognizable price post.
 */
export function parsePriceMessage(text: string | undefined): ParsedPrice | null {
  if (!text) return null;

  const lines = text.split('\n');
  const firstLine = stripEmojis(lines[0] ?? '');

  const match = PRICE_LINE.exec(firstLine);
  if (!match) return null;

  const [, priceRaw, sideLabel, deliveryRaw, quantityRaw, subKeyword] = match;

  const price = Number(priceRaw.replace(/,/g, ''));
  if (!Number.isFinite(price) || price <= 0) return null;

  const quantity = Number(quantityRaw) || 1;
  const deliveryType = deliveryRaw.trim() || 'نامشخص';
  const subType: PriceSubType = subKeyword
    ? (SUBTYPE_BY_KEYWORD[subKeyword] ?? 'normal')
    : 'normal';

  // خرید (their buy) → we sell; فروش (their sell) → we buy.
  const ourAction: OurAction = sideLabel === 'خرید' ? 'WE_SELL' : 'WE_BUY';

  return {
    price,
    sideLabel: sideLabel as ParsedPrice['sideLabel'],
    ourAction,
    subType,
    deliveryType,
    quantity,
    description: extractDescription(lines),
    raw: text,
  };
}

/** Pulls the text after `توضیحات ... :` from any following line. */
function extractDescription(lines: string[]): string | undefined {
  for (const line of lines.slice(1)) {
    const idx = line.indexOf('توضیحات');
    if (idx === -1) continue;
    const colon = line.indexOf(':', idx);
    const value = (colon === -1 ? line.slice(idx + 'توضیحات'.length) : line.slice(colon + 1))
      .replace(/[\p{Extended_Pictographic}️]/gu, '')
      .trim();
    if (value) return value;
  }
  return undefined;
}
