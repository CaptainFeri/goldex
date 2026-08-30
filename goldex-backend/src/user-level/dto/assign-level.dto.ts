import { ApiProperty } from "@nestjs/swagger";

export class AssignLevelDto {
  @ApiProperty()
  userId: string;

  @ApiProperty()
  levelId: string;

  @ApiProperty({ required: false })
  expiresAt?: Date;
}
