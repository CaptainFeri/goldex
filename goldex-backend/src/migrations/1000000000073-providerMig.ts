import { MigrationInterface, QueryRunner, Table, TableIndex } from "typeorm";

export class ProviderMig1000000000073 implements MigrationInterface {
  name = "ProviderMig1000000000073";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: "provider",
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
            name: "key",
            type: "varchar",
            length: "100",
            isNullable: false,
          },
          {
            name: "category",
            type: "varchar",
            length: "50",
            isNullable: false,
          },
          {
            name: "base_url",
            type: "text",
            isNullable: false,
          },
          {
            name: "api_base_url",
            type: "text",
            isNullable: true,
          },
          {
            name: "persian_name",
            type: "varchar",
            isNullable: true,
          },
          {
            name: "web_panel_url",
            type: "text",
            isNullable: true,
          },
          {
            name: "phone",
            type: "varchar",
            isNullable: true,
          },
          {
            name: "send_otp_url",
            type: "text",
            isNullable: true,
          },
          {
            name: "verify_code_url",
            type: "text",
            isNullable: true,
          },
          {
            name: "auth",
            type: "jsonb",
            default: "'{}'::jsonb",
            isNullable: true,
          },
          {
            name: "config",
            type: "jsonb",
            default: "'{}'::jsonb",
            isNullable: true,
          },
          {
            name: "active",
            type: "boolean",
            default: "false",
          },
          {
            name: "metadata_refresh_interval_ms",
            type: "integer",
            default: 60000,
          },
          {
            name: "status",
            type: "varchar",
            length: "30",
            default: "'inactive'",
          },
          {
            name: "last_status_change_at",
            type: "timestamptz",
            isNullable: true,
          },
        ],
      }),
      true,
    );

    await queryRunner.createIndex(
      "provider",
      new TableIndex({
        name: "UQ_provider_key",
        columnNames: ["key"],
        isUnique: true,
      }),
    );

    await queryRunner.createIndex(
      "provider",
      new TableIndex({
        name: "IDX_provider_status",
        columnNames: ["status"],
      }),
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable("provider");
  }
}
