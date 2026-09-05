import { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import { WithdrawAdminController } from "../../withdraw/withdraw-admin.controller";
import { DepositAdminController } from "../../deposit/deposit-admin.controller";
import { AdminManagementController } from "../../admin-management/admin-management.controller";
import { AdminBankAccountController } from "../../admin-bank-account/admin-bank-account.controller";
import { AdminUserController } from "../../admin-user/admin-user.controller";
import { AdminKycController } from "../../admin-kyc/admin-kyc.controller";
import { AdminWalletController } from "../../admin-wallet/admin-wallet.controller";
import { AdminSymbolController } from "../../admin-symbol/admin-symbol.controller";
import { AdminPairController } from "../../admin-pair/admin-pair.controller";
import { ProviderController } from "../../provider/provider.controller";

const stub = {} as any;

/** The backfilled controllers really do emit typed responses, envelope included. */
describe("backfilled response schemas", () => {
  let app: INestApplication;
  let doc: any;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [
        WithdrawAdminController,
        DepositAdminController,
        AdminManagementController,
        AdminBankAccountController,
        AdminUserController,
        AdminKycController,
        AdminWalletController,
        AdminSymbolController,
        AdminPairController,
        ProviderController,
      ],
    })
      .useMocker(() => stub)
      .compile();
    app = moduleRef.createNestApplication();
    await app.init();
    doc = SwaggerModule.createDocument(app, new DocumentBuilder().setTitle("t").setVersion("1").build());
  });

  afterAll(async () => await app?.close());

  // Nest answers POST with 201 unless @HttpCode says otherwise, so the declared
  // status has to match the framework's, not what reads nicely.
  const ok = (path: string, method = "get", status = "200") =>
    doc.paths[path][method].responses[status].content["application/json"].schema;

  it("types the withdrawal list as a paginated envelope of WithdrawDto", () => {
    const data = ok("/admin/withdraw").allOf[1].properties.data;
    expect(data.allOf[0].$ref).toBe("#/components/schemas/PaginatedDto");
    expect(data.allOf[1].properties.items.items.$ref).toBe("#/components/schemas/WithdrawDto");
  });

  it("types the deposit detail as an envelope of DepositDto", () => {
    expect(ok("/admin/deposit/{id}").allOf[1].properties.data.$ref).toBe(
      "#/components/schemas/DepositDto"
    );
  });

  it("types the admin list as an envelope of an AdminAccountDto array", () => {
    const data = ok("/admin/accounts").allOf[1].properties.data;
    expect(data.type).toBe("array");
    expect(data.items.$ref).toBe("#/components/schemas/AdminAccountDto");
  });

  it("declares the admin error responses on the controller", () => {
    const responses = doc.paths["/admin/bank-accounts"].get.responses;
    for (const code of ["400", "401", "403", "404"]) expect(responses[code]).toBeDefined();
  });

  it("embeds the shared symbol and user refs rather than inlining them", () => {
    expect(doc.components.schemas.SymbolRefDto).toBeDefined();
    expect(doc.components.schemas.UserRefDto).toBeDefined();
    expect(doc.components.schemas.WithdrawDto.properties.symbol.$ref).toBe(
      "#/components/schemas/SymbolRefDto"
    );
  });

  it("types the user list as a paginated envelope of AdminUserListItemDto", () => {
    const data = ok("/admin/users/users").allOf[1].properties.data;
    expect(data.allOf[1].properties.items.items.$ref).toBe(
      "#/components/schemas/AdminUserListItemDto"
    );
  });

  it("types the KYC document queue", () => {
    expect(ok("/admin/kyc/admin/pending").allOf[1].properties.data.$ref).toBe(
      "#/components/schemas/KycDocumentPageDto"
    );
  });

  it("documents the KYC document stream as binary, not as the envelope", () => {
    const res = doc.paths["/admin/kyc/document/{objectName}"].get.responses["200"];
    // A client that JSON-parsed this would fail confusingly, so the schema says bytes.
    expect(res.content["application/octet-stream"].schema.format).toBe("binary");
  });

  it("types the wallet mutations, which prose-only @ApiResponse left blank", () => {
    for (const path of [
      "/admin/wallets/update-balance",
      "/admin/wallets/adjust-balance",
      "/admin/wallets/freeze",
      "/admin/wallets/update-status",
    ]) {
      expect(ok(path, "post", "201").allOf[1].properties.data.$ref).toBe(
        "#/components/schemas/AdminWalletMutationDto"
      );
    }
  });

  it("types the symbol capabilities the panel renders its form from", () => {
    expect(ok("/admin/symbols/capabilities").allOf[1].properties.data.$ref).toBe(
      "#/components/schemas/SymbolCapabilitiesDto"
    );
  });

  it("types the pair list and its resolved routes", () => {
    const list = ok("/admin/pair").allOf[1].properties.data;
    expect(list.items.$ref).toBe("#/components/schemas/PricePairDto");
    expect(ok("/admin/pair/{id}/route").allOf[1].properties.data.$ref).toBe(
      "#/components/schemas/PairRoutesDto"
    );
  });

  it("types provider commands as an acknowledgement, not as the finished work", () => {
    // These queue a message to the pricing engine and return immediately.
    expect(ok("/admin/providers/reconcile", "post", "201").allOf[1].properties.data.$ref).toBe(
      "#/components/schemas/ProviderCommandAckDto"
    );
  });

  it("keeps provider credentials out of the provider schema", () => {
    const props = doc.components.schemas.ProviderDto.properties;
    expect(props.auth).toBeUndefined();
    expect(props.config).toBeUndefined();
  });

  it("never leaves a documented route's data untyped", () => {
    for (const [, methods] of Object.entries<any>(doc.paths)) {
      for (const [, op] of Object.entries<any>(methods)) {
        const schema = op.responses?.["200"]?.content?.["application/json"]?.schema;
        if (!schema) continue;
        const data = schema.allOf?.[1]?.properties?.data;
        expect(data?.$ref ?? data?.type ?? data?.allOf ?? data?.nullable).toBeDefined();
      }
    }
  });
});
