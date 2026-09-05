import { MigrationInterface, QueryRunner, Table, TableIndex, TableForeignKey } from "typeorm";

export class userKycDocument1000000000016 implements MigrationInterface {
  name = "userKycDocument1000000000016";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE "kyc_documents_file_target_enum" AS ENUM (
        'official-news-paper', 
        'licence', 
        'last-changes', 
        'sub-licence'
      )
    `);

    await queryRunner.query(`
      CREATE TYPE "kyc_documents_status_enum" AS ENUM (
        'pending', 
        'approved', 
        'rejected'
      )
    `);

    await queryRunner.createTable(
      new Table({
        name: "kyc_documents",
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
            isNullable: false,
          },
          {
            name: "file_target",
            type: "kyc_documents_file_target_enum",
            isNullable: false,
          },
          {
            name: "file_name",
            type: "varchar",
            isNullable: false,
          },
          {
            name: "file_url",
            type: "varchar",
            isNullable: false,
          },
          {
            name: "file_size",
            type: "int",
            isNullable: false,
          },
          {
            name: "mime_type",
            type: "varchar",
            isNullable: false,
          },
          {
            name: "etag",
            type: "varchar",
            isNullable: true,
          },
          {
            name: "status",
            type: "kyc_documents_status_enum",
            default: "'pending'",
          },
          {
            name: "rejection_reason",
            type: "text",
            isNullable: true,
          },
          {
            name: "metadata",
            type: "jsonb",
            isNullable: true,
            default: "'{}'::jsonb",
          },
          {
            name: "reviewed_by",
            type: "uuid",
            isNullable: true,
          },
          {
            name: "reviewed_at",
            type: "timestamp",
            isNullable: true,
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
            default: null,
          },
        ],
      }),
      true
    );

    await queryRunner.createIndex(
      "kyc_documents",
      new TableIndex({
        name: "IDX_KYC_DOCUMENTS_USER_ID",
        columnNames: ["user_id"],
      })
    );

    await queryRunner.createIndex(
      "kyc_documents",
      new TableIndex({
        name: "IDX_KYC_DOCUMENTS_USER_ID_STATUS",
        columnNames: ["user_id", "status"],
      })
    );

    await queryRunner.createIndex(
      "kyc_documents",
      new TableIndex({
        name: "IDX_KYC_DOCUMENTS_STATUS_CREATED_AT",
        columnNames: ["status", "created_at"],
      })
    );

    await queryRunner.createIndex(
      "kyc_documents",
      new TableIndex({
        name: "IDX_KYC_DOCUMENTS_FILE_TARGET",
        columnNames: ["file_target"],
      })
    );

    await queryRunner.createForeignKey(
      "kyc_documents",
      new TableForeignKey({
        name: "FK_kyc_documents_user",
        columnNames: ["user_id"],
        referencedColumnNames: ["id"],
        referencedTableName: "user",
        onDelete: "CASCADE",
      })
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const table = await queryRunner.getTable("kyc_documents");
    const foreignKey = table.foreignKeys.find((fk) => fk.columnNames.indexOf("user_id") !== -1);
    if (foreignKey) {
      await queryRunner.dropForeignKey("kyc_documents", foreignKey);
    }
    await queryRunner.dropTable("kyc_documents");
    await queryRunner.query(`DROP TYPE IF EXISTS "kyc_documents_file_target_enum"`);
    await queryRunner.query(`DROP TYPE IF EXISTS "kyc_documents_status_enum"`);
  }
}
