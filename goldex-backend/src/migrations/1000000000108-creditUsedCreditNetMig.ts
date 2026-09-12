import { MigrationInterface, QueryRunner } from "typeorm";
import { MESQAL_TO_GRAM } from "../common/constants";

/**
 * Recompute the cached `credit.used_credit` under the netting definition.
 *
 * The column was written by a sum that ignored the side of each trade, so a
 * position bought and sold back out counted twice and the figure only ever grew.
 * Used credit is now the net open position in the credit currency — see
 * `computeCreditUsage` — and most read paths derive it live, but
 * `recomputeUsedCredit` still writes this column on a cash-out, so an untouched
 * facility would keep serving the inflated number until then.
 *
 * The computation mirrors `computeCreditUsage` exactly, including which trades
 * count and which price each side uses, and runs against immutable order
 * history, so it is a corrected derivation rather than a rewrite of the record.
 * `down()` restores the gross sum the column used to hold.
 */
export class CreditUsedCreditNetMig1000000000108 implements MigrationInterface {
  name = "CreditUsedCreditNetMig1000000000108";

  /**
   * The legs of every trade that counts toward a facility's usage, with the
   * quantity and the two prices resolved the same way the TypeScript does:
   * the executed quantity when there is one, the order price falling back to the
   * price recorded on the credit link, and — for a sale, whose commission is
   * taken in gold rather than currency — the pure price carried per mesghal.
   */
  private static legs(): string {
    return `
      SELECT co.credit_id,
             o.side AS side,
             CASE WHEN COALESCE(o.executed_quantity, 0) > 0
                  THEN o.executed_quantity
                  ELSE COALESCE(o.quantity, 0)
             END AS qty,
             COALESCE(NULLIF(o.price, 0), NULLIF(co.price_at_order_time, 0), 0) AS buy_price,
             CASE WHEN COALESCE(o.mesghal_price, 0) > 0
                  THEN o.mesghal_price / ${MESQAL_TO_GRAM}
                  ELSE COALESCE(NULLIF(o.price, 0), NULLIF(co.price_at_order_time, 0), 0)
             END AS pure_price
        FROM credit_order co
        JOIN "order" o ON o.id = co.order_id
       WHERE o.status = 'COMPLETED'
         AND co.status <> 'CASHED_OUT'
    `;
  }

  public async up(queryRunner: QueryRunner): Promise<void> {
    if (!(await this.tablesPresent(queryRunner))) return;

    // used = max(0, borrowed − sell revenue), per facility.
    await queryRunner.query(`
      WITH legs AS (${CreditUsedCreditNetMig1000000000108.legs()}),
      net AS (
        SELECT credit_id,
               GREATEST(0, SUM(
                 CASE WHEN side = 'SELL'
                      THEN -1 * qty * pure_price
                      ELSE       qty * buy_price
                 END
               )) AS used_credit
          FROM legs
         WHERE qty > 0 AND buy_price > 0
         GROUP BY credit_id
      )
      UPDATE credit c
         SET used_credit = net.used_credit
        FROM net
       WHERE net.credit_id = c.id
         AND c.used_credit IS DISTINCT FROM net.used_credit
    `);

    // A facility whose every trade was cashed out or never completed has no
    // legs at all, so the CTE above cannot reach it — its usage is zero.
    await queryRunner.query(`
      UPDATE credit c
         SET used_credit = 0
       WHERE c.used_credit <> 0
         AND NOT EXISTS (
           SELECT 1
             FROM credit_order co
             JOIN "order" o ON o.id = co.order_id
            WHERE co.credit_id = c.id
              AND o.status = 'COMPLETED'
              AND co.status <> 'CASHED_OUT'
         )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    if (!(await this.tablesPresent(queryRunner))) return;

    // The side-agnostic gross sum the column held before.
    await queryRunner.query(`
      WITH legs AS (${CreditUsedCreditNetMig1000000000108.legs()}),
      gross AS (
        SELECT credit_id, SUM(qty * buy_price) AS used_credit
          FROM legs
         WHERE qty > 0 AND buy_price > 0
         GROUP BY credit_id
      )
      UPDATE credit c
         SET used_credit = gross.used_credit
        FROM gross
       WHERE gross.credit_id = c.id
         AND c.used_credit IS DISTINCT FROM gross.used_credit
    `);
  }

  private async tablesPresent(queryRunner: QueryRunner): Promise<boolean> {
    for (const table of ["credit", "credit_order", "order"]) {
      if (!(await queryRunner.getTable(table))) return false;
    }
    return true;
  }
}
