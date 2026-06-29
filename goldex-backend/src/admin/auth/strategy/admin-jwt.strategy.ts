import { ConfigService, ConfigType } from '@nestjs/config';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PassportStrategy } from '@nestjs/passport';
import { Injectable } from '@nestjs/common';
import appEnvConfig from '../../../config/app.env.config';

@Injectable()
export class AdminJwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    // private readonly superadminService: SuperadminService,
    private readonly configService: ConfigService<ConfigType<typeof appEnvConfig>>
  ) {
    const adminInfo = configService.get('admin', { infer: true });
    super({
      ignoreExpiration: false,
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey: adminInfo.superAdminJwtSecret,
    });
  }

  async validate() {
    return true;
  }
}
