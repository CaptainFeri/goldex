import { IsIn, IsOptional } from 'class-validator';
import { MarketStatus } from '../entity/pair-pool-status.entity';

export class SetOverrideDto {
  @IsOptional()
  @IsIn([MarketStatus.OPEN, MarketStatus.CLOSED, 'null'])
  status?: MarketStatus | 'null';
}
