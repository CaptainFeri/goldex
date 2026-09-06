import { OtpScope } from "./operation-otp.enums";

/**
 * What each scope binds a code to.
 *
 * `fields` is the contract between the panel and the server: exactly these
 * keys, in this order, are hashed into the challenge. Both sides read this
 * list, so changing it is a coordinated change — a field added here without
 * the panel following will reject every honest confirmation.
 *
 * Keep `fields` to what an operator is actually confirming. Hashing an
 * incidental field (a note, a client-generated id) buys no safety and turns a
 * harmless edit into a failed confirmation.
 */
export interface OtpScopeDescriptor {
  /** Where the thing being acted on is named. */
  refIdFrom: { source: "param" | "body"; key: string } | null;
  /** Body keys hashed into the challenge, in this order. */
  fields: string[];
  /** A bulk scope takes `refIds[]` and one challenge covering the set. */
  bulk?: boolean;
  /** Shown in the panel's confirmation prompt. */
  label: string;
}

export const OTP_SCOPES: Record<OtpScope, OtpScopeDescriptor> = {
  [OtpScope.WALLET_DEPOSIT]: {
    refIdFrom: { source: "body", key: "walletId" },
    fields: ["walletId", "actionType", "transactionType", "amount"],
    label: "افزایش موجودی کیف‌پول",
  },
  [OtpScope.WALLET_WITHDRAW]: {
    refIdFrom: { source: "body", key: "walletId" },
    fields: ["walletId", "actionType", "transactionType", "amount"],
    label: "کاهش موجودی کیف‌پول",
  },
  [OtpScope.WITHDRAW_APPROVE]: {
    refIdFrom: { source: "param", key: "id" },
    // The amount is server-side on approval, so the withdrawal's own id is
    // what the code is bound to — this code approves *this* withdrawal.
    fields: [],
    label: "تأیید برداشت",
  },
  [OtpScope.WITHDRAW_REJECT]: {
    refIdFrom: { source: "param", key: "id" },
    fields: ["status", "reason"],
    label: "رد برداشت",
  },
  [OtpScope.WITHDRAW_BULK]: {
    refIdFrom: null,
    fields: ["action"],
    bulk: true,
    label: "عملیات گروهی برداشت",
  },
  [OtpScope.ACCOUNTING_VOUCHER]: {
    refIdFrom: { source: "param", key: "id" },
    fields: ["note"],
    label: "ثبت نهایی سند حسابداری",
  },
  [OtpScope.SHAHIN_TRANSFER]: {
    refIdFrom: { source: "body", key: "destinationAccount" },
    fields: ["sourceAccount", "destinationAccount", "amount"],
    label: "انتقال وجه شاهین",
  },
  [OtpScope.EM_APPROVE]: {
    refIdFrom: { source: "param", key: "id" },
    fields: [],
    label: "تأیید برداشت EM",
  },
};

export function descriptorFor(scope: OtpScope): OtpScopeDescriptor {
  const d = OTP_SCOPES[scope];
  if (!d) throw new Error(`No OTP descriptor for scope ${scope}`);
  return d;
}
