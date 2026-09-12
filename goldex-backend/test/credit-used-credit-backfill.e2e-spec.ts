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
/** Holds the enum that has not learned CASHED_OUT yet — see the transaction test. */
const TX_SCHEMA = "backfill_tx_spec";

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
    // Real Postgres enums, as production has them — not text columns. The
    // difference matters: an enum literal in the migration has to be resolved
    // against the type, and that is what fails when the label was added earlier
    // in the same transaction. CASHED_OUT is deliberately left out here and
    // added below, reproducing a database catching up through 1000000000089 and
    // this migration in one run.
    await q.query(`CREATE TYPE order_side_enum AS ENUM ('BUY', 'SELL')`);
    await q.query(`
      CREATE TYPE order_status_enum AS ENUM
        ('PENDING', 'PARTIALLY_COMPLETED', 'COMPLETED', 'CANCELLED', 'REJECTED')`);
    await q.query(`
      CREATE TYPE credit_order_status_enum AS ENUM
        ('ACTIVE', 'MARGIN_CALLED', 'COMPLETED', 'CANCELLED', 'CLOSED')`);

    await q.query(`
      CREATE TABLE "order" (
        id uuid PRIMARY KEY,
        side order_side_enum NOT NULL,
        status order_status_enum NOT NULL,
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
        status credit_order_status_enum NOT NULL,
        price_at_order_time numeric(20,8)
      )`);
    await q.query(`ALTER TYPE credit_order_status_enum ADD VALUE 'CASHED_OUT'`);

    // A second schema whose credit_order_status_enum is committed *without*
    // CASHED_OUT, so the transaction test below can add that very label and then
    // run the migration — which is the production sequence. Postgres only
    // restricts the label it just added, and only on a type that already
    // existed, so both halves have to be true for the reproduction to bite.
    await q.query(`DROP SCHEMA IF EXISTS ${TX_SCHEMA} CASCADE`);
    await q.query(`CREATE SCHEMA ${TX_SCHEMA}`);
    await q.query(`CREATE TYPE ${TX_SCHEMA}.order_side_enum AS ENUM ('BUY', 'SELL')`);
    await q.query(`
      CREATE TYPE ${TX_SCHEMA}.order_status_enum AS ENUM
        ('PENDING', 'PARTIALLY_COMPLETED', 'COMPLETED', 'CANCELLED', 'REJECTED')`);
    await q.query(`
      CREATE TYPE ${TX_SCHEMA}.credit_order_status_enum AS ENUM
        ('ACTIVE', 'MARGIN_CALLED', 'COMPLETED', 'CANCELLED', 'CLOSED')`);
    await q.query(`
      CREATE TABLE ${TX_SCHEMA}.credit (
        id uuid PRIMARY KEY,
        used_credit numeric(20,8) NOT NULL DEFAULT 0
      )`);
    await q.query(`
      CREATE TABLE ${TX_SCHEMA}."order" (
        id uuid PRIMARY KEY,
        side ${TX_SCHEMA}.order_side_enum NOT NULL,
        status ${TX_SCHEMA}.order_status_enum NOT NULL,
        quantity numeric(20,8),
        executed_quantity numeric(20,8) DEFAULT 0,
        price numeric(20,8),
        mesghal_price numeric(20,8)
      )`);
    await q.query(`
      CREATE TABLE ${TX_SCHEMA}.credit_order (
        id uuid PRIMARY KEY,
        credit_id uuid NOT NULL,
        order_id uuid,
        status ${TX_SCHEMA}.credit_order_status_enum NOT NULL,
        price_at_order_time numeric(20,8)
      )`);
    await q.query(
      `INSERT INTO ${TX_SCHEMA}.credit (id, used_credit) VALUES ($1, 999999)`,
      [creditIdFor(NAMES[0])],
    );

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
      await q.query(`DROP SCHEMA IF EXISTS ${TX_SCHEMA} CASCADE`);
      await q.release();
    }
    if (ds?.isInitialized) await ds.destroy();
  });

  // The whole run is one transaction in production, and CASHED_OUT was added in
  // it. Proving the migration survives that is the point of the enum setup
  // above: with enum literals instead of text casts, this throws
  // "unsafe use of new value".
  it("runs in a transaction that just added an enum label it compares against", async () => {
    const tx = ds.createQueryRunner();
    await tx.connect();
    await tx.startTransaction();
    try {
      await tx.query(`SET search_path TO ${TX_SCHEMA}`);
      // Exactly what 1000000000089 does, in the run this migration shares.
      await tx.query(`ALTER TYPE credit_order_status_enum ADD VALUE 'CASHED_OUT'`);
      await expect(migration.up(tx)).resolves.not.toThrow();
      await tx.rollbackTransaction();
    } finally {
      await tx.release();
    }
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
