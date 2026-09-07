import { buildTalaabTradeBody } from './provider-order.service';
import { CurrencyUnit, fromRial, toRial } from '../common/currency-unit';

/**
 * The unit boundary on the way out to a provider.
 *
 * Everything inside the engine is Rial, because each provider's quote is
 * converted on ingest. Talaab's trade API is spoken to in Toman and takes the
 * unit as a field, so the value and the declaration have to agree — a Rial
 * figure labelled Toman submits the order at ten times the price.
 */
describe("Talaab trade body", () => {
  const request = (price: number) =>
    buildTalaabTradeBody({
      providerKey: "talaab",
      itemId: 3,
      dealType: 0,
      count: 1.5,
      price,
    } as any);

  it("sends Toman for a Rial price, matching the unit it declares", () => {
    const body = request(450_000_000);
    expect(body.price_unit).toBe("toman");
    expect(body.current_price).toBe("45000000");
  });

  it("round-trips whatever the ingest conversion produced", () => {
    // A provider quoting 45,000,000 toman is stored as 450,000,000 rial; the
    // order must leave as the same figure the provider originally quoted.
    const quoted = 45_000_000;
    const stored = toRial(quoted, CurrencyUnit.TOMAN);
    expect(request(stored).current_price).toBe(String(quoted));
  });

  it("passes a rial-quoting provider's price through the same conversion", () => {
    // The declaration is what the value must match — not the provider's own
    // quoting unit, which ingest has already normalized away.
    expect(fromRial(450_000_000, CurrencyUnit.TOMAN)).toBe(45_000_000);
  });

  it("maps buy to trade_type 1 and sell to 0", () => {
    expect(request(10).trade_type).toBe("1");
    expect(
      buildTalaabTradeBody({ providerKey: "t", itemId: 1, dealType: 1, count: 1, price: 10 } as any)
        .trade_type,
    ).toBe("0");
  });

  it("keeps the traded weight untouched — only money carries a unit", () => {
    expect(request(10).weight).toBe("1.5");
  });
});
