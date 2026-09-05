import { MigrationInterface, QueryRunner, TableColumn } from "typeorm";

export class PricePairGramMig1000000000029 implements MigrationInterface {
  name = "PricePairGramMig1000000000029";

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Add gram price columns to price_pairs
    await queryRunner.addColumns("price_pairs", [
      new TableColumn({
        name: "best_buy_gram_price",
        type: "decimal",
        precision: 20,
        scale: 8,
        isNullable: true,
      }),
      new TableColumn({
        name: "best_sell_gram_price",
        type: "decimal",
        precision: 20,
        scale: 8,
        isNullable: true,
      }),
    ]);

    // Add gram price columns to price_pair_histories
    await queryRunner.addColumns("price_pair_histories", [
      new TableColumn({
        name: "buy_gram_price",
        type: "decimal",
        precision: 20,
        scale: 8,
        isNullable: true,
      }),
      new TableColumn({
        name: "sell_gram_price",
        type: "decimal",
        precision: 20,
        scale: 8,
        isNullable: true,
      }),
    ]);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropColumns("price_pairs", [
      "best_buy_gram_price",
      "best_sell_gram_price",
    ]);

    await queryRunner.dropColumns("price_pair_histories", [
      "buy_gram_price",
      "sell_gram_price",
    ]);
  }
}
