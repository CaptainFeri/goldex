import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiEnvelopeResponse } from '../../shared/swagger';
import { ProviderService } from '../provider.service';
import { DeviceAuthGuard, DeviceRequest } from './device-auth.guard';
import {
  ProviderCommandAckDto,
  ProviderDto,
} from '../dto/provider-response.dto';
import { ClaimLoginResultDto, LoginCandidateDto } from '../dto/auto-login.dto';
import { AwaitingOtpDto, RelayOtpDto } from '../dto/relay-otp.dto';
import { DeviceReleaseLoginDto, DeviceSendOtpDto, DeviceVerifyOtpDto } from '../dto/device-login.dto';

/**
 * Everything a trusted handset may do, and nothing more.
 *
 * This is the point of the device credential: the routes are enumerated here
 * rather than being a subset of the admin API that a guard happens to allow,
 * so what a phone on a desk can reach is a thing you can read in one file. It
 * can see which providers need a login, take one, drive its OTP exchange, and
 * relay a code. It cannot create a provider, edit one, read balances or orders,
 * or touch anything outside this list.
 *
 * Which device is acting is taken from the credential, never from the request
 * body. A device that could name itself could release another device's claim
 * while that one was still waiting for its code.
 */
@ApiTags('Device-Provider')
@ApiBearerAuth()
@Controller('device/providers')
@UseGuards(DeviceAuthGuard)
export class ProviderDeviceController {
  constructor(private readonly providerService: ProviderService) {}

  @Get()
  @ApiOperation({
    summary: 'The providers this device may act on',
    description:
      'The same list the panel sees, so a handset can show status. Read-only — nothing here ' +
      'edits a provider.',
  })
  @ApiEnvelopeResponse(ProviderDto, { isArray: true })
  async providers() {
    return { data: await this.providerService.findAll() };
  }

  @Get('needs-login')
  @ApiOperation({
    summary: 'Providers waiting to be logged in again',
    description:
      '`eligible` says whether this device may claim one now, and `reason` says why not when ' +
      'it may not — a cooldown, a daily limit, another device already trying, or a provider ' +
      'that has failed enough times to need a person.',
  })
  @ApiEnvelopeResponse(LoginCandidateDto, { isArray: true })
  async needsLogin() {
    return { data: await this.providerService.loginCandidates() };
  }

  @Get('awaiting-otp')
  @ApiOperation({
    summary: 'The activation currently waiting for a code, if any',
    description:
      'How a handset learns that a code arriving now is expected at all, and which provider it ' +
      'belongs to. A null answer means nothing should be relayed.',
  })
  @ApiEnvelopeResponse(AwaitingOtpDto)
  async awaitingOtp() {
    return { data: await this.providerService.awaitingOtp() };
  }

  @Post(':id/login-lease')
  @ApiOperation({
    summary: 'Take a provider for one login attempt',
    description:
      'The attempt is counted when it is claimed, not when it ends, so a device that dies ' +
      'between asking for a code and using it is not free to ask again immediately.',
  })
  @ApiEnvelopeResponse(ClaimLoginResultDto, { status: 201 })
  async claim(@Param('id', ParseUUIDPipe) id: string, @Req() req: DeviceRequest) {
    return { data: await this.providerService.claimLogin(id, req.device!.id) };
  }

  @Post(':id/login-lease/release')
  @ApiOperation({ summary: 'Give a claimed provider back, saying whether the login worked' })
  @ApiEnvelopeResponse(ProviderCommandAckDto, { status: 201 })
  async release(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: DeviceReleaseLoginDto,
    @Req() req: DeviceRequest,
  ) {
    return {
      data: await this.providerService.releaseLogin(id, req.device!.id, dto.outcome),
    };
  }

  @Post(':id/send-otp')
  @ApiOperation({ summary: 'Ask a provider to text an activation code' })
  @ApiEnvelopeResponse(ProviderCommandAckDto, { status: 201 })
  async sendOtp(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: DeviceSendOtpDto,
    @Req() req: DeviceRequest,
  ) {
    return { data: await this.providerService.deviceSendOtp(id, req.device!.id, dto.phone) };
  }

  @Post(':id/verify-otp')
  @ApiOperation({ summary: 'Complete the login with the code this handset read' })
  @ApiEnvelopeResponse(ProviderCommandAckDto, { status: 201 })
  async verifyOtp(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: DeviceVerifyOtpDto,
    @Req() req: DeviceRequest,
  ) {
    return { data: await this.providerService.deviceVerifyOtp(id, req.device!.id, dto.otp) };
  }

  @Post('relay-otp')
  @ApiOperation({
    summary: 'Relay a code read off this handset, for the panel to use',
  })
  @ApiEnvelopeResponse(ProviderCommandAckDto, { status: 201 })
  async relayOtp(@Body() dto: RelayOtpDto) {
    return {
      data: await this.providerService.relayOtp(dto.providerKey, dto.code, dto.message),
    };
  }
}
