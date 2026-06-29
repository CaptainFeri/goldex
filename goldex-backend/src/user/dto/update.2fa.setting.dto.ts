import { ApiProperty } from '@nestjs/swagger';

export class Update2faSettingDto {
  @ApiProperty({
    type: 'boolean',
  })
  loginActivation: boolean;
}
