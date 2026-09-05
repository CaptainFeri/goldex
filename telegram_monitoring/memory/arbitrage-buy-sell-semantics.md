---
name: arbitrage-buy-sell-semantics
description: Inverted خرید/فروش meaning for the telegram_monitoring arbitrage robot
metadata:
  type: project
---

In the telegram_monitoring price channels, the labels are from the source's perspective, so they invert for us:
- **خرید** (their "buy") = the price at which **WE can SELL** to them.
- **فروش** (their "sell") = the price at which **WE can BUY** from them.

Arbitrage opportunity = some source's `فروش` (our buy cost) < another source's `خرید` (our sell proceeds) for the same category.

Categories have sub-categories identified by **شنا و معکوس** (swap & reverse) in the description.

**Why:** User stated this explicitly and confirmed via a clarifying question on 2026-06-29; the literal translation (خرید=buy) is the opposite of what applies to us.
**How to apply:** When building opportunity detection, treat فروش as our buy-side and خرید as our sell-side. Implemented in `src/telegram/price/` — parser (`price-message.parser.ts`), in-memory history + arbitrage (`price-history.service.ts`), target formatter (`price-message.formatter.ts`). Message format: `{price} {🔵خرید|🔴فروش}{emoji}{deliveryType} {N} تا {شنا|معکوس?}` + optional `توضیحات ❗️ : {desc}` line. Sub-types شنا/معکوس are the category buckets; arbitrage compares within sub-type + deliveryType.
