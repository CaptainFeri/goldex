import { ApiProperty } from "@nestjs/swagger";

export class SetFeatureDto {
  @ApiProperty()
  key: string;

  @ApiProperty()
  value: any;
}
