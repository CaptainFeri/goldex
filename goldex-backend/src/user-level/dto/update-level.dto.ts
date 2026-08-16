import { ApiProperty } from "@nestjs/swagger";

export class UpdateLevelDto {
  @ApiProperty({ required: false })
  name?: string;

  @ApiProperty({ required: false })
  slug?: string;

  @ApiProperty({ required: false })
  description?: string;

  @ApiProperty({ required: false })
  priority?: number;

  @ApiProperty({ required: false })
  isDefault?: boolean;

  @ApiProperty({ required: false })
  features?: Record<string, any>;

  @ApiProperty({ required: false, type: [String] })
  pairIds?: string[];
}
