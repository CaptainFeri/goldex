// user/dto/register.dto.ts
import { IsString, IsNotEmpty, IsOptional, IsEmail, MinLength, MaxLength, IsEnum } from "class-validator";
import { GenderEnum } from "../../shared/enum/gender.enum";
import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

export class RegisterDto {
  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  @MaxLength(50)
  @ApiProperty()
  firstName: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  @MaxLength(50)
  @ApiProperty()
  lastName: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(6)
  @ApiProperty()
  password: string;

  @IsEmail()
  @IsOptional()
  @ApiPropertyOptional()
  email?: string;

  @IsOptional()
  @IsString()
  @ApiPropertyOptional()
  referralCode?: string;
}

export class CompleteRegistrationDto extends RegisterDto {
  @IsString()
  @IsNotEmpty()
  userId: string;

  @IsOptional()
  @IsString()
  temporaryToken?: string;
}
