import {
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Post,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AdminAuthGuard } from '../admin/auth/Guard/admin.guard';
import { AdminRolesGuard } from '../admin/auth/Guard/admin.role.guard';
import { AdminRoles } from '../admin/role/admin.role.decorator';
import { AdminRole } from '../admin/role/admin.roles.enum';
import { ApiAdminErrorResponses, ApiEnvelopeResponse } from '../shared/swagger';
import { ProviderCommandAckDto } from '../provider/dto/provider-response.dto';
import { BrowserSessionClosedDto, BrowserSessionDto } from './dto/browser-session.dto';
import { ProviderBrowserService } from './provider-browser.service';

/**
 * Driving a real browser to sign in to a provider.
 *
 * SUPER_ADMIN only, unlike the rest of provider management. What is behind this
 * is a browser running inside the server network with a person at the controls;
 * the navigation allowlist is what keeps it pointed at the provider, and this
 * is the second lock on who gets to hold it at all.
 */
@ApiTags('Admin-Provider')
@ApiBearerAuth()
@ApiAdminErrorResponses()
@Controller('admin/providers')
@UseGuards(AdminAuthGuard, AdminRolesGuard)
@AdminRoles(AdminRole.SUPER_ADMIN)
export class ProviderBrowserController {
  constructor(private readonly service: ProviderBrowserService) {}

  @Post(':id/browser-session')
  @ApiOperation({
    summary: "Open a browser on the provider's login page",
    description:
      'Returns the session to watch on the admin-provider-browser socket namespace. The browser can reach only this provider and closes itself after ten minutes.',
  })
  @ApiEnvelopeResponse(BrowserSessionDto, { status: 201 })
  async open(@Param('id', ParseUUIDPipe) id: string) {
    return { data: await this.service.open(id) };
  }

  @Get('browser-session/:sessionId')
  @ApiOperation({ summary: 'Where a browser session has got to' })
  @ApiEnvelopeResponse(BrowserSessionDto)
  async status(@Param('sessionId', ParseUUIDPipe) sessionId: string) {
    return { data: await this.service.status(sessionId) };
  }

  @Post(':id/browser-session/:sessionId/activate')
  @ApiOperation({
    summary: 'Activate the provider with what the login produced',
    description: 'Reads the captured session out of the browser, stores it, and closes the browser.',
  })
  @ApiEnvelopeResponse(ProviderCommandAckDto, { status: 201 })
  async activate(
    @Param('id', ParseUUIDPipe) id: string,
    @Param('sessionId', ParseUUIDPipe) sessionId: string,
  ) {
    return { data: await this.service.activate(id, sessionId) };
  }

  @Delete('browser-session/:sessionId')
  @ApiOperation({ summary: 'Close a browser session without activating' })
  @ApiEnvelopeResponse(BrowserSessionClosedDto)
  async close(@Param('sessionId', ParseUUIDPipe) sessionId: string) {
    return { data: await this.service.close(sessionId) };
  }
}
