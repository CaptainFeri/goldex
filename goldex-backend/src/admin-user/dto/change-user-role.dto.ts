import { ApiProperty } from "@nestjs/swagger";
import { IsEnum } from "class-validator";
import { UserRoleEnum } from "../../shared/enum/user.role.enum";

export class ChangeUserRoleDto {
  @ApiProperty({ enum: [UserRoleEnum.CUSTOMER, UserRoleEnum.PARTNER], example: UserRoleEnum.PARTNER, description: "Target role (CUSTOMER or PARTNER)" })
  @IsEnum([UserRoleEnum.CUSTOMER, UserRoleEnum.PARTNER])
  role: number;
}
