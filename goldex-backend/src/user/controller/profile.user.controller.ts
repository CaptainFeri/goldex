import { ApiBearerAuth, ApiBody, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import {
  BadRequestException,
  Body,
  Controller,
  DefaultValuePipe,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  Req,
  UploadedFiles,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { diskStorage } from 'multer';
import { UserService } from '../service/user.service';
import { VerifyTokenDTO } from '../dto/verify.token.dto';
import { UserAuthGuard } from '../auth/Guard/user.guard';
import { UpdateAvatarDto } from '../dto/update.avatar.dto';
import { UpdateProfileDto } from '../dto/update.profile.dto';
import { UpdatePasswordDTO } from '../dto/update.password.dto';
import { Update2faSettingDto } from '../dto/update.2fa.setting.dto';
import { UpdateUserSettingsDto } from '../dto/update.user.setting.dto';
import { UserExpressRequest } from '../auth/types/user-express-request';
import { checkImageFile, editFileName } from '../../shared/filter/upload.file.filter';

@ApiTags('Profile')
@Controller({ path: 'profile', version: '1' })
export class UserProfileController {
  constructor(private readonly userService: UserService) {}

  @Patch('2fa-settings')
  @ApiBearerAuth()
  @UseGuards(UserAuthGuard)
  async update2faSetting(@Body() data: Update2faSettingDto, @Req() request: UserExpressRequest) {
    return {
      data: await this.userService.update2faSetting(request.user, data),
    };
  }

  @Get('2fa-settings')
  @ApiBearerAuth()
  @UseGuards(UserAuthGuard)
  async get2faSettings(@Req() request: UserExpressRequest) {
    return {
      data: await this.userService.get2faSettings(request.user),
    };
  }

  @Post('otp')
  @ApiBearerAuth()
  @UseGuards(UserAuthGuard)
  async sendOtpService(@Req() req: UserExpressRequest) {
    return {
      data: await this.userService.sendOtpService(req.user.email, false),
    };
  }

  @Get('settings')
  @ApiBearerAuth()
  @UseGuards(UserAuthGuard)
  async getUserSettings(@Req() req: UserExpressRequest) {
    return {
      data: await this.userService.getUserSettings(req.user.id),
    };
  }

  @Patch('settings')
  @ApiBearerAuth()
  @UseGuards(UserAuthGuard)
  async updateUserSettings(@Req() request: UserExpressRequest, @Body() updateUserSettings: UpdateUserSettingsDto) {
    const res = await this.userService.updateUserSettings(request.user.id, updateUserSettings);
    return {
      data: res,
    };
  }

  @Delete('2fa')
  @ApiBearerAuth()
  @UseGuards(UserAuthGuard)
  async delete2faToken(@Req() req: UserExpressRequest, @Body() token: VerifyTokenDTO) {
    return {
      data: await this.userService.delete2faToken(req.user, token.token),
    };
  }

  @Post('2fa')
  @ApiBearerAuth()
  @UseGuards(UserAuthGuard)
  async verfy2faToken(@Req() req: UserExpressRequest, @Body() token: VerifyTokenDTO) {
    const res = await this.userService.getForVerify2faToken(req.user, token.token);
    if (res) return { data: res };
    else throw new BadRequestException();
  }

  @Get('2fa/:otp')
  @ApiBearerAuth()
  @UseGuards(UserAuthGuard)
  async get2faSecretAndUrl(@Param('otp') otp: string, @Req() req: UserExpressRequest) {
    return {
      data: await this.userService.getSecret2fa(req.user, otp),
    };
  }

  @Delete('avatar')
  @ApiBearerAuth()
  @UseGuards(UserAuthGuard)
  async deleteAvatar(@Req() request: UserExpressRequest) {
    return {
      data: await this.userService.deleteAvatar(request.user),
    };
  }

  @Patch('avatar')
  @ApiBearerAuth()
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    description: 'Upload a wallpaper file and its associated data',
    type: UpdateAvatarDto,
  })
  @UseGuards(UserAuthGuard)
  @UseInterceptors(
    FileFieldsInterceptor([{ name: 'avatar', maxCount: 1 }], {
      storage: diskStorage({
        destination: './public',
        filename: editFileName,
      }),
      limits: { fileSize: 100 * 1024 * 1024 },
    })
  )
  async updateAvatar(@Req() req: UserExpressRequest, @UploadedFiles() files: any[], @Body() data: UpdateAvatarDto) {
    if (files && files['avatar']) {
      checkImageFile(files['avatar'][0].originalname);
      data.avatar = files['avatar'][0].filename;
    }
    const res = await this.userService.updateAvatar(req.user.id, data);
    return { data: { avatarImgPath: res } };
  }

  @Patch('profile')
  @ApiBearerAuth()
  @UseGuards(UserAuthGuard)
  async updateProfile(@Body() data: UpdateProfileDto, @Req() request: UserExpressRequest) {
    const res = await this.userService.updateProfile(request.user.id, data);
    return { data: res };
  }

  @Get('profile')
  @ApiBearerAuth()
  @UseGuards(UserAuthGuard)
  async getProfile(@Req() req: UserExpressRequest) {
    const userProfile = await this.userService.getProfile(req.user.id);
    return {
      data: userProfile,
    };
  }

  @Patch('password')
  @ApiBearerAuth()
  @UseGuards(UserAuthGuard)
  async updatePassword(@Req() req: UserExpressRequest, @Body() data: UpdatePasswordDTO) {
    const userId = req.user.id;
    await this.userService.updatePassword(userId, data);
    return {
      data: null,
    };
  }

  @Get('login')
  @ApiBearerAuth()
  @UseGuards(UserAuthGuard)
  async getLoginHistory(
    @Req() req: UserExpressRequest,
    @Query('pageNumber', new DefaultValuePipe(1), ParseIntPipe)
    page: number = 1,
    @Query('pageSize', new DefaultValuePipe(100), ParseIntPipe)
    limit: number = 100
  ) {
    limit = limit > 100 ? 100 : limit;
    page = page < 0 ? 1 : page;
    const skip = limit * (page - 1);
    const take = limit;
    const userId = req.user.id;
    const loginHistory = await this.userService.getLoginHistory(take, skip, userId);
    return {
      data: loginHistory,
    };
  }
}
