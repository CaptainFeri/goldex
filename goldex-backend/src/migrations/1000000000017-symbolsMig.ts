import { MigrationInterface, QueryRunner, Table } from "typeorm";

export class symbolMig1000000000017 implements MigrationInterface {
  name?: "symbolMig1000000000017";
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: "symbol",
        columns: [
          {
            name: "id",
            type: "uuid",
            isPrimary: true,
            generationStrategy: "uuid",
            default: "uuid_generate_v4()",
          },
          {
            name: "created_at",
            type: "timestamp",
            default: "CURRENT_TIMESTAMP",
          },
          {
            name: "updated_at",
            type: "timestamp",
            default: "CURRENT_TIMESTAMP",
            onUpdate: "CURRENT_TIMESTAMP",
          },
          {
            name: "deleted_at",
            type: "timestamp",
            isNullable: true,
          },
          {
            name: "name",
            type: "varchar",
            isNullable: false,
          },
          {
            name: "slug",
            type: "varchar",
            isNullable: false,
          },
          {
            name: "pic_path",
            type: "varchar",
            isNullable: false,
          },
          {
            name: "gain",
            type: "decimal",
            precision: 20,
            scale: 8,
            default: 0,
          },
          {
            name: "gain_type",
            type: "enum",
            enum: ["number", "percent"],
            default: "'number'",
            isNullable: false,
          },
          {
            name: "symbol_type",
            type: "enum",
            enum: ["fiat", "crypto", "material"],
            default: "'fiat'",
            isNullable: false,
          },
          {
            name: "unit_type",
            type: "enum",
            enum: ["number", "geram", "litre"],
            default: "'number'",
            isNullable: false,
          },
          {
            name: "payment_gateway_type",
            type: "enum",
            enum: ["up", "mellat", "pasargad"],
            default: "'up'",
            isNullable: false,
          },
          {
            name: "has_payment_gateway",
            type: "boolean",
            default: false,
          },
          {
            name: "is_active",
            type: "boolean",
            default: false,
          },
        ],
      }),
      true
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable("symbol");
  }
}
