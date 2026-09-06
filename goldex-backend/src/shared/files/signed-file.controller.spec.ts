import { INestApplication, VersioningType } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Test } from "@nestjs/testing";
import { Readable } from "stream";
import request from "supertest";
import { MinioService } from "../../minio/minio.service";
import { SignedFileController } from "./signed-file.controller";
import { SignedFileUrlService } from "./signed-file-url.service";

/**
 * End-to-end over the real Nest pipeline, with only MinIO stubbed.
 *
 * The behaviour under test is authorization, so asserting it against the
 * routing and exception layers the app actually runs matters more than
 * unit-testing the signer twice.
 */
describe("SignedFileController", () => {
  let app: INestApplication;
  let signer: SignedFileUrlService;

  const RECEIPT = "deposit-a1b2-2026-09-05.jpg";
  const KYC = "licence-c3d4-2026-09-05.jpg";
  const stored: Record<string, string> = { [RECEIPT]: "receipt-bytes", [KYC]: "kyc-bytes" };

  const minio: Partial<MinioService> = {
    getFileStat: (async (_bucket: string, objectName: string) => {
      if (!(objectName in stored)) throw new Error("NoSuchKey");
      return { size: stored[objectName].length, contentType: "image/jpeg" };
    }) as MinioService["getFileStat"],
    getFileStream: (async (_bucket: string, objectName: string) =>
      Readable.from([Buffer.from(stored[objectName])])) as MinioService["getFileStream"],
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [SignedFileController],
      providers: [
        SignedFileUrlService,
        { provide: MinioService, useValue: minio },
        {
          provide: ConfigService,
          useValue: { get: (k: string) => (k === "GOLDEX_FILE_URL_SECRET" ? "test-secret" : undefined) },
        },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix("api");
    app.enableVersioning({ type: VersioningType.URI, prefix: "v", defaultVersion: "1" });
    await app.init();
    signer = app.get(SignedFileUrlService);
  });

  afterAll(async () => await app?.close());

  /** supertest leaves an image body unparsed, so collect it ourselves. */
  const body = (url: string) =>
    request(app.getHttpServer())
      .get(url)
      .buffer(true)
      .parse((res, cb) => {
        const chunks: Buffer[] = [];
        res.on("data", (c: Buffer) => chunks.push(c));
        res.on("end", () => cb(null, Buffer.concat(chunks)));
      });

  it("serves the object a minted URL names", async () => {
    const res = await body(signer.sign(RECEIPT)).expect(200);
    expect(res.headers["content-type"]).toContain("image/jpeg");
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
    expect(res.body.toString()).toBe("receipt-bytes");
  });

  it("serves a URL the service minted for a nested key", async () => {
    stored["kyc/42/national-card.jpg"] = "nested-bytes";
    const res = await body(signer.sign("kyc/42/national-card.jpg")).expect(200);
    expect(res.body.toString()).toBe("nested-bytes");
  });

  it("refuses a token it did not sign", async () => {
    // The regression that matters: naming an object without the key was the
    // whole of the old PublicFileController's access control.
    const payload = Buffer.from(JSON.stringify({ o: KYC, e: 4_102_444_800 })).toString("base64url");
    await request(app.getHttpServer()).get(`/api/v1/files/signed/${payload}.not-a-signature`).expect(403);
  });

  it("refuses a token whose object name was swapped after signing", async () => {
    const token = signer.sign(RECEIPT).split("/").pop()!;
    const signature = token.slice(token.lastIndexOf(".") + 1);
    const swapped = Buffer.from(JSON.stringify({ o: KYC, e: 4_102_444_800 })).toString("base64url");
    await request(app.getHttpServer()).get(`/api/v1/files/signed/${swapped}.${signature}`).expect(403);
  });

  it("refuses an expired token", async () => {
    const url = signer.sign(RECEIPT, 1);
    jest.spyOn(Date, "now").mockReturnValue(Date.now() + 2000);
    await request(app.getHttpServer()).get(url).expect(403);
    jest.restoreAllMocks();
  });

  it("404s a valid token for an object that is gone", async () => {
    await request(app.getHttpServer()).get(signer.sign("deleted.jpg")).expect(404);
  });

  it("no longer answers the unauthenticated routes it replaced", async () => {
    for (const path of [
      `/api/v1/deposit/picture/${RECEIPT}`,
      `/api/v1/admin/deposit/picture/${RECEIPT}`,
      `/api/v1/withdraw/picture/${RECEIPT}`,
      `/api/v1/admin/withdraw/picture/${RECEIPT}`,
    ]) {
      await request(app.getHttpServer()).get(path).expect(404);
    }
  });
});
