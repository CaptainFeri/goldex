import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

/**
 * The shape every response actually has on the wire.
 *
 * `ResponseInterceptor` wraps each handler's return value, so a schema that
 * documents only the inner payload is wrong at the outermost level. This class
 * exists so `ApiEnvelopeResponse` can compose the real envelope with the
 * endpoint's own payload type.
 *
 * @see src/shared/interceptor/response.interceptor.ts
 */
export class ResponseEnvelopeDto {
  @ApiProperty({ example: 200, description: "Mirrors the HTTP status code" })
  status: number;

  @ApiProperty({
    example: "OK",
    nullable: true,
    description: "Localised via nestjs-i18n; send Accept-Language: fa for Persian",
  })
  message: string | null;

  @ApiProperty({ nullable: true, description: "The payload. Null on error." })
  data: unknown;
}

/** The envelope as produced by `HttpExceptionFilter`. */
export class ErrorEnvelopeDto {
  @ApiProperty({ example: 422 })
  status: number;

  @ApiProperty({
    example: "مبلغ برداشت از سقف روزانه بیشتر است",
    description: "Already localised — safe to show to the operator as-is",
  })
  message: string;

  // Typed `unknown`, not `null`: a bare `null` gives the schema explorer no
  // type to resolve and it reports the property as a circular reference.
  @ApiProperty({ example: null, nullable: true, description: "Always null on an error" })
  data: unknown;

  @ApiPropertyOptional({
    example: { amount: "AMOUNT.EXCEEDS_DAILY_LIMIT" },
    description: "Per-field messages for validation failures; {} otherwise",
    additionalProperties: { type: "string" },
  })
  errors?: Record<string, string>;
}
