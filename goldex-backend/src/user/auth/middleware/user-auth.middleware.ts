import { Injectable, NestMiddleware } from "@nestjs/common";
import { ConfigService, ConfigType } from "@nestjs/config";
import { verify } from "jsonwebtoken";
import appEnvConfig from "../../../config/app.env.config";
import { UserService } from "../../service/user.service";
import { UserExpressRequest } from "../types/user-express-request";
import { UserRoleEnum } from "../../../shared/enum/user.role.enum";

@Injectable()
export class UserAuthMiddleware implements NestMiddleware {
  constructor(
    private readonly configService: ConfigService<ConfigType<typeof appEnvConfig>>,
    private readonly userService: UserService
  ) {}

  async use(req: UserExpressRequest, res: any, next: (error?: any) => void) {
    try {
      if (!req.headers.authorization) {
        req.user = null;
        next();
        return;
      }

      const token = req.headers.authorization.split(" ")[1];
      let decode: any;

      const isRegistrationRoute = req.path.includes("complete-registration");

      if (isRegistrationRoute) {
        decode = verify(token, this.configService.get("user", { infer: true })?.userJwtSecret || "", {
          ignoreExpiration: false,
        });

        if (decode.isTemporary) {
          if (!req.path.includes("complete-registration")) {
            req.user = null;
            next();
            return;
          }

          const user = await this.userService.findUserById(decode.userId);
          if (user && user.role === UserRoleEnum.NEW_USER) {
            req.user = user;
            next();
            return;
          }
        }
      }

      if (req.path.includes("refresh")) {
        decode = verify(token, this.configService.get("user", { infer: true })?.userJwtSecret || "", {
          ignoreExpiration: true,
        });
        console.log(decode);
      } else if (req.path.includes("reset-password")) {
        decode = verify(token, this.configService.get("user", { infer: true })?.userResetPasswordSecret || "");
      } else {
        decode = verify(token, this.configService.get("user", { infer: true })?.userJwtSecret || "");
      }

      let fundUser;
      if (req.path.includes("register")) {
        fundUser = await this.userService.findUser(req, decode["userId"], decode["role"], false);
      } else {
        fundUser = await this.userService.findUser(req, decode["userId"], decode["role"], true);
      }

      req.user = fundUser;
      next();
    } catch (e) {
      req.user = null;
      next();
    }
  }
}
