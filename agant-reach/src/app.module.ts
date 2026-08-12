import { Module } from '@nestjs/common';
import { ThrottlerModule } from '@nestjs/throttler';
import { ReachModule } from './reach/reach.module';
import { ConfigService } from './config.service';
import { CliExecutorService } from './cli-executor.service';

@Module({
  imports: [
    ThrottlerModule.forRoot([{ ttl: 60000, limit: 30 }]),
    ReachModule,
  ],
  providers: [ConfigService, CliExecutorService],
  exports: [ConfigService, CliExecutorService],
})
export class AppModule {}