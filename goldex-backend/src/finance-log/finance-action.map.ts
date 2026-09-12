import { TransactionTypeEnum } from "../wallet/enum/transaction.type.enum";
import { FinanceActionEnum } from "./enum/finance-action.enum";

/**
 * Every wallet transaction type, mapped to the finance-log action it records.
 *
 * Written as a total `Record` over `TransactionTypeEnum` on purpose: adding a
 * transaction type without deciding how it is logged becomes a compile error
 * rather than a silently unlogged money movement.
 */
const BY_TRANSACTION_TYPE: Record<TransactionTypeEnum, FinanceActionEnum> = {
  [TransactionTypeEnum.DEPOSIT]: FinanceActionEnum.DEPOSIT,
  [TransactionTypeEnum.WITHDRAWAL]: FinanceActionEnum.WITHDRAWAL,
  [TransactionTypeEnum.BUY]: FinanceActionEnum.ORDER_BUY,
  [TransactionTypeEnum.SELL]: FinanceActionEnum.ORDER_SELL,
  [TransactionTypeEnum.ADMIN_ADJUSTMENT]: FinanceActionEnum.ADMIN_ADJUSTMENT,
  [TransactionTypeEnum.FEE]: FinanceActionEnum.COMMISSION,
  [TransactionTypeEnum.REFERRAL]: FinanceActionEnum.REFERRAL,
  [TransactionTypeEnum.ORDER]: FinanceActionEnum.ORDER_PLACED,
  [TransactionTypeEnum.ORDER_CANCEL]: FinanceActionEnum.ORDER_CANCELLED,
  [TransactionTypeEnum.ORDER_REJECTED]: FinanceActionEnum.ORDER_REJECTED,
  [TransactionTypeEnum.MATERIAL_DEPOSIT]: FinanceActionEnum.MATERIAL_DEPOSIT,
  [TransactionTypeEnum.MATERIAL_WITHDRAW]: FinanceActionEnum.MATERIAL_WITHDRAW,
  [TransactionTypeEnum.CREDIT_DEPOSIT]: FinanceActionEnum.CREDIT_DEPOSIT,
  [TransactionTypeEnum.CREDIT_WITHDRAWAL]: FinanceActionEnum.CREDIT_WITHDRAWAL,
  [TransactionTypeEnum.CREDIT_LIQUIDATION]: FinanceActionEnum.LIQUIDATION,
  [TransactionTypeEnum.CREDIT_SETTLEMENT]: FinanceActionEnum.CREDIT_SETTLED,
  [TransactionTypeEnum.MATERIAL_FREEZE]: FinanceActionEnum.MATERIAL_FREEZE,
  [TransactionTypeEnum.MATERIAL_UNFREEZE]: FinanceActionEnum.MATERIAL_UNFREEZE,
  [TransactionTypeEnum.P2P_WITHDRAW_LOCK]: FinanceActionEnum.P2P_WITHDRAW_LOCK,
  [TransactionTypeEnum.P2P_WITHDRAW_SETTLE]: FinanceActionEnum.P2P_WITHDRAW_SETTLE,
  [TransactionTypeEnum.P2P_WITHDRAW_RELEASE]: FinanceActionEnum.P2P_WITHDRAW_RELEASE,
  [TransactionTypeEnum.P2P_DEPOSIT_SETTLE]: FinanceActionEnum.P2P_DEPOSIT_SETTLE,
  [TransactionTypeEnum.P2P_ADMIN_SETTLE]: FinanceActionEnum.P2P_ADMIN_SETTLE,
};

/**
 * The action a wallet transaction of this type records. Falls back to `OTHER`
 * rather than throwing: a transaction type this build does not know about must
 * still be logged, because an unrecognised movement is exactly the one an
 * auditor needs to see.
 */
export function mapTransactionType(type: string | null | undefined): FinanceActionEnum {
  if (!type) return FinanceActionEnum.OTHER;
  return BY_TRANSACTION_TYPE[type as TransactionTypeEnum] ?? FinanceActionEnum.OTHER;
}
