import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpException,
  HttpStatus,
  Post,
} from '@nestjs/common';
import { TelegramService } from '../telegram.service';

@Controller('api/auth')
export class AuthController {
  constructor(private readonly telegram: TelegramService) {}

  @Get('status')
  status() {
    return this.telegram.getAuthState();
  }

  @Post('code')
  @HttpCode(200)
  submitCode(@Body('code') code: string) {
    if (!code) {
      throw new HttpException('code is required', HttpStatus.BAD_REQUEST);
    }
    try {
      this.telegram.submitCode(code);
      return { success: true };
    } catch (e: unknown) {
      throw new HttpException((e as Error).message, HttpStatus.BAD_REQUEST);
    }
  }

  @Post('password')
  @HttpCode(200)
  submitPassword(@Body('password') password: string) {
    if (!password) {
      throw new HttpException('password is required', HttpStatus.BAD_REQUEST);
    }
    try {
      this.telegram.submitPassword(password);
      return { success: true };
    } catch (e: unknown) {
      throw new HttpException((e as Error).message, HttpStatus.BAD_REQUEST);
    }
  }

  @Post('resend')
  @HttpCode(200)
  async resendCode() {
    const result = await this.telegram.resendCode();
    if (!result) {
      throw new HttpException('Failed to resend code', HttpStatus.INTERNAL_SERVER_ERROR);
    }
    return { success: true, sentTo: result.sentTo, timeout: result.timeout };
  }
}
