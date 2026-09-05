import { INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import { WithdrawAdminController } from "../../withdraw/withdraw-admin.controller";
import { DepositAdminController } from "../../deposit/deposit-admin.controller";
import { AdminManagementController } from "../../admin-management/admin-management.controller";
import { AdminBankAccountController } from "../../admin-bank-account/admin-bank-account.controller";

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
      ],
    })
      .useMocker(() => stub)
      .compile();
    app = moduleRef.createNestApplication();
    await app.init();
    doc = SwaggerModule.createDocument(app, new DocumentBuilder().setTitle("t").setVersion("1").build());
  });

  afterAll(async () => await app?.close());

  const ok = (path: string, method = "get") =>
    doc.paths[path][method].responses["200"].content["application/json"].schema;

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
