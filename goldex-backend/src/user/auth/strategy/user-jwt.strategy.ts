import { Injectable } from '@nestjs/common';
import { ConfigService, ConfigType } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import appEnvConfig from '../../../config/app.env.config';
import { UserService } from '../../service/user.service';

@Injectable()
export class UserJwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private readonly userService: UserService,
    private readonly configService: ConfigService<
      ConfigType<typeof appEnvConfig>
    >,
  ) {
    const userInfo = configService.get('user', { infer: true });
    super({
      ignoreExpiration: false,
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey: userInfo?.userJwtSecret,
    });
  }

  async validate() {
    return true;
  }
}
