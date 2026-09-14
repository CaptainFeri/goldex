import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';

/**
 * Only the backend may drive this service.
 *
 * It publishes no port outside the docker network, so this is the second lock
 * rather than the only one — but a remote-controlled browser sitting inside the
 * server network is worth two. The backend authenticates the admin; this
 * authenticates the backend.
 */
@Injectable()
export class ServiceTokenGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const expected = process.env.BROWSER_SERVICE_TOKEN?.trim();
    if (!expected) {
      throw new UnauthorizedException(
        'BROWSER_SERVICE_TOKEN is not configured; refusing every request',
      );
    }
    const request = context.switchToHttp().getRequest();
    const presented = request.headers['x-service-token'];
    if (presented !== expected) {
      throw new UnauthorizedException('Invalid service token');
    }
    return true;
  }
}
