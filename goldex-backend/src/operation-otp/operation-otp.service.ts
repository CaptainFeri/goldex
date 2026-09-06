import { BadRequestException, ForbiddenException, Injectable, Logger } from "@nestjs/common";
import { randomBytes, randomInt } from "node:crypto";
import * as bcrypt from "bcryptjs";
import { AdminEntity } from "../admin/entity/admin.entity";
import { RedisService } from "../redis/redis.service";
import { SmsService } from "../sms/sms.service";
import { OTP_CODE_LENGTH, OTP_MAX_ATTEMPTS, OTP_TTL_SECONDS, OtpScope } from "./operation-otp.enums";
import { descriptorFor } from "./otp-scopes";
import { hashPayload, refKeyOf } from "./payload-hash";
import { IssueOtpDto, OtpChallengeDto } from "./dto/operation-otp.dto";

interface StoredChallenge {
  id: string;
  codeHash: string;
  payloadHash: string;
}

/**
 * A one-minute second factor on the mutations that move money.
 *
 * Everything lives in Redis: a challenge that outlives its minute is not a
 * record worth keeping, and a database row would need sweeping.
 */
@Injectable()
export class OperationOtpService {
  private readonly logger = new Logger(OperationOtpService.name);

  constructor(
    private readonly redis: RedisService,
    private readonly sms: SmsService,
  ) {}

  /**
   * The key is derived from who, what and which record — never from the
   * challenge id. Consuming therefore has to arrive at the same key from the
   * request it is authorising, so a code issued for one record cannot be spent
   * on another even if the id is known.
   */
  private key(adminId: string, scope: OtpScope, refKey: string): string {
    return `op_otp:${adminId}:${scope}:${refKey}`;
  }

  async issue(admin: AdminEntity, dto: IssueOtpDto): Promise<OtpChallengeDto> {
    const descriptor = descriptorFor(dto.scope);

    if (descriptor.bulk) {
      if (!dto.refIds?.length) throw new BadRequestException("OTP.REF_IDS_REQUIRED");
    } else if (descriptor.refIdFrom && !dto.refId) {
      throw new BadRequestException("OTP.REF_ID_REQUIRED");
    }

    if (!admin.phone) throw new BadRequestException("OTP.NO_PHONE_ON_FILE");

    const refKey = refKeyOf(dto.refId, dto.refIds);
    const key = this.key(admin.id, dto.scope, refKey);
    const client = this.redis.getClient();

    // One live challenge per (admin, scope, record). Re-issuing would let a
    // single click storm an operator's phone with texts.
    const ttl = await client.ttl(key);
    if (ttl > 0) throw new BadRequestException(`OTP.ALREADY_SENT:${ttl}`);

    const code = this.generateCode();
    const challenge: StoredChallenge = {
      id: randomBytes(16).toString("hex"),
      codeHash: await bcrypt.hash(code, 10),
      payloadHash: dto.payloadHash,
    };

    await client
      .multi()
      .hset(key, {
        id: challenge.id,
        codeHash: challenge.codeHash,
        payloadHash: challenge.payloadHash,
        attempts: "0",
      })
      .expire(key, OTP_TTL_SECONDS)
      .exec();

    const sent = await this.sms.sendOTP(admin.phone, code, process.env.KAVENEGAR_OTP_TEMPLATE || "verify");
    if (!sent.success) {
      // Do not strand the operator behind a challenge whose code never
      // arrived — they would have to wait out the full minute to retry.
      await client.del(key);
      throw new BadRequestException("SMS.SEND_FAILED");
    }

    return {
      challengeId: challenge.id,
      expiresIn: OTP_TTL_SECONDS,
      maskedPhone: maskPhone(admin.phone),
    };
  }

  /**
   * Spend a challenge, or refuse the operation.
   *
   * `payload` is the *server's* view of what is being done — the validated
   * request body — not anything the client asserts about it. Recomputing the
   * hash here is what makes the binding real: a client that asked for a code
   * to move 5,000,000 and then submits 500,000,000 fails this check.
   */
  async consume(
    admin: AdminEntity,
    scope: OtpScope,
    refId: string | null,
    refIds: string[] | null,
    challengeId: string,
    otp: string,
    payload: Record<string, unknown>,
  ): Promise<void> {
    const descriptor = descriptorFor(scope);
    const refKey = refKeyOf(refId, refIds);
    const key = this.key(admin.id, scope, refKey);
    const client = this.redis.getClient();

    const stored = await client.hgetall(key);
    if (!stored?.id) throw new BadRequestException("OTP.EXPIRED");

    // Counted first, and atomically: a wrong guess must cost an attempt even
    // if the request races another, or three parallel requests would each see
    // "attempts = 0" and the limit would mean nothing.
    const attempts = await client.hincrby(key, "attempts", 1);
    if (attempts > OTP_MAX_ATTEMPTS) {
      await client.del(key);
      throw new ForbiddenException("OTP.TOO_MANY_ATTEMPTS");
    }

    if (stored.id !== challengeId) throw new BadRequestException("OTP.CHALLENGE_MISMATCH");

    const expected = hashPayload(scope, refKey, descriptor.fields, payload);
    if (stored.payloadHash !== expected) {
      this.logger.warn(
        `operation OTP payload mismatch for admin ${admin.id} scope ${scope} ref ${refKey}`,
      );
      throw new BadRequestException("OTP.PAYLOAD_MISMATCH");
    }

    const valid = await bcrypt.compare(otp, stored.codeHash);
    if (!valid && !this.devBypassAccepted(otp)) throw new BadRequestException("OTP.INVALID");

    // Single use, whatever happens next: if the operation itself fails, the
    // operator asks for a fresh code rather than retrying with a spent one.
    await client.del(key);
  }

  private generateCode(): string {
    const max = 10 ** OTP_CODE_LENGTH;
    return String(randomInt(0, max)).padStart(OTP_CODE_LENGTH, "0");
  }

  /**
   * A fixed code for local development.
   *
   * Deliberately stricter than the login flow's, which accepts `12345`
   * whenever NODE_ENV is not "production". These are money operations, and a
   * staging box that simply forgot to set NODE_ENV would otherwise be
   * bypassable — so this needs the bypass to be switched on explicitly as
   * well.
   */
  private devBypassAccepted(otp: string): boolean {
    return (
      process.env.NODE_ENV !== "production" &&
      process.env.GOLDEX_OTP_DEV_BYPASS === "1" &&
      otp === "12345"
    );
  }
}

/** `09120000001` → `0912***0001`. Enough to recognise, not enough to disclose. */
export function maskPhone(phone: string): string {
  if (phone.length <= 7) return "***";
  return `${phone.slice(0, 4)}***${phone.slice(-4)}`;
}
