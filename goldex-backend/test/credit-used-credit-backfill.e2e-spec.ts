import { DataSource, QueryRunner } from "typeorm";
import { computeCreditUsage } from "../src/credit/util/credit-usage.util";
import { CreditUsedCreditNetMig1000000000108 } from "../src/migrations/1000000000108-creditUsedCreditNetMig";
import { MESQAL_TO_GRAM } from "../src/common/constants";

/**
 * The used-credit backfill is hand-written SQL that has to agree with
 * `computeCreditUsage` — which trades it counts, which price each side uses, and
 * the floor at zero. Nothing in the type system holds those two together, so
 * this runs the migration over seeded rows and compares every facility against
 * the TypeScript.
 *
 * It works in a schema of its own so it can never touch real tables, and defines
 * only the columns the migration reads.
 */

const SCHEMA = "backfill_spec";

interface Leg {
  side: "BUY" | "SELL";
  orderStatus: string;
  coStatus: string;
  quantity: number;
  executedQuantity: number;
  price: number | null;
  mesghalPrice: number | null;
  priceAtOrderTime: number | null;
}

function leg(over: Partial<Leg> & { side: Leg["side"]; quantity: number }): Leg {
  return {
    orderStatus: "COMPLETED",
    coStatus: "COMPLETED",
    executedQuantity: over.quantity,
    price: null,
    mesghalPrice: null,
    priceAtOrderTime: over.price ?? null,
    ...over,
  };
}

/** One facility per case, each exercising a branch of the netting rule. */
const CASES: Record<string, Leg[]> = {
  "a buy consumes the line": [leg({ side: "BUY", quantity: 50, price: 10 })],
  "a closed round trip frees it": [
    leg({ side: "BUY", quantity: 50, price: 10 }),
    leg({ side: "SELL", quantity: 50, price: 10 }),
  ],
  "a profitable round trip frees it": [
    leg({ side: "BUY", quantity: 50, price: 10 }),
    leg({ side: "SELL", quantity: 50, price: 12 }),
  ],
  "a losing round trip leaves the loss": [
    leg({ side: "BUY", quantity: 50, price: 10 }),
    leg({ side: "SELL", quantity: 50, price: 8 }),
  ],
  "a partly closed position partly consumes it": [
    leg({ side: "BUY", quantity: 50, price: 10 }),
    leg({ side: "SELL", quantity: 20, price: 10 }),
  ],
  "a short alone consumes nothing": [leg({ side: "SELL", quantity: 50, price: 10 })],
  "a sell is priced off mesghal": [
    leg({ side: "BUY", quantity: 50, price: 10 }),
    leg({ side: "SELL", quantity: 50, price: 9, mesghalPrice: 10 * MESQAL_TO_GRAM }),
  ],
  "an incomplete trade is ignored": [
    leg({ side: "BUY", quantity: 50, price: 10 }),
    leg({ side: "BUY", quantity: 20, price: 10, orderStatus: "PENDING", executedQuantity: 0 }),
  ],
  "a cashed-out trade is ignored": [
    leg({ side: "BUY", quantity: 50, price: 10 }),
    leg({ side: "BUY", quantity: 20, price: 10, coStatus: "CASHED_OUT" }),
  ],
  "a facility whose every trade was cashed out owes nothing": [
    leg({ side: "BUY", quantity: 50, price: 10, coStatus: "CASHED_OUT" }),
  ],
  "the price falls back to the credit link": [
    leg({ side: "BUY", quantity: 50, price: null, priceAtOrderTime: 10 }),
  ],
  "the quantity falls back to the ordered amount": [
    leg({ side: "BUY", quantity: 50, price: 10, executedQuantity: 0 }),
  ],
  "a leg with no price at all is skipped": [
    leg({ side: "BUY", quantity: 50, price: 10 }),
    leg({ side: "BUY", quantity: 20, price: null, priceAtOrderTime: null }),
  ],
  "a facility that never traded owes nothing": [],
};

const NAMES = Object.keys(CASES);
const creditIdFor = (name: string) =>
  `000000${String(100 + NAMES.indexOf(name)).padStart(2, "0")}-0000-4000-8000-000000000000`.slice(-36);

/** What computeCreditUsage makes of the same rows. */
function expectedNet(rows: Leg[]): number {
  return computeCreditUsage(
    rows.map((l) => ({
      status: l.coStatus,
      priceAtOrderTime: l.priceAtOrderTime,
      order: {
        status: l.orderStatus,
        side: l.side,
        price: l.price,
        mesghalPrice: l.mesghalPrice,
        quantity: l.quantity,
        executedQuantity: l.executedQuantity,
      },
    })),
  ).usedCredit;
}

/** The side-agnostic sum the column held before the migration. */
function expectedGross(rows: Leg[]): number {
  return rows
    .filter((l) => l.orderStatus === "COMPLETED" && l.coStatus !== "CASHED_OUT")
    .reduce((total, l) => {
      const qty = l.executedQuantity > 0 ? l.executedQuantity : l.quantity;
      const price = l.price || l.priceAtOrderTime || 0;
      return total + (qty > 0 && price > 0 ? qty * price : 0);
    }, 0);
}

describe("used-credit backfill migration", () => {
  let ds: DataSource;
  let q: QueryRunner;
  const migration = new CreditUsedCreditNetMig1000000000108();

  beforeAll(async () => {
    ds = new DataSource({
      type: "postgres",
      host: process.env.GOLDEX_AUTH_POSTGRES_URL ?? "localhost",
      port: parseInt(process.env.GOLDEX_AUTH_POSTGRES_INTERNAL_PORT ?? "55432", 10),
      username: process.env.GOLDEX_AUTH_POSTGRES_USERNAME ?? "postgres",
      password: process.env.GOLDEX_AUTH_POSTGRES_PASSWORD ?? "postgres",
      database: process.env.GOLDEX_AUTH_POSTGRES_DBNAME ?? "backend_e2e",
      synchronize: false,
      logging: false,
      // Unqualified names in the migration resolve here, never to real tables.
      schema: SCHEMA,
    });
    await ds.initialize();
    q = ds.createQueryRunner();

    await q.query(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`);
    await q.query(`CREATE SCHEMA ${SCHEMA}`);
    await q.query(`SET search_path TO ${SCHEMA}`);
    await q.query(`
      CREATE TABLE credit (
        id uuid PRIMARY KEY,
        used_credit numeric(20,8) NOT NULL DEFAULT 0
      )`);
    await q.query(`
      CREATE TABLE "order" (
        id uuid PRIMARY KEY,
        side text NOT NULL,
        status text NOT NULL,
        quantity numeric(20,8),
        executed_quantity numeric(20,8) DEFAULT 0,
        price numeric(20,8),
        mesghal_price numeric(20,8)
      )`);
    await q.query(`
      CREATE TABLE credit_order (
        id uuid PRIMARY KEY,
        credit_id uuid NOT NULL,
        order_id uuid,
        status text NOT NULL,
        price_at_order_time numeric(20,8)
      )`);

    let seq = 0;
    for (const name of NAMES) {
      // Seeded deliberately wrong, so a migration that did nothing would fail.
      await q.query(`INSERT INTO credit (id, used_credit) VALUES ($1, 999999)`, [creditIdFor(name)]);
      for (const l of CASES[name]) {
        const orderId = `000000${String(1000 + seq)}-0000-4000-8000-000000000000`.slice(-36);
        const coId = `000000${String(5000 + seq)}-0000-4000-8000-000000000000`.slice(-36);
        seq += 1;
        await q.query(
          `INSERT INTO "order" (id, side, status, quantity, executed_quantity, price, mesghal_price)
           VALUES ($1,$2,$3,$4,$5,$6,$7)`,
          [orderId, l.side, l.orderStatus, l.quantity, l.executedQuantity, l.price, l.mesghalPrice],
        );
        await q.query(
          `INSERT INTO credit_order (id, credit_id, order_id, status, price_at_order_time)
           VALUES ($1,$2,$3,$4,$5)`,
          [coId, creditIdFor(name), orderId, l.coStatus, l.priceAtOrderTime],
        );
      }
    }
  });

  afterAll(async () => {
    if (q) {
      await q.query(`DROP SCHEMA IF EXISTS ${SCHEMA} CASCADE`);
      await q.release();
    }
    if (ds?.isInitialized) await ds.destroy();
  });

  const usedCredit = async (name: string): Promise<number> => {
    const rows: Array<{ used_credit: string }> = await q.query(
      `SELECT used_credit FROM credit WHERE id = $1`,
      [creditIdFor(name)],
    );
    return Number(rows[0]?.used_credit);
  };

  describe("up()", () => {
    beforeAll(async () => {
      await migration.up(q);
    });

    it.each(NAMES)("matches computeCreditUsage when %s", async (name) => {
      expect(await usedCredit(name)).toBeCloseTo(expectedNet(CASES[name]), 6);
    });

    it("leaves no facility on its seeded placeholder", async () => {
      const rows: Array<{ count: string }> = await q.query(
        `SELECT COUNT(*) AS count FROM credit WHERE used_credit = 999999`,
      );
      expect(Number(rows[0].count)).toBe(0);
    });
  });

  describe("down()", () => {
    beforeAll(async () => {
      await migration.down(q);
    });

    it.each(NAMES)("restores the gross sum when %s", async (name) => {
      expect(await usedCredit(name)).toBeCloseTo(expectedGross(CASES[name]), 6);
    });
  });
});
