import { SetMetadata, UseGuards, applyDecorators } from "@nestjs/common";
import { ApiBadRequestResponse } from "@nestjs/swagger";
import { OtpScope } from "../operation-otp.enums";
import { OperationOtpGuard } from "./operation-otp.guard";

export const OPERATION_OTP_SCOPE = "operation-otp:scope";

/**
 * Gate this mutation behind a one-minute code.
 *
 * The handler's body must carry `challengeId` and `otp` — mix `OtpConfirmationDto`
 * into its DTO so they are validated rather than silently ignored.
 *
 * Applying this to an endpoint is a breaking change for whatever already calls
 * it: requests without a confirmation start failing. Land it together with the
 * client that supplies one.
 */
export function RequireOperationOtp(scope: OtpScope) {
  return applyDecorators(
    SetMetadata(OPERATION_OTP_SCOPE, scope),
    UseGuards(OperationOtpGuard),
    ApiBadRequestResponse({
      description:
        "OTP.EXPIRED, OTP.INVALID, OTP.CHALLENGE_MISMATCH or OTP.PAYLOAD_MISMATCH — " +
        "the last meaning the confirmed operation is not the one now being submitted.",
    }),
  );
}
