import { Request } from "express";
import { UserEntity } from "../../../user/entity/user.entity";

export interface UserExpressRequest extends Request {
  user?: UserEntity;
}
