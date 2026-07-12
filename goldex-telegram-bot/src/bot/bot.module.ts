import { Module } from '@nestjs/common';
import { BotService } from './bot.service';
import { UserModule } from '../user/user.module';
import { BackendApiModule } from '../backend-api/backend-api.module';
import { ChannelModule } from '../channel/channel.module';

@Module({
  imports: [UserModule, BackendApiModule, ChannelModule],
  providers: [BotService],
  exports: [BotService],
})
export class BotModule {}
