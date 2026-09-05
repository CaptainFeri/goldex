import { ApiProperty } from "@nestjs/swagger";
import { IsString, MinLength } from "class-validator";

export class ApplyAllocationDto {
  @ApiProperty({
    description: "Option key returned by the allocation suggestion endpoint, e.g. 'orphan-fit:<packetId>'",
  })
  @IsString()
  @MinLength(3)
  optionKey: string;
}