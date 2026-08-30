import { ApiProperty } from "@nestjs/swagger";

export class LoginDto {
  @ApiProperty({ description: "phone number", example: "start from zero (09...)" })
  phone: string;
  @ApiProperty({ description: "password", example: "strong password" })
  password: string;
}

export default LoginDto;
