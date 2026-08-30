import { ApiProperty } from '@nestjs/swagger';

export class DeviceLogoutDto {
  @ApiProperty({ type: 'string' })
  deviceId: string;
}
