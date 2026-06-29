import { ApiProperty } from "@nestjs/swagger";

export class VerifyLevel1Dto {
  @ApiProperty()
  nationalId: string;
}
