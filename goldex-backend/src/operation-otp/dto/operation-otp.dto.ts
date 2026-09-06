import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { ArrayMaxSize, ArrayMinSize, IsArray, IsEnum, IsOptional, IsString, Length, Matches } from "class-validator";
import { OtpScope } from "../operation-otp.enums";

export class IssueOtpDto {
  @ApiProperty({ enum: OtpScope })
  @IsEnum(OtpScope)
  scope: OtpScope;

  @ApiPropertyOptional({ description: "The record being acted on. Required unless the scope is bulk." })
  @IsOptional()
  @IsString()
  @Length(1, 100)
  refId?: string;

  @ApiPropertyOptional({ description: "For bulk scopes: one challenge covers this whole set.", type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  refIds?: string[];

  @ApiProperty({
    description:
      "SHA-256 of the canonical payload, binding the code to this exact operation. " +
      "Derived from the scope's declared fields — see docs/OPERATION-OTP.md.",
  })
  @Matches(/^[0-9a-f]{64}$/, { message: "payloadHash must be a sha256 hex digest" })
  payloadHash: string;
}

export class OtpChallengeDto {
  @ApiProperty() challengeId: string;
  @ApiProperty({ example: 60 }) expiresIn: number;
  @ApiProperty({ example: "0912***0001" }) maskedPhone: string;
}

/** Mixed into an action's own DTO by the endpoints that require a second factor. */
export class OtpConfirmationDto {
  @ApiProperty({ description: "From POST /admin/operations/otp." })
  @IsString()
  @Length(1, 64)
  challengeId: string;

  @ApiProperty({ description: "The code sent by SMS." })
  @IsString()
  @Length(4, 8)
  otp: string;
}
