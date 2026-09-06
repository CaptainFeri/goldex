import { writeFileSync } from "fs";
import { dirname, resolve } from "path";
import { mkdirSync } from "fs";
import { NestFactory } from "@nestjs/core";
import { VersioningType } from "@nestjs/common";
import { SwaggerModule } from "@nestjs/swagger";
import { AppModule } from "./app.module";
import { swaggerDocumentConfig } from "./config/swagger.config";

/**
 * Write the OpenAPI document to disk without starting the app.
 *
 * `preview: true` builds the module graph but never instantiates providers, so
 * this runs with no Postgres, Redis or RabbitMQ — which is what lets CI
 * regenerate the spec on every commit and diff it.
 *
 *   npm run openapi          -> openapi.json
 *   npm run openapi -- path  -> somewhere else
 */
async function generate() {
  const out = resolve(process.argv[2] ?? "openapi.json");

  const app = await NestFactory.create(AppModule, {
    preview: true,
    logger: false,
  });
  // Mirror main.ts, or the documented paths will not match the served ones.
  app.setGlobalPrefix("api");
  app.enableVersioning({ type: VersioningType.URI, prefix: "v", defaultVersion: "1" });

  const document = SwaggerModule.createDocument(app, swaggerDocumentConfig());
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, JSON.stringify(document, null, 2) + "\n");
  await app.close();

  const paths = Object.keys(document.paths).length;
  const schemas = Object.keys(document.components?.schemas ?? {}).length;
  process.stdout.write(`openapi: ${paths} paths, ${schemas} schemas -> ${out}\n`);
}

generate().catch((err) => {
  process.stderr.write(`${(err as Error).stack ?? err}\n`);
  process.exit(1);
});
