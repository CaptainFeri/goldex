import {
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { UserExpressRequest } from '../types/user-express-request';

export class UserAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request: UserExpressRequest = context.switchToHttp().getRequest();
    if (request.user != null) {
      return true;
    }
    throw new UnauthorizedException('FORBIDDEN');
  }
}
