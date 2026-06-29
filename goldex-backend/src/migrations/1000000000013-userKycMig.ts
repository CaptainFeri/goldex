import { MigrationInterface, QueryRunner, Table } from "typeorm";

export class userKycMig1000000000013 implements MigrationInterface {
  name?: "userKycMig1000000000013";
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: "user_kyc",
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
            name: "national_id",
            type: "varchar",
            isNullable: true,
          },
          {
            name: "birth_date",
            type: "varchar",
            isNullable: true,
          },
          {
            name: "level",
            type: "int",
            default: 0,
          },
          {
            name: "status",
            type: "int",
            default: 0,
          },
          {
            name: "verified_at",
            type: "timestamp",
            isNullable: true,
          },
          {
            name: "reject_reason",
            type: "varchar",
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
            default: null,
            isNullable: true,
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
      })
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable("user_kyc");
  }
}

// {
//   name: "iban",
//   type: "varchar",
//   isNullable: true,
// },
// {
//   name: "bank_name",
//   type: "varchar",
//   isNullable: true,
// },
// {
//   name: "deposit_number",
//   type: "varchar",
//   isNullable: true,
// },
