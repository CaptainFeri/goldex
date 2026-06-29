export interface ItemMetadata {
  itemId: number;
  name: string;
  unit: string;
  groupId: number;
  groupName: string;
  canBuy?: boolean;
  canSell?: boolean;
}
