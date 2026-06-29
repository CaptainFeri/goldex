import {
  Body,
  Controller,
  DefaultValuePipe,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiOperation } from '@nestjs/swagger';
import { ArbitrageService } from './arbitrage.service';
import { ArbitrageConfig } from './types/arbitrage-signal.type';

@Controller('arbitrage')
export class ArbitrageController {
  constructor(private readonly arbitrageService: ArbitrageService) {}

  @Get()
  @ApiOperation({ summary: 'Latest arbitrage opportunities (cached, real-time)' })
  async current() {
    const result = await this.arbitrageService.getCurrent();
    return { data: result };
  }

  @Post('scan')
  @ApiOperation({ summary: 'Force a fresh scan and return arbitrage opportunities' })
  async scan() {
    const result = await this.arbitrageService.scanNow();
    return { data: result };
  }

  @Get('history')
  @ApiOperation({ summary: 'Recently detected arbitrage signals' })
  async history(@Query('limit', new DefaultValuePipe(100), ParseIntPipe) limit: number) {
    const data = await this.arbitrageService.getHistory(limit);
    return { data };
  }

  @Get('stats')
  @ApiOperation({ summary: 'Arbitrage engine statistics' })
  stats() {
    return { data: this.arbitrageService.getStats() };
  }

  @Get('config')
  @ApiOperation({ summary: 'Current arbitrage engine configuration' })
  config() {
    return { data: this.arbitrageService.getConfig() };
  }

  @Patch('config')
  @ApiOperation({ summary: 'Update arbitrage engine configuration' })
  updateConfig(@Body() partial: Partial<ArbitrageConfig>) {
    return { data: this.arbitrageService.updateConfig(partial) };
  }

  @Get('item/:itemId')
  @ApiOperation({ summary: 'Latest arbitrage signal for a single item' })
  async byItem(@Param('itemId', ParseIntPipe) itemId: number) {
    const result = await this.arbitrageService.getCurrent();
    const signal = result?.signals.find((s) => s.itemId === itemId) ?? null;
    return { data: signal };
  }
}
