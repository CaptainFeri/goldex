import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Request } from 'express';
import { ProviderLoginDeviceEntity } from '../entity/provider-login-device.entity';
import { LoginDeviceService } from './login-device.service';

export interface DeviceRequest extends Request {
  device?: ProviderLoginDeviceEntity;
}

/**
 * Admits a handset holding a device credential, and nothing else.
 *
 * Deliberately not an "admin token or device token" guard bolted onto the
 * admin controller. The whole point of the credential is that it opens a
 * smaller door, and a guard that widens an existing door cannot express that —
 * the routes a device may call are a separate controller, and this is what
 * stands in front of it.
 */
@Injectable()
export class DeviceAuthGuard implements CanActivate {
  constructor(private readonly devices: LoginDeviceService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<DeviceRequest>();
    const header = request.headers.authorization ?? '';
    const token = header.startsWith('Bearer ') ? header.slice(7).trim() : undefined;

    const device = await this.devices.authenticate(token);
    if (!device) {
      // One message for an absent token, a malformed one, an unknown one and a
      // revoked one: which of those it was is not something an unauthenticated
      // caller should be able to work out.
      throw new UnauthorizedException('Device credential is not valid');
    }

    request.device = device;
    return true;
  }
}
