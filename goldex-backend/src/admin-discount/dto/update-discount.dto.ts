import { ApiProperty } from '@nestjs/swagger';

export class UpdateDiscountDto {
  @ApiProperty()
  usageLimit: number;
  @ApiProperty()
  expiredAt: Date;
}
