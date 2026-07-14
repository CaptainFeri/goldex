import { MigrationInterface, QueryRunner } from "typeorm";
import { PaymentGatewayEnum } from "../admin-symbol/enum/payment.gateway.enum";

export class initSymbolPairMig1000000000028 implements MigrationInterface {
  name = "initSymbolPairMig1000000000028";

  public async up(queryRunner: QueryRunner): Promise<void> {
    const symbolsData = [
      {
        name: "ریال ایران",
        slug: "IRR",
        picPath: "/icons/irr.png",
        gain: 0,
        gainType: "number",
        symbolType: "fiat",
        unitType: "number",
        paymentGateWayType: PaymentGatewayEnum.UP,
        hasPaymentGateway: true,
        isActive: true,
      },
      {
        name: "دلار آمریکا",
        slug: "USD",
        picPath: "/icons/usd.png",
        gain: 0,
        gainType: "number",
        symbolType: "fiat",
        unitType: "number",
        paymentGateWayType: PaymentGatewayEnum.UP,
        hasPaymentGateway: true,
        isActive: true,
      },
      {
        name: "یورو",
        slug: "EUR",
        picPath: "/icons/eur.png",
        gain: 0,
        gainType: "number",
        symbolType: "fiat",
        unitType: "number",
        paymentGateWayType: PaymentGatewayEnum.UP,
        hasPaymentGateway: true,
        isActive: true,
      },
      {
        name: "درهم امارات",
        slug: "AED",
        picPath: "/icons/aed.png",
        gain: 0,
        gainType: "number",
        symbolType: "fiat",
        unitType: "number",
        paymentGateWayType: PaymentGatewayEnum.UP,
        hasPaymentGateway: true,
        isActive: true,
      },
      {
        name: "طلای جهانی",
        slug: "XAU",
        picPath: "/icons/xau.png",
        gain: 0,
        gainType: "number",
        symbolType: "material",
        unitType: "number",
        paymentGateWayType: PaymentGatewayEnum.UP,
        hasPaymentGateway: false,
        isActive: true,
      },
    ];

    const symbolIds: Record<string, string> = {};

    for (const sd of symbolsData) {
      const existing = await queryRunner.query(
        `SELECT id FROM "symbol" WHERE "slug" = $1 AND "deleted_at" IS NULL LIMIT 1`,
        [sd.slug]
      );

      if (existing.length > 0) {
        symbolIds[sd.slug] = existing[0].id;
        console.log(`Symbol already exists: ${sd.slug}`);
        continue;
      }

      const result = await queryRunner.query(
        `INSERT INTO "symbol" ("name", "slug", "pic_path", "gain", "gain_type", "symbol_type", "unit_type", "payment_gateway_type", "has_payment_gateway", "is_active", "created_at", "updated_at")
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW(), NOW())
         RETURNING "id"`,
        [
          sd.name,
          sd.slug,
          sd.picPath,
          sd.gain,
          sd.gainType,
          sd.symbolType,
          sd.unitType,
          sd.paymentGateWayType,
          sd.hasPaymentGateway,
          sd.isActive,
        ]
      );
      symbolIds[sd.slug] = result[0].id;
      console.log(`Symbol inserted: ${sd.slug}`);
    }

    const irrId = symbolIds["IRR"];
    const usdId = symbolIds["USD"];
    const eurId = symbolIds["EUR"];
    const aedId = symbolIds["AED"];
    const xauId = symbolIds["XAU"];

    if (!irrId || !usdId || !eurId || !aedId || !xauId) {
      throw new Error("Required symbols not found after insertion");
    }

    const pairsData = [
      {
        baseId: xauId,
        quoteId: irrId,
        price: 74626865.67,
        isValid: true,
        buyCommission: 0.005,
        sellCommission: 0.005,
        tradingViewSymbol: "XAUIRR",
        minBuy: 0.001,
        maxBuy: 10,
        minSell: 0.001,
        maxSell: 10,
        decimals: 2,
        bestBuyPrice: 74626865.67,
        bestSellPrice: 74626865.67,
      },
      {
        baseId: xauId,
        quoteId: eurId,
        price: 1885.5,
        isValid: true,
        buyCommission: 0.005,
        sellCommission: 0.005,
        tradingViewSymbol: "XAUEUR",
        minBuy: 0.001,
        maxBuy: 10,
        minSell: 0.001,
        maxSell: 10,
        decimals: 2,
        bestBuyPrice: 1885.5,
        bestSellPrice: 1885.5,
      },
      {
        baseId: xauId,
        quoteId: usdId,
        price: 1950.75,
        isValid: true,
        buyCommission: 0.005,
        sellCommission: 0.005,
        tradingViewSymbol: "XAUUSD",
        minBuy: 0.001,
        maxBuy: 10,
        minSell: 0.001,
        maxSell: 10,
        decimals: 2,
        bestBuyPrice: 1950.75,
        bestSellPrice: 1950.75,
      },
      {
        baseId: xauId,
        quoteId: aedId,
        price: 7168.5,
        isValid: true,
        buyCommission: 0.005,
        sellCommission: 0.005,
        tradingViewSymbol: "XAEAED",
        minBuy: 0.001,
        maxBuy: 10,
        minSell: 0.001,
        maxSell: 10,
        decimals: 2,
        bestBuyPrice: 7168.5,
        bestSellPrice: 7168.5,
      },
    ];

    for (const pd of pairsData) {
      const existing = await queryRunner.query(
        `SELECT pp.id FROM "price_pairs" pp
         WHERE pp."base_id" = $1 AND pp."quote_id" = $2 AND pp."deleted_at" IS NULL
         LIMIT 1`,
        [pd.baseId, pd.quoteId]
      );

      if (existing.length > 0) {
        console.log(`Price pair already exists for base=${pd.baseId} quote=${pd.quoteId}`);
        continue;
      }

      const result = await queryRunner.query(
        `INSERT INTO "price_pairs"
         ("base_id", "quote_id", "price", "last_updated", "is_valid", "buy_commission", "sell_commission",
          "trading_view_symbol", "min_buy", "max_buy", "min_sell", "max_sell", "decimals",
          "best_buy_price", "best_sell_price", "created_at", "updated_at")
         VALUES ($1, $2, $3, NOW(), $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, NOW(), NOW())
         RETURNING "id"`,
        [
          pd.baseId,
          pd.quoteId,
          pd.price,
          pd.isValid,
          pd.buyCommission,
          pd.sellCommission,
          pd.tradingViewSymbol,
          pd.minBuy,
          pd.maxBuy,
          pd.minSell,
          pd.maxSell,
          pd.decimals,
          pd.bestBuyPrice,
          pd.bestSellPrice,
        ]
      );

      const pairId = result[0].id;

      const pairRow = await queryRunner.query(
        `SELECT pp.id, bs.slug AS base_slug, qs.slug AS quote_slug, pp.price
         FROM "price_pairs" pp
         JOIN "symbol" bs ON bs.id = pp.base_id
         JOIN "symbol" qs ON qs.id = pp.quote_id
         WHERE pp.id = $1`,
        [pairId]
      );

      if (pairRow.length > 0) {
        console.log(`Price pair inserted: ${pairRow[0].base_slug}/${pairRow[0].quote_slug} = ${pairRow[0].price}`);
      }
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DELETE FROM "price_pairs" WHERE "base_id" IN (SELECT "id" FROM "symbol" WHERE "slug" = $1)`,
      ["XAU"]
    );
    console.log("All XAU price pairs deleted");

    const slugs = ["IRR", "USD", "EUR", "AED", "XAU"];
    for (const slug of slugs) {
      await queryRunner.query(`DELETE FROM "symbol" WHERE "slug" = $1 AND "deleted_at" IS NULL`, [slug]);
      console.log(`Symbol deleted: ${slug}`);
    }
  }
}
