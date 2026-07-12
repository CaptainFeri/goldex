import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { BackendApiService } from './backend-api.service';

@Module({
  imports: [HttpModule],
  providers: [BackendApiService],
  exports: [BackendApiService],
})
export class BackendApiModule {}
