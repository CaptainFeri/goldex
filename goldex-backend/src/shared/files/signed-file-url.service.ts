import { ForbiddenException, Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createHmac, timingSafeEqual } from "crypto";

/**
 * How long a minted file URL stays valid.
 *
 * Long enough for a list of receipts to render and for an operator to open one
 * in a new tab; short enough that a URL leaked through a screenshot, a shared
 * link or a proxy log is dead by the time anyone replays it.
 */
export const DEFAULT_FILE_URL_TTL_SECONDS = 15 * 60;

/**
 * Domain separation for the derived key. Changing this string invalidates every
 * URL already in flight, which is the intended way to revoke them all at once.
 */
const KEY_DERIVATION_LABEL = "goldex.signed-file-url.v1";

/**
 * Mints and validates short-lived, capability-bearing URLs for objects in
 * MinIO.
 *
 * ## Why not a MinIO presigned URL
 *
 * A MinIO-signed URL is signed for the host the client will connect to, and
 * `docker-compose.yml` binds MinIO to `127.0.0.1:9000` on the host with no
 * reverse proxy in front of it. A URL pointing at `http://minio:9000/...` is
 * unreachable from an operator's browser, and exposing MinIO publicly to fix
 * that would widen the deployment's attack surface to close a narrower hole.
 *
 * So the backend signs instead, and keeps streaming the bytes as it already
 * does. The security properties that matter are the same: the URL carries its
 * own authorization, is unguessable without the key, expires on its own, and
 * needs no `Authorization` header -- which is what lets `<img src>` use it,
 * and is exactly why the routes it replaces had no guard at all.
 *
 * ## Threat model
 *
 * The token authorizes *one object* until it expires. It does not identify the
 * caller, so anyone holding the URL can fetch that object within the window:
 * treat a minted URL as the file itself, and only put one in a response the
 * caller was already entitled to read.
 */
@Injectable()
export class SignedFileUrlService {
  private readonly logger = new Logger(SignedFileUrlService.name);
  private readonly key: Buffer;

  constructor(private readonly config: ConfigService) {
    // A dedicated secret when one is configured, otherwise derived from the
    // admin JWT secret, which the app already refuses to boot without. The
    // derivation keeps this key distinct from the one signing admin sessions,
    // so a file URL can never be replayed as a token or vice versa.
    const dedicated = this.config.get<string>("GOLDEX_FILE_URL_SECRET");
    const fallback = this.config.get<string>("GOLDEX_AUTH_ADMIN_JWT_SECRET");
    const material = dedicated || fallback;

    if (!material) {
      throw new Error(
        "Cannot sign file URLs: set GOLDEX_FILE_URL_SECRET or GOLDEX_AUTH_ADMIN_JWT_SECRET.",
      );
    }
    if (!dedicated) {
      this.logger.warn(
        "GOLDEX_FILE_URL_SECRET is not set; deriving the file-URL key from GOLDEX_AUTH_ADMIN_JWT_SECRET.",
      );
    }

    this.key = createHmac("sha256", material).update(KEY_DERIVATION_LABEL).digest();
  }

  /**
   * Mint a relative URL that serves `objectName` until it expires.
   *
   * Relative on purpose: the panel and the user app reach the API on their own
   * origins, so a URL built here from a guessed public hostname would be wrong
   * for at least one of them.
   */
  sign(objectName: string, ttlSeconds: number = DEFAULT_FILE_URL_TTL_SECONDS): string {
    const expiresAt = Math.floor(Date.now() / 1000) + ttlSeconds;
    const payload = base64Url(Buffer.from(JSON.stringify({ o: objectName, e: expiresAt })));
    const signature = base64Url(this.mac(payload));
    return `/api/v1/files/signed/${payload}.${signature}`;
  }

  /**
   * Recover the object name from a token, or throw.
   *
   * Every rejection is a plain `ForbiddenException` with the same message: a
   * caller probing for objects should not learn whether a token was malformed,
   * forged or merely stale.
   */
  verify(token: string): string {
    const separator = token.lastIndexOf(".");
    if (separator <= 0) throw new ForbiddenException("Invalid or expired file link");

    const payload = token.slice(0, separator);
    const signature = token.slice(separator + 1);

    let provided: Buffer;
    try {
      provided = Buffer.from(signature, "base64url");
    } catch {
      throw new ForbiddenException("Invalid or expired file link");
    }

    const expected = this.mac(payload);
    // Compare in constant time, and only once the lengths match -- timingSafeEqual
    // throws rather than returning false when they differ.
    if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) {
      throw new ForbiddenException("Invalid or expired file link");
    }

    let claims: { o?: unknown; e?: unknown };
    try {
      claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    } catch {
      throw new ForbiddenException("Invalid or expired file link");
    }

    if (typeof claims.o !== "string" || !claims.o || typeof claims.e !== "number") {
      throw new ForbiddenException("Invalid or expired file link");
    }
    if (claims.e < Math.floor(Date.now() / 1000)) {
      throw new ForbiddenException("Invalid or expired file link");
    }

    return claims.o;
  }

  private mac(payload: string): Buffer {
    return createHmac("sha256", this.key).update(payload).digest();
  }
}

function base64Url(buffer: Buffer): string {
  return buffer.toString("base64url");
}
