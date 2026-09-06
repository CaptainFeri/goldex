import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { ApiKeyService } from "../api-key.service";
import { API_KEY_HEADER } from "../api-key.constants";
import { ApiKeyStatus } from "../entity/api-key.entity";

@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(private readonly keys: ApiKeyService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const presented = request.headers?.[API_KEY_HEADER];
    if (!presented || typeof presented !== "string") {
      throw new UnauthorizedException("API_KEY.MISSING");
    }

    const key = await this.keys.findByPlaintext(presented);
    // Unknown and revoked are both answered the same way, so a caller cannot
    // learn from the response whether a key ever existed.
    if (!key || key.status === ApiKeyStatus.REVOKED) {
      throw new UnauthorizedException("API_KEY.INVALID");
    }

    if (key.status === ApiKeyStatus.LIMITED && key.monthlyQuota !== null) {
      const used = await this.keys.monthlyRequests(key.id);
      if (used >= key.monthlyQuota) {
        throw new HttpException("API_KEY.QUOTA_EXCEEDED", HttpStatus.TOO_MANY_REQUESTS);
      }
    }

    request.apiKey = key;
    return true;
  }
}
