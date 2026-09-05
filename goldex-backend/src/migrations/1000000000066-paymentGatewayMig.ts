import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * Adds payment-gateway configuration to symbols and gateway-code columns
 * to deposit/withdraw, used by the goldex-cbp integration.
 */
export class PaymentGatewayMig1000000000066 implements MigrationInterface {
  name = "PaymentGatewayMig1000000000066";

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "symbol" ADD "deposit_gateways" jsonb DEFAULT '[]'`);
    await queryRunner.query(`ALTER TABLE "symbol" ADD "withdraw_gateways" jsonb DEFAULT '[]'`);
    await queryRunner.query(`ALTER TABLE "symbol" ADD "default_deposit_gateway" character varying`);
    await queryRunner.query(`ALTER TABLE "symbol" ADD "default_withdraw_gateway" character varying`);

    await queryRunner.query(`ALTER TABLE "deposit" ADD "gateway_code" character varying`);
    await queryRunner.query(`ALTER TABLE "withdraw" ADD "gateway_code" character varying`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "withdraw" DROP COLUMN "gateway_code"`);
    await queryRunner.query(`ALTER TABLE "deposit" DROP COLUMN "gateway_code"`);

    await queryRunner.query(`ALTER TABLE "symbol" DROP COLUMN "default_withdraw_gateway"`);
    await queryRunner.query(`ALTER TABLE "symbol" DROP COLUMN "default_deposit_gateway"`);
    await queryRunner.query(`ALTER TABLE "symbol" DROP COLUMN "withdraw_gateways"`);
    await queryRunner.query(`ALTER TABLE "symbol" DROP COLUMN "deposit_gateways"`);
  }
}
