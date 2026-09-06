import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import { INestApplication } from "@nestjs/common";

/**
 * The document definition, separate from serving it, so the offline generator
 * in `src/openapi.ts` produces exactly what `/swagger` shows.
 */
export function swaggerDocumentConfig() {
  return new DocumentBuilder()
    .setTitle("GoldEx-Backend")
    .setDescription(
      [
        "Every response is wrapped: `{ status, message, data }`.",
        "Errors use the same envelope with `data: null` and a localised `message` —",
        "send `Accept-Language: fa` for Persian.",
        "",
        "Amounts are decimal strings in their symbol's own units. The backend works",
        "in rial (IRR); showing toman is the panels' job.",
      ].join(" "),
    )
    .setVersion("0.0.1")
    .addBearerAuth()
    .build();
}

export function configureSwagger(app: INestApplication): void {
  const document = SwaggerModule.createDocument(app, swaggerDocumentConfig());

  // Serve Swagger at '/swagger'
  SwaggerModule.setup("swagger", app, document, {
    swaggerOptions: { persistAuthorization: true },
    customCssUrl: "https://cdnjs.cloudflare.com/ajax/libs/swagger-ui/4.15.5/swagger-ui.min.css",
    customSiteTitle: "Goldex-Backend API Docs",
  });
}
