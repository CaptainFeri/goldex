import { INestApplication, VersioningType } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { SwaggerModule } from "@nestjs/swagger";
import { AppModule } from "../../app.module";
import { swaggerDocumentConfig } from "../../config/swagger.config";

/**
 * Builds the real OpenAPI document and checks the properties a generated
 * client depends on.
 *
 * `preview: true` builds the module graph without instantiating providers, so
 * this needs no Postgres, Redis or RabbitMQ — the same trick `src/openapi.ts`
 * uses to make the spec a CI artefact.
 */
describe("OpenAPI document", () => {
  let app: INestApplication;
  let doc: any;

  /**
   * Ratchet: admin operations carrying a 2xx schema. Raise it, never lower it.
   *
   * It went 157 -> 156 when `GET admin/kyc/document/{objectName}` was deleted:
   * that route streamed any object in the bucket to anyone who named it, and
   * documents are now reached through the signed URL on the document itself.
   * Removing a documented route is the one thing that may lower this number,
   * and only alongside the deletion that caused it.
   */
  const MIN_TYPED_ADMIN_OPERATIONS = 156;

  beforeAll(async () => {
    app = await NestFactory.create(AppModule, { preview: true, logger: false });
    app.setGlobalPrefix("api");
    app.enableVersioning({ type: VersioningType.URI, prefix: "v", defaultVersion: "1" });
    doc = SwaggerModule.createDocument(app, swaggerDocumentConfig());
  }, 60_000);

  afterAll(async () => {
    await app?.close();
  });

  const operations = () =>
    Object.entries<any>(doc.paths).flatMap(([path, methods]) =>
      Object.entries<any>(methods).map(([method, op]) => ({ path, method, op })),
    );

  const hasSuccessSchema = (op: any) =>
    Object.entries<any>(op.responses ?? {}).some(
      ([code, res]) =>
        code.startsWith("2") &&
        Object.values<any>(res.content ?? {}).some((c) => c.schema),
    );

  it("generates without a database", () => {
    expect(Object.keys(doc.paths).length).toBeGreaterThan(300);
  });

  it("documents the paths the app actually serves, prefix and version included", () => {
    // main.ts sets a global "api" prefix and URI versioning; a spec without
    // them sends every generated client to a 404.
    const unprefixed = Object.keys(doc.paths).filter((p) => !p.startsWith("/api/v1"));
    expect(unprefixed).toEqual([]);
  });

  it("keeps raising admin response coverage", () => {
    const admin = operations().filter(({ path }) => path.includes("/admin/"));
    const typed = admin.filter(({ op }) => hasSuccessSchema(op));
    expect(typed.length).toBeGreaterThanOrEqual(MIN_TYPED_ADMIN_OPERATIONS);
  });

  it("composes the response envelope rather than documenting the payload alone", () => {
    const envelope = "#/components/schemas/ResponseEnvelopeDto";
    const list = doc.paths["/api/v1/admin/withdraw"].get.responses["200"].content["application/json"].schema;
    expect(list.allOf[0].$ref).toBe(envelope);
    expect(list.allOf[1].properties.data.allOf[0].$ref).toBe("#/components/schemas/PaginatedDto");
  });

  it("registers the shared payload models once", () => {
    for (const model of ["ResponseEnvelopeDto", "ErrorEnvelopeDto", "PaginatedDto", "SymbolRefDto", "UserRefDto"]) {
      expect(doc.components.schemas[model]).toBeDefined();
    }
  });

  it("declares bearer auth, since every admin route needs it", () => {
    expect(doc.components.securitySchemes).toBeDefined();
  });
});
