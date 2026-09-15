import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, Length, MaxLength } from 'class-validator';

/**
 * An activation code read off the SIM the provider texts.
 *
 * The one thing only a phone can do. The engine can ask a provider to send a
 * code, but the code arrives on a handset, and until now somebody had to read
 * it down the phone to whoever was at the panel.
 */
export class RelayOtpDto {
  @ApiProperty({ example: 'zaryar', description: 'Which provider the code is for' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  providerKey: string;

  @ApiProperty({ example: '12345', description: 'The digits from the message' })
  @IsString()
  @IsNotEmpty()
  @Length(4, 8)
  code: string;

  @ApiProperty({
    required: false,
    description: 'The message it came from, kept so an operator can tell a wrong match',
  })
  @IsString()
  @IsOptional()
  @MaxLength(500)
  message?: string;
}

export class RelayedOtpDto {
  @ApiProperty({ nullable: true, example: '12345' })
  code: string | null;

  @ApiProperty({ nullable: true, description: 'When it was relayed' })
  receivedAt: string | null;

  @ApiProperty({ nullable: true, description: 'The message it was read from' })
  message?: string | null;
}
