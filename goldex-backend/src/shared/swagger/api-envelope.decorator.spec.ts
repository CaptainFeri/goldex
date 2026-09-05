import { Controller, Get, INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { ApiProperty, DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import {
  ApiEnvelopePrimitiveResponse,
  ApiEnvelopeResponse,
  ApiPaginatedResponse,
} from "./api-envelope.decorator";
import { PaginatedDto } from "../dto/paginated.dto";
import { ResponseEnvelopeDto } from "./response-envelope.dto";

class WidgetDto {
  @ApiProperty()
  id: string;
}

@Controller("widgets")
class WidgetsController {
  @Get("one")
  @ApiEnvelopeResponse(WidgetDto)
  one() {
    return { data: {} };
  }

  @Get("many")
  @ApiEnvelopeResponse(WidgetDto, { isArray: true })
  many() {
    return { data: [] };
  }

  @Get("paged")
  @ApiPaginatedResponse(WidgetDto)
  paged() {
    return { data: {} };
  }

  @Get("count")
  @ApiEnvelopePrimitiveResponse("number")
  count() {
    return { data: 0 };
  }
}

/**
 * The decorators exist so the spec describes the wire format, envelope
 * included. If they silently stop composing the envelope, every generated
 * client is wrong at the outermost level — so assert the emitted schema
 * rather than trusting the decorators compile.
 */
describe("API envelope decorators", () => {
  let app: INestApplication;
  let doc: any;

  const ENVELOPE = "#/components/schemas/ResponseEnvelopeDto";
  const WIDGET = "#/components/schemas/WidgetDto";
  const PAGINATED = "#/components/schemas/PaginatedDto";

  const schemaFor = (path: string) =>
    doc.paths[path].get.responses["200"].content["application/json"].schema;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [WidgetsController],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.init();
    doc = SwaggerModule.createDocument(
      app,
      new DocumentBuilder().setTitle("test").setVersion("1").build()
    );
  });

  afterAll(async () => {
    await app?.close();
  });

  it("registers the envelope and payload models as components", () => {
    expect(doc.components.schemas.ResponseEnvelopeDto).toBeDefined();
    expect(doc.components.schemas.WidgetDto).toBeDefined();
    expect(doc.components.schemas.PaginatedDto).toBeDefined();
  });

  it("documents the envelope's own fields", () => {
    const envelope = doc.components.schemas.ResponseEnvelopeDto;
    expect(Object.keys(envelope.properties).sort()).toEqual(["data", "message", "status"]);
  });

  it("wraps a single object payload in the envelope", () => {
    const schema = schemaFor("/widgets/one");
    expect(schema.allOf[0].$ref).toBe(ENVELOPE);
    expect(schema.allOf[1].properties.data.$ref).toBe(WIDGET);
  });

  it("wraps an array payload in the envelope", () => {
    const data = schemaFor("/widgets/many").allOf[1].properties.data;
    expect(data.type).toBe("array");
    expect(data.items.$ref).toBe(WIDGET);
  });

  it("nests PaginatedDto inside the envelope and types its items", () => {
    const schema = schemaFor("/widgets/paged");
    expect(schema.allOf[0].$ref).toBe(ENVELOPE);

    const data = schema.allOf[1].properties.data;
    expect(data.allOf[0].$ref).toBe(PAGINATED);
    expect(data.allOf[1].properties.items.type).toBe("array");
    expect(data.allOf[1].properties.items.items.$ref).toBe(WIDGET);
  });

  it("documents the pagination fields once, on PaginatedDto", () => {
    const paginated = doc.components.schemas.PaginatedDto;
    expect(Object.keys(paginated.properties).sort()).toEqual([
      "page",
      "pageSize",
      "total",
      "totalPages",
    ]);
  });

  it("supports a primitive payload", () => {
    const data = schemaFor("/widgets/count").allOf[1].properties.data;
    expect(data.type).toBe("number");
  });

  it("never leaves `data` untyped", () => {
    for (const path of ["/widgets/one", "/widgets/many", "/widgets/paged", "/widgets/count"]) {
      const data = schemaFor(path).allOf[1].properties.data;
      expect(data.$ref ?? data.type ?? data.allOf).toBeDefined();
    }
  });
});
