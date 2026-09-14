import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsObject } from 'class-validator';

/**
 * Credentials an admin obtained by signing in to the provider themselves.
 *
 * Free-form beyond the token because each provider's session is shaped
 * differently — Zaryar's carries `uId`, `sessionId` and `shopkeeperId`
 * alongside the token, Talaab's is the token alone — and the engine's own
 * provider implementations are what read the rest. Requiring a token here is
 * the one thing that is true of all of them, and it is checked again in the
 * engine, which is the side that has to use it.
 */
export class SetProviderAuthDto {
  @ApiProperty({
    type: Object,
    description: "The provider session, as captured from its own web panel. Must include a token.",
    example: {
      token: "eyJhbGciOi…",
      uId: "1234",
      sessionId: "abcd",
      shopkeeperId: "42",
      roleType: "0",
    },
  })
  @IsObject()
  @IsNotEmpty()
  auth: Record<string, any>;
}
