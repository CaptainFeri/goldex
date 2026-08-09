import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

/**
 * Guards the CBP admin HTTP surface. Requires the `X-Admin-Key` header to
 * match `CBP_ADMIN_API_KEY`. When the key is unset (local dev) the guard
 * is disabled so the endpoints stay reachable for testing.
 */
@Injectable()
export class CbpAdminKeyGuard implements CanActivate {
  private readonly adminKey: string;

  constructor(config: ConfigService) {
    this.adminKey = config.get("app", { infer: true }).adminApiKey ?? "";
  }

  canActivate(ctx: ExecutionContext): boolean {
    if (!this.adminKey) {
      return true;
    }
    const req = ctx.switchToHttp().getRequest();
    const header = req.headers["x-admin-key"];
    if (header !== this.adminKey) {
      throw new ForbiddenException("Invalid CBP admin key");
    }
    return true;
  }
}
