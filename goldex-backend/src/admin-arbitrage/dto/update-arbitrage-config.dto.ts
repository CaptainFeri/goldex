import { IsInt, IsNumber, IsOptional, Max, Min } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

/**
 * Partial update of the pricing-engine's arbitrage scan config. Every field is
 * optional; only what is sent is changed. Bounds keep an operator from setting
 * a scan interval that would hammer the engine or a freshness window that would
 * surface quotes nobody is honouring.
 */
export class UpdateArbitrageConfigDto {
  @IsOptional()
  @IsNumber()
  @Min(0)
  @ApiProperty({ required: false, description: 'Minimum absolute profit (toman) for a signal' })
  minProfitToman?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  @ApiProperty({ required: false, description: 'Minimum profit percentage for a signal' })
  minProfitPercent?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1000)
  @ApiProperty({ required: false, description: 'Cap on signals returned per scan' })
  maxSignals?: number;

  @IsOptional()
  @IsInt()
  @Min(1_000)
  @Max(600_000)
  @ApiProperty({ required: false, description: 'How long a provider quote stays fresh (ms)' })
  quoteFreshnessMs?: number;

  @IsOptional()
  @IsInt()
  @Min(1_000)
  @Max(600_000)
  @ApiProperty({ required: false, description: 'TTL applied to a detected signal (ms)' })
  signalTtlMs?: number;

  @IsOptional()
  @IsInt()
  @Min(1_000)
  @Max(600_000)
  @ApiProperty({ required: false, description: 'Safety-net full scan cadence (ms)' })
  scanIntervalMs?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(10_000)
  @ApiProperty({ required: false, description: 'Coalescing window for price-tick recomputes (ms)' })
  recomputeDebounceMs?: number;
}
