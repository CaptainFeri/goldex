import { UserRoleEnum } from "../enum/user.role.enum";

interface TokenPayload {
  userId: string;
  role: UserRoleEnum;
  isTemporary?: boolean;
  // isSecondFactorAuthenticated?: boolean;
}

export default TokenPayload;
