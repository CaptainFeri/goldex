import { BadRequestException, CanActivate, ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { OperationOtpService } from "../operation-otp.service";
import { OtpScope } from "../operation-otp.enums";
import { descriptorFor } from "../otp-scopes";
import { OPERATION_OTP_SCOPE } from "./require-otp.decorator";

/**
 * Spends the challenge before the handler runs.
 *
 * The reference and the payload are read from the request the guard is
 * authorising, never from anything the client says they are — that is the
 * whole point of binding the code to a payload hash.
 */
@Injectable()
export class OperationOtpGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly otp: OperationOtpService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const scope = this.reflector.get<OtpScope>(OPERATION_OTP_SCOPE, context.getHandler());
    if (!scope) return true;

    const request = context.switchToHttp().getRequest();
    const admin = request.admin;
    if (!admin) throw new UnauthorizedException("ADMIN.UNAUTHENTICATED");

    const body = (request.body ?? {}) as Record<string, unknown>;
    const { challengeId, otp } = body;
    if (typeof challengeId !== "string" || typeof otp !== "string") {
      throw new BadRequestException("OTP.CONFIRMATION_REQUIRED");
    }

    const descriptor = descriptorFor(scope);
    let refId: string | null = null;
    let refIds: string[] | null = null;

    if (descriptor.bulk) {
      const ids = body.refIds ?? body.ids;
      if (!Array.isArray(ids) || ids.length === 0) throw new BadRequestException("OTP.REF_IDS_REQUIRED");
      refIds = ids.map(String);
    } else if (descriptor.refIdFrom) {
      const { source, key } = descriptor.refIdFrom;
      const value = source === "param" ? request.params?.[key] : body[key];
      if (value === undefined || value === null || value === "") {
        throw new BadRequestException("OTP.REF_ID_REQUIRED");
      }
      refId = String(value);
    }

    await this.otp.consume(admin, scope, refId, refIds, challengeId, otp, body);
    return true;
  }
}
