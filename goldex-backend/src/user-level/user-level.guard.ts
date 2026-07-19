import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { REQUIRED_FEATURE_KEY } from "./decorator/require-feature.decorator";
import { UserLevelService } from "./user-level.service";

@Injectable()
export class UserLevelGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly levelService: UserLevelService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const featureKey = this.reflector.getAllAndOverride<string>(REQUIRED_FEATURE_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!featureKey) return true;

    const request = context.switchToHttp().getRequest();
    const userId = request.user?.id || request.user?.userId;
    if (!userId) return true;

    const has = await this.levelService.hasFeature(userId, featureKey);
    if (!has) {
      throw new ForbiddenException(`Access denied. Feature "${featureKey}" is not enabled for your account level.`);
    }
    return true;
  }
}
