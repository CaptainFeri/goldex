import { ApiProperty } from "@nestjs/swagger";

export class AdminLoginDto {
  @ApiProperty({ description: "email", example: "test@test.com" })
  email: string;
  @ApiProperty({ description: "password", example: "strong password" })
  password: string;
}

export default AdminLoginDto;
