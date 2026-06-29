import { MigrationInterface, QueryRunner, Table } from "typeorm";

export class userBankAccountMig1000000000015 implements MigrationInterface {
  name = "userBankAccountMig1000000000015";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: "user_bank_account",
        columns: [
          {
            name: "id",
            type: "uuid",
            isPrimary: true,
            generationStrategy: "uuid",
            default: "uuid_generate_v4()",
          },
          {
            name: "user_id",
            type: "uuid",
            isUnique: true,
          },
          {
            name: "iban",
            type: "varchar",
            isNullable: true,
          },
          {
            name: "bank_name",
            type: "varchar",
            isNullable: true,
          },
          {
            name: "deposit_number",
            type: "varchar",
            isNullable: true,
          },
          {
            name: "verified_at",
            type: "timestamp",
            isNullable: true,
          },
          {
            name: "created_at",
            type: "timestamp",
            default: "now()",
          },
          {
            name: "updated_at",
            type: "timestamp",
            default: "now()",
          },
          {
            name: "deleted_at",
            type: "timestamp",
            isNullable: true,
            default: null,
          },
        ],
        foreignKeys: [
          {
            columnNames: ["user_id"],
            referencedTableName: "user",
            referencedColumnNames: ["id"],
            onDelete: "CASCADE",
          },
        ],
      }),
      true // Add `ifNotExist` option
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable("user_bank_account");
  }
}
