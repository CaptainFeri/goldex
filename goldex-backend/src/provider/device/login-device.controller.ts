import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ApiAdminErrorResponses, ApiEnvelopeResponse } from '../../shared/swagger';
import { AdminAuthGuard } from '../../admin/auth/Guard/admin.guard';
import { AdminRolesGuard } from '../../admin/auth/Guard/admin.role.guard';
import { AdminRoles } from '../../admin/role/admin.role.decorator';
import { AdminRole } from '../../admin/role/admin.roles.enum';
import { AdminExpressRequest } from '../../admin/auth/types/adminExpressRequest';
import { EnrollDeviceDto, EnrolledDeviceDto, LoginDeviceDto } from '../dto/login-device.dto';
import { LoginDeviceService } from './login-device.service';
import { ProviderLoginDeviceEntity } from '../entity/provider-login-device.entity';

/**
 * Managing the handsets trusted to log providers back in.
 *
 * Enrolling one is handing out a credential that acts unattended, so it is
 * restricted to a super admin: an operator who can activate a provider from
 * the panel is not thereby someone who can authorise a phone to do it by
 * itself, week after week, with nobody watching.
 */
@ApiTags('Admin-LoginDevice')
@ApiBearerAuth()
@ApiAdminErrorResponses()
@Controller('admin/login-devices')
@UseGuards(AdminAuthGuard, AdminRolesGuard)
@AdminRoles(AdminRole.SUPER_ADMIN)
export class LoginDeviceController {
  constructor(private readonly devices: LoginDeviceService) {}

  @Post()
  @ApiOperation({
    summary: 'Enrol a handset and issue its credential',
    description:
      'The token comes back once and is never retrievable again — only its hash is stored. ' +
      'Put it into the app now; a lost token is replaced by enrolling a new device, which also ' +
      'leaves the old one revocable rather than shared.',
  })
  @ApiEnvelopeResponse(EnrolledDeviceDto, { status: 201 })
  async enroll(@Body() dto: EnrollDeviceDto, @Req() req: AdminExpressRequest) {
    const { device, token } = await this.devices.enroll(dto.name, req.admin?.id);
    return { data: { ...present(device), token } };
  }

  @Get()
  @ApiOperation({
    summary: 'Every enrolled handset, including revoked ones',
    description:
      'Revoked devices stay listed: the row is the record that the device existed and acted, ' +
      'and `lastSeenAt` is the only thing that says whether one left to work unattended is ' +
      'still alive.',
  })
  @ApiEnvelopeResponse(LoginDeviceDto, { isArray: true })
  async list() {
    return { data: (await this.devices.list()).map(present) };
  }

  @Delete(':id')
  @ApiOperation({
    summary: 'Withdraw trust from a handset',
    description: 'Takes effect on its next request. The record of the device is kept.',
  })
  @ApiEnvelopeResponse(LoginDeviceDto)
  async revoke(@Param('id', ParseUUIDPipe) id: string) {
    return { data: present(await this.devices.revoke(id)) };
  }
}

function present(device: ProviderLoginDeviceEntity) {
  return {
    id: device.id,
    name: device.name,
    lastSeenAt: device.lastSeenAt?.toISOString() ?? null,
    revokedAt: device.revokedAt?.toISOString() ?? null,
    active: !device.revokedAt,
    createdAt: device.createAt?.toISOString() ?? null,
  };
}
