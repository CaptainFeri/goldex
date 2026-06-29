export interface DealView {
  itemId: number;
  itemName: string;
  price: number;
  discountPrice: number;
  minCount: number;
  maxCount: number;
  waitTime: number;
  canDoDeal: boolean;
}
