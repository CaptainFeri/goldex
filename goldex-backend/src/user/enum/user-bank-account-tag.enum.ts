export enum UserBankAccountTagEnum {
  /** Created by the level-2 KYC flow; owned and verified by the customer. */
  KYC = "KYC",
  /** Supplied by the customer for a p2p transfer. Not ownership-checked. */
  P2P_WALLET = "P2P_WALLET",
}
