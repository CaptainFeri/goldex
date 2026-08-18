import { Injectable } from "@nestjs/common";
import * as crypto from "crypto";

/**
 * Builds the Kaino-style signature payload:
 * non-empty params joined in the given order, wrapped in '#':  #p1#p2#p3#
 * Empty / null / undefined params are dropped entirely (including their '#').
 */
@Injectable()
export class SignatureService {
  build(params: Record<string, any>, orderedKeys: string[]): string {
    const parts = orderedKeys
      .filter(
        (k) =>
          params[k] !== null &&
          params[k] !== undefined &&
          params[k] !== "",
      )
      .map((k) => String(params[k]));
    return `#${parts.join("#")}#`;
  }

  sign(raw: string, channelKey: string): string {
    return crypto
      .createHmac("sha256", channelKey)
      .update(raw)
      .digest("hex");
  }
}
