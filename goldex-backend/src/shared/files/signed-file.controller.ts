import { Controller, Get, NotFoundException, Param, Res } from "@nestjs/common";
import { ApiExcludeController } from "@nestjs/swagger";
import { Response } from "express";
import { MinioService } from "../../minio/minio.service";
import { SignedFileUrlService } from "./signed-file-url.service";

/**
 * Serves objects named by a token minted by {@link SignedFileUrlService}.
 *
 * Deliberately unguarded: the token *is* the credential. That is what lets the
 * panel put the URL straight into `<img src>`, which cannot send an
 * `Authorization` header. Unlike the routes this replaces, holding the URL
 * means an operator was served it in a response they were entitled to, and it
 * stops working on its own a few minutes later.
 *
 * Excluded from the OpenAPI document: there is nothing for a client to
 * construct here. Clients read `pictureUrl` off a deposit or withdrawal and
 * follow it.
 */
@ApiExcludeController()
// Mounted under its own prefix: `src/file/file.controller.ts` already owns
// `files`, and a bare `:token` next to it would be one careless @Get away from
// shadowing or being shadowed.
@Controller("files/signed")
export class SignedFileController {
  constructor(
    private readonly minioService: MinioService,
    private readonly signedFileUrlService: SignedFileUrlService,
  ) {}

  @Get(":token")
  async get(@Param("token") token: string, @Res() res: Response) {
    const objectName = this.signedFileUrlService.verify(token);
    const bucket = process.env.MINIO_BUCKET || "default";

    let stat: Awaited<ReturnType<MinioService["getFileStat"]>>;
    try {
      stat = await this.minioService.getFileStat(bucket, objectName);
    } catch {
      throw new NotFoundException("File not found");
    }

    res.set({
      "Content-Type": stat.contentType,
      "Content-Length": stat.size.toString(),
      // The URL expires, so a shared cache holding the response past that point
      // would outlive the grant it was served under.
      "Cache-Control": "private, max-age=300",
      // Receipts and KYC scans are images, but the object name is not something
      // this route validates -- refuse to let a stored file be sniffed into
      // something the browser would execute.
      "X-Content-Type-Options": "nosniff",
      "Content-Disposition": "inline",
    });

    const stream = await this.minioService.getFileStream(bucket, objectName);
    stream.pipe(res);
  }
}
