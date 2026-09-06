/**
 * The mutations that require a second factor.
 *
 * Every value here is a money path or an irreversible state change. Adding a
 * scope is cheap; the descriptor in `otp-scopes.ts` is what makes it real.
 */
export enum OtpScope {
  WALLET_DEPOSIT = "wallet.deposit",
  WALLET_WITHDRAW = "wallet.withdraw",
  WITHDRAW_APPROVE = "withdraw.approve",
  WITHDRAW_REJECT = "withdraw.reject",
  WITHDRAW_BULK = "withdraw.bulk",
  ACCOUNTING_VOUCHER = "accounting.voucher",
  SHAHIN_TRANSFER = "shahin.transfer",
  EM_APPROVE = "em.approve",
}

/** Codes live for a minute. Long enough to read an SMS, short enough to matter. */
export const OTP_TTL_SECONDS = 60;

/** Wrong guesses before the challenge is destroyed outright. */
export const OTP_MAX_ATTEMPTS = 3;

export const OTP_CODE_LENGTH = 5;
