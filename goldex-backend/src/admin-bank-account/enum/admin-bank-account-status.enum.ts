export enum AdminBankAccountStatusEnum {
  ACTIVE = "ACTIVE",
  INACTIVE = "INACTIVE",
  SUSPENDED = "SUSPENDED",
}

/** Which side of a settlement an account is being asked to serve. */
export enum BankAccountDirectionEnum {
  DEPOSIT = "deposit",
  WITHDRAW = "withdraw",
}
