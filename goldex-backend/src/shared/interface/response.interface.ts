export type ObjectKeyValue = { [key: string]: any };
export type ObjectKeyStringValue = { [key: string]: string };

export interface IResponse {
  data?: ObjectKeyValue | null;
  message?: string | null;
  status?: number | null;
  errors?: ObjectKeyStringValue;
}
