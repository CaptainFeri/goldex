import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ShahinProxyController } from './shahin-proxy.controller';
import { ShahinPersistenceService } from './shahin-persistence.service';
import { ShahinAccount } from './entities/shahin-account.entity';
import { ShahinEntry } from './entities/shahin-entry.entity';
import { UserEntity } from '../user/entity/user.entity';
import { SmsModule } from '../sms/sms.module';

@Module({
  imports: [
    HttpModule.registerAsync({
      imports: [ConfigModule],
      useFactory: () => ({
        timeout: 30000,
        maxRedirects: 5,
        // Configure to not use proxy for internal services
        validateStatus: (status) => status < 500,
      }),
    }),
    TypeOrmModule.forFeature([ShahinAccount, ShahinEntry, UserEntity]),
    SmsModule
  ],
  controllers: [ShahinProxyController],
  providers: [ShahinPersistenceService],
  exports: [ShahinPersistenceService],
})
export class ShahinModule {}

