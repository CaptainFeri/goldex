import { ApiBearerAuth, ApiBody, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
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
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { Response } from 'express';
import { UserService } from '../service/user.service';
import { VerifyTokenDTO } from '../dto/verify.token.dto';
import { UserAuthGuard } from '../auth/Guard/user.guard';
import { UpdateAvatarDto } from '../dto/update.avatar.dto';
import { UpdateProfileDto } from '../dto/update.profile.dto';
import { UpdatePasswordDTO } from '../dto/update.password.dto';
import { Update2faSettingDto } from '../dto/update.2fa.setting.dto';
import { UpdateUserSettingsDto } from '../dto/update.user.setting.dto';
import { UserExpressRequest } from '../auth/types/user-express-request';
import { MinioService } from '../../minio/minio.service';

@ApiTags('Profile')
@Controller({ path: 'profile', version: '1' })
export class UserProfileController {
  constructor(
    private readonly userService: UserService,
    private readonly minioService: MinioService
  ) {}

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

  @Get('avatar/:objectName')
  @ApiOperation({ summary: 'Get avatar image' })
  async getAvatar(@Param('objectName') objectName: string, @Res() res: Response) {
    const bucket = process.env.MINIO_BUCKET || 'default';
    const stat = await this.minioService.getFileStat(bucket, objectName);
    res.set({ 'Content-Type': stat.contentType, 'Content-Length': stat.size.toString() });
    const stream = await this.minioService.getFileStream(bucket, objectName);
    stream.pipe(res);
  }

  @Patch('avatar')
  @ApiBearerAuth()
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    description: 'Upload a wallpaper file and its associated data',
    type: UpdateAvatarDto,
  })
  @UseGuards(UserAuthGuard)
  @UseInterceptors(FileInterceptor('avatar', { storage: memoryStorage(), limits: { fileSize: 100 * 1024 * 1024 } }))
  async updateAvatar(@Req() req: UserExpressRequest, @UploadedFile() file: Express.Multer.File) {
    if (!file) throw new BadRequestException('FILE.INVALID');
    const userId = req.user.id;
    const objectName = `avatar/${userId}/${Date.now()}-${file.originalname}`;
    const uploadedFile = await this.minioService.uploadFile(
      {
        objectName,
        stream: file.buffer,
        size: file.size,
        contentType: file.mimetype,
        metadata: { userId, uploadedBy: 'user', originalName: file.originalname },
      },
      'avatar'
    );
    const res = await this.userService.updateAvatar(req.user.id, uploadedFile.name);
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
