import { MigrationInterface, QueryRunner } from "typeorm";

export class DepositWithdrawTypesMig1000000000061 implements MigrationInterface {
  name = "DepositWithdrawTypesMig1000000000061";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "symbol" ADD COLUMN IF NOT EXISTS "deposit_types" jsonb NOT NULL DEFAULT '[]'::jsonb`,
    );
    await queryRunner.query(
      `ALTER TABLE "symbol" ADD COLUMN IF NOT EXISTS "withdraw_types" jsonb NOT NULL DEFAULT '[]'::jsonb`,
    );

    const symbols = await queryRunner.query(`SELECT id, symbol_type FROM "symbol" WHERE "deleted_at" IS NULL`);

    for (const row of symbols) {
      let depositTypes: string[];
      let withdrawTypes: string[];

      switch (row.symbol_type) {
        case "rial":
          depositTypes = ["manual"];
          withdrawTypes = ["manual", "auto"];
          break;
        case "fiat":
          depositTypes = ["manual"];
          withdrawTypes = ["manual", "auto"];
          break;
        case "crypto":
          depositTypes = ["manual"];
          withdrawTypes = ["manual", "auto"];
          break;
        case "material":
          depositTypes = ["warehouse"];
          withdrawTypes = ["warehouse", "borrow"];
          break;
        default:
          depositTypes = ["manual"];
          withdrawTypes = ["manual"];
      }

      await queryRunner.query(
        `UPDATE "symbol" SET "deposit_types" = $1::jsonb, "withdraw_types" = $2::jsonb WHERE "id" = $3`,
        [JSON.stringify(depositTypes), JSON.stringify(withdrawTypes), row.id],
      );
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "symbol" DROP COLUMN IF EXISTS "withdraw_types"`);
    await queryRunner.query(`ALTER TABLE "symbol" DROP COLUMN IF EXISTS "deposit_types"`);
  }
}
