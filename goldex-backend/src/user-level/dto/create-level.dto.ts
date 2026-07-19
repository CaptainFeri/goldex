import { ApiProperty } from "@nestjs/swagger";

export class CreateLevelDto {
  @ApiProperty()
  name: string;

  @ApiProperty()
  slug: string;

  @ApiProperty({ required: false })
  description?: string;

  @ApiProperty({ required: false, default: 0 })
  priority?: number;

  @ApiProperty({ required: false, default: false })
  isDefault?: boolean;

  @ApiProperty({ required: false, default: {} })
  features?: Record<string, any>;
}
