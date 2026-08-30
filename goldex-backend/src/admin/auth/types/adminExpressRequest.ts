import { Request } from 'express';

export interface AdminExpressRequest extends Request {
  admin?: any;
}
