import { ApiProperty } from '@nestjs/swagger';
import { LanguageEnum } from '../../baseinfo/enum/language.type.enum';

export class UpdateUserSettingsDto {
  @ApiProperty({ enum: LanguageEnum })
  defaultLanguageId: number;

  @ApiProperty()
  isEmailNotificationEnabled: boolean;
}
