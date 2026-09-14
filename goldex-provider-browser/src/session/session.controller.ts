import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { IsBoolean, IsOptional, IsString, IsNotEmpty, IsArray } from 'class-validator';
import { ServiceTokenGuard } from '../auth/service-token.guard';
import { SessionService } from './session.service';

class OpenSessionDto {
  @IsString()
  @IsNotEmpty()
  providerKey: string;

  @IsString()
  @IsNotEmpty()
  loginUrl: string;

  @IsArray()
  @IsOptional()
  otherUrls?: string[];

  @IsBoolean()
  @IsOptional()
  useProxy?: boolean;
}

@Controller('sessions')
@UseGuards(ServiceTokenGuard)
export class SessionController {
  constructor(private readonly sessions: SessionService) {}

  @Post()
  async open(@Body() dto: OpenSessionDto) {
    return this.sessions.open(dto);
  }

  @Get()
  list() {
    return this.sessions.list();
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.sessions.get(id);
  }

  /** The credentials the login produced, once it has produced them. */
  @Get(':id/captured')
  captured(@Param('id') id: string) {
    return this.sessions.captured(id);
  }

  @Delete(':id')
  async close(@Param('id') id: string) {
    await this.sessions.close(id);
    return { closed: true };
  }
}
