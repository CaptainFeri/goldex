import { Body, Controller, Head, Post, Req, UseGuards } from "@nestjs/common";
import { ApiBearerAuth, ApiTags } from "@nestjs/swagger";
import { AdminService } from "../service/admin.service";
import { AdminAuthGuard } from "../auth/Guard/admin.guard";
import { AdminExpressRequest } from "../auth/types/adminExpressRequest";
import { SendAdminOtpDto } from "../dto/send-admin-otp.dto";
import { VerifyAdminOtpDto } from "../dto/verify-admin-otp.dto";

@ApiTags("Admin-Auth")
@Controller({ version: "1", path: "admin/auth" })
export class AdminAuthController {
  constructor(private readonly adminService: AdminService) {}

  // Step 1: request an OTP for a provisioned admin mobile number.
  @Post("send-otp")
  async sendOtp(@Body() data: SendAdminOtpDto) {
    return {
      data: await this.adminService.sendOtp(data.phone),
    };
  }

  // Step 2: verify the OTP and receive an admin access token.
  @Post("verify-otp")
  async verifyOtp(@Body() data: VerifyAdminOtpDto) {
    return {
      data: await this.adminService.verifyOtp(data.phone, data.otp),
    };
  }

  @UseGuards(AdminAuthGuard)
  @ApiBearerAuth()
  @Head("auth")
  public async userTest(@Req() req: AdminExpressRequest) {
    return {
      data: await this.adminService.UserTest(),
    };
  }
}
