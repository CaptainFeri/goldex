import { Controller, Req, UseGuards, BadRequestException, Body, Post, Head, Header } from "@nestjs/common";
import { ApiBearerAuth, ApiHeader, ApiTags } from "@nestjs/swagger";
import LoginDto from "../dto/login.dto";
import { RegisterDto, CompleteRegistrationDto } from "../dto/register.dto";
import { SendOtpPhoneDto } from "../dto/send.otp.dto";
import { login2faDto } from "../dto/login.2fa.dto";
import { DeviceLogoutDto } from "../dto/logout.dto";
import { UserService } from "../service/user.service";
import { NewPasswordDto } from "../dto/new.password.dto";
import { UserAuthGuard } from "../auth/Guard/user.guard";
import { ForgetPasswordDto } from "../dto/forget.password.dto";
import { UserRoleEnum } from "../../shared/enum/user.role.enum";
import { UpdateRefreshTokenDto } from "../dto/update.refresh.dto";
import { UserExpressRequest } from "../auth/types/user-express-request";
import { VerifyOtpPhoneDto } from "../dto/verify-otp-phone.dto";
import { LoginWithOtpDto } from "../dto/login-with-otp.dto";
import { VerifyForgetPasswordOtpDto } from "../dto/verify-forget-password-otp.dto";

@ApiTags("User-Auth")
@Controller({ path: "auth", version: "1" })
export class AuthUserController {
  constructor(private readonly userService: UserService) {}

  @Post("reset-password")
  @ApiBearerAuth()
  @UseGuards(UserAuthGuard)
  async resetPassword(@Req() request: UserExpressRequest, @Body() data: NewPasswordDto) {
    return {
      data: await this.userService.resetPassword(request.user, data),
    };
  }

  // Step 1 — send the recovery code by SMS to the account's phone number.
  @Post("forget-password")
  async forgetPassword(@Body() data: ForgetPasswordDto) {
    return {
      data: await this.userService.forgetPassword(data),
    };
  }

  // Step 2 — trade the SMS code for the short-lived reset token that
  // `POST /auth/reset-password` accepts as its bearer credential.
  @Post("forget-password/verify")
  async verifyForgetPasswordOtp(@Body() data: VerifyForgetPasswordOtpDto) {
    return {
      data: await this.userService.verifyForgetPasswordOtp(data.phone, data.otp),
    };
  }

  @Post("refresh")
  @ApiBearerAuth()
  @UseGuards(UserAuthGuard)
  async updateRefreshToken(@Req() request: UserExpressRequest, @Body() data: UpdateRefreshTokenDto) {
    return {
      data: await this.userService.updateRefreshToken(request, data),
    };
  }

  @Post("logout")
  @ApiBearerAuth()
  @UseGuards(UserAuthGuard)
  async logoutUser(@Req() request: UserExpressRequest, @Body() data: DeviceLogoutDto) {
    await this.userService.logoutUser(request, data.deviceId);
    return {
      data: {},
    };
  }

  @Post("login")
  async loginByPhone(@Req() request, @Body() data: LoginDto) {
    if (data.password.length < 6) {
      throw new BadRequestException("PASSWORD.IS_SHORT");
    }
    const login = await this.userService.login(data, request);
    return {
      data: login,
    };
  }

  @Post("login-with-otp")
  async loginWithOtp(@Req() request, @Body() data: LoginWithOtpDto) {
    const result = await this.userService.loginWithOtp(data, request);
    return { data: result };
  }

  @Post("2fa-login")
  async login2fa(@Body() data: login2faDto, @Req() request: UserExpressRequest) {
    return {
      data: await this.userService.login2fa(data, request),
    };
  }

  @UseGuards(UserAuthGuard)
  @ApiBearerAuth()
  @Head("auth")
  public async userTest(@Req() req: UserExpressRequest) {
    return {
      data: null,
    };
  }

  /////////////////////////////
  @Post("send-otp")
  async sendOtp(@Body() dto: SendOtpPhoneDto) {
    const result = await this.userService.sendOtpViaSms(dto.phone, true);
    return {
      data: { message: "OTP sent successfully", phone: dto.phone },
    };
  }

  // Verify OTP and get temporary token for registration
  @Post("verify-otp")
  async verifyOtp(@Body() dto: VerifyOtpPhoneDto) {
    const result = await this.userService.verifyOtpByPhone(dto.phone, dto.otp);

    if (result.requiresRegistration) {
      // Return temporary token for completing registration
      return {
        data: {
          requiresRegistration: true,
          userId: result.user.id,
          phone: dto.phone,
          temporaryToken: result.temporaryToken, // Include temporary token
        },
      };
    }

    return {
      data: {
        access_token: result.access_token,
        user: {
          id: result.user.id,
          firstName: result.user.firstName,
          lastName: result.user.lastName,
          phone: result.user.phone,
        },
      },
    };
  }

  @Post("complete-registration")
  @ApiBearerAuth()
  @UseGuards(UserAuthGuard)
  async completeRegistration(@Body() data: RegisterDto, @Req() req: UserExpressRequest) {
    const result = await this.userService.completeRegistrationWithPhone(req.user.id, data);

    return {
      data: result,
    };
  }
}
