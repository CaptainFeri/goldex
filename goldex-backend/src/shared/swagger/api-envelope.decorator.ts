import { Type, applyDecorators } from "@nestjs/common";
import { ApiExtraModels, ApiResponse, getSchemaPath } from "@nestjs/swagger";
import { PaginatedDto } from "../dto/paginated.dto";
import { ErrorEnvelopeDto, ResponseEnvelopeDto } from "./response-envelope.dto";

type Primitive = "string" | "number" | "boolean";

interface EnvelopeOptions {
  status?: number;
  description?: string;
  isArray?: boolean;
}

/** `{ status, message, data: <schema> }` */
function envelopeSchema(dataSchema: Record<string, unknown>) {
  return {
    allOf: [{ $ref: getSchemaPath(ResponseEnvelopeDto) }, { properties: { data: dataSchema } }],
  };
}

/**
 * Document an endpoint's response as it appears on the wire, envelope included.
 *
 *   @Get(":id")
 *   @ApiEnvelopeResponse(AdminUserDto)
 *   async findOne(@Param("id") id: string) {
 *     return { data: await this.service.findById(id) };
 *   }
 *
 * Pass `{ isArray: true }` for a bare array payload; use
 * `ApiPaginatedResponse` for paginated lists.
 */
export const ApiEnvelopeResponse = <TModel extends Type<unknown>>(model: TModel, options: EnvelopeOptions = {}) => {
  const ref = { $ref: getSchemaPath(model) };
  return applyDecorators(
    ApiExtraModels(ResponseEnvelopeDto, model),
    ApiResponse({
      status: options.status ?? 200,
      description: options.description,
      schema: envelopeSchema(options.isArray ? { type: "array", items: ref } : ref),
    })
  );
};

/**
 * Document a paginated list: the envelope wrapping `PaginatedDto<TModel>`.
 *
 *   @Get()
 *   @ApiPaginatedResponse(AdminUserDto)
 *   async list(@Query() query: ListUsersQueryDto) {
 *     return { data: paginate(items, total, query) };
 *   }
 */
export const ApiPaginatedResponse = <TModel extends Type<unknown>>(
  model: TModel,
  options: Omit<EnvelopeOptions, "isArray"> = {}
) =>
  applyDecorators(
    ApiExtraModels(ResponseEnvelopeDto, PaginatedDto, model),
    ApiResponse({
      status: options.status ?? 200,
      description: options.description,
      schema: envelopeSchema({
        allOf: [
          { $ref: getSchemaPath(PaginatedDto) },
          {
            properties: {
              items: { type: "array", items: { $ref: getSchemaPath(model) } },
            },
          },
        ],
      }),
    })
  );

/**
 * For endpoints whose payload is a primitive or an ad-hoc object that does not
 * justify a DTO class. Prefer a DTO — this is the escape hatch, not the norm.
 */
export const ApiEnvelopePrimitiveResponse = (type: Primitive, options: EnvelopeOptions = {}) =>
  applyDecorators(
    ApiExtraModels(ResponseEnvelopeDto),
    ApiResponse({
      status: options.status ?? 200,
      description: options.description,
      schema: envelopeSchema(options.isArray ? { type: "array", items: { type } } : { type }),
    })
  );

/**
 * For endpoints that perform an action and return nothing — deletes, mostly.
 * The envelope is still sent, with `data: null`, so clients unwrap uniformly
 * rather than special-casing the empty case.
 */
export const ApiEnvelopeNoDataResponse = (options: EnvelopeOptions = {}) =>
  applyDecorators(
    ApiExtraModels(ResponseEnvelopeDto),
    ApiResponse({
      status: options.status ?? 200,
      description: options.description ?? "Succeeded; the envelope's data is null",
      schema: envelopeSchema({ nullable: true, example: null }),
    })
  );

/**
 * The error responses every authenticated admin endpoint can return.
 * Apply once per controller rather than per route.
 */
export const ApiAdminErrorResponses = () =>
  applyDecorators(
    ApiExtraModels(ErrorEnvelopeDto),
    ApiResponse({
      status: 400,
      description: "Validation failed — see `errors` for per-field messages",
      type: ErrorEnvelopeDto,
    }),
    ApiResponse({ status: 401, description: "Missing or expired admin token", type: ErrorEnvelopeDto }),
    ApiResponse({
      status: 403,
      description: "Authenticated, but lacking the required permission",
      type: ErrorEnvelopeDto,
    }),
    ApiResponse({ status: 404, description: "Not found", type: ErrorEnvelopeDto })
  );
