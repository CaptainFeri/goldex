import { Module } from '@nestjs/common';
import { SessionService } from './session/session.service';
import { SessionController } from './session/session.controller';
import { BrowserGateway } from './session/browser.gateway';

@Module({
  controllers: [SessionController],
  providers: [SessionService, BrowserGateway],
})
export class AppModule {}
