import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { ProviderModule } from '../provider/provider.module';
import { ProviderBrowserClient } from './provider-browser.client';
import { ProviderBrowserController } from './provider-browser.controller';
import { ProviderBrowserGateway } from './provider-browser.gateway';
import { ProviderBrowserService } from './provider-browser.service';

@Module({
  imports: [HttpModule, ProviderModule],
  controllers: [ProviderBrowserController],
  providers: [ProviderBrowserClient, ProviderBrowserService, ProviderBrowserGateway],
  exports: [ProviderBrowserService],
})
export class ProviderBrowserModule {}
