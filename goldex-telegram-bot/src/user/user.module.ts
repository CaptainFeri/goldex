import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { TelegramUserEntity } from './entity/telegram-user.entity';
import { UserService } from './user.service';

@Module({
  imports: [TypeOrmModule.forFeature([TelegramUserEntity])],
  providers: [UserService],
  exports: [UserService],
})
export class UserModule {}
