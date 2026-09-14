import { ApiProperty } from '@nestjs/swagger';

export class BrowserSessionDto {
  @ApiProperty({ description: 'Watch this id on the admin-provider-browser namespace' })
  id: string;

  @ApiProperty({ example: 'zaryar' })
  providerKey: string;

  @ApiProperty({ description: "The provider's login page, which the browser opened" })
  loginUrl: string;

  @ApiProperty({
    isArray: true,
    type: String,
    description:
      'Every host this browser may reach. Anything else it requests is aborted.',
  })
  allowedHosts: string[];

  @ApiProperty({ description: 'The browser closes itself at this time whatever has happened' })
  expiresAt: string;

  @ApiProperty({ description: 'Whether the login has produced credentials yet' })
  captured: boolean;
}

export class BrowserSessionClosedDto {
  @ApiProperty({ example: true })
  closed: boolean;
}
