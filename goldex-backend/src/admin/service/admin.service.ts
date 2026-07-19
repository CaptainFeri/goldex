import { BadRequestException, ForbiddenException, Injectable } from "@nestjs/common";
import { ConfigService, ConfigType } from "@nestjs/config";
import { InjectRepository } from "@nestjs/typeorm";
import { JwtService } from "@nestjs/jwt";
import { Repository } from "typeorm";
import * as bcrypt from "bcryptjs";
import { AdminEntity } from "../entity/admin.entity";
import { AdminRole } from "../role/admin.roles.enum";
import appEnvConfig from "../../config/app.env.config";
import { UserRoleEnum } from "../../shared/enum/user.role.enum";
import TokenPayload from "../../shared/interface/tokenPayload.interface";
import { RedisService } from "../../redis/redis.service";
import { SmsService } from "../../sms/sms.service";
import { AdminScheduleService } from "../../admin-schedule/admin-schedule.service";

@Injectable()
export class AdminService {
  constructor(
    @InjectRepository(AdminEntity)
    private readonly adminRepo: Repository<AdminEntity>,
    private readonly jwtService: JwtService,
    private readonly redisService: RedisService,
    private readonly smsService: SmsService,
    private readonly configService: ConfigService<ConfigType<typeof appEnvConfig>>,
    private readonly scheduleService: AdminScheduleService
  ) {}

  /**
   * Step 1 of admin login: send a one-time code via Kavenegar to a provisioned
   * admin's mobile number. Admins are NOT auto-created here — they must already
   * exist (created via admin-management).
   */
  async sendOtp(phone: string): Promise<{ message: string; phone: string }> {
    this.validatePhoneNumber(phone);

    const admin = await this.adminRepo.findOne({ where: { phone } });
    if (!admin) throw new BadRequestException("USER.NOT_FOUND");
    if (admin.isSuspended) throw new BadRequestException("ADMIN.SUSPENDED");

    // Throttle: one active OTP at a time.
    const existingOtp = await this.redisService.get(`admin_otp:${admin.id}`);
    if (existingOtp) throw new BadRequestException("OTP.ALREADY_SENT");

    const otpCode = this.generateRandomOtp().toString();
    const hashedOtp = await bcrypt.hash(otpCode, 10);
    await this.redisService.setWithExpiration(`admin_otp:${admin.id}`, hashedOtp, 300); // 5 min

    const template = process.env.KAVENEGAR_OTP_TEMPLATE || "verify";
    const smsResult = await this.smsService.sendOTP(phone, otpCode, template);
    if (!smsResult.success) {
      throw new BadRequestException("SMS.SEND_FAILED");
    }

    return { message: "OTP sent successfully", phone };
  }

  /**
   * Step 2 of admin login: verify the code and issue an admin JWT.
   */
  async verifyOtp(phone: string, otpCode: string) {
    this.validatePhoneNumber(phone);

    const admin = await this.adminRepo.findOne({ where: { phone } });
    if (!admin) throw new BadRequestException("USER.NOT_FOUND");
    if (admin.isSuspended) throw new BadRequestException("ADMIN.SUSPENDED");

    if (admin.role === AdminRole.FINANCE) {
      const withinHours = await this.scheduleService.isWithinWorkHours(admin.id);
      if (!withinHours) {
        throw new ForbiddenException("Finance operations are only allowed during scheduled work hours (Saturday-Wednesday, 9AM-6PM IR time)");
      }
    }

    const storedOtp = await this.redisService.get(`admin_otp:${admin.id}`);
    if (!storedOtp) throw new BadRequestException("OTP.EXPIRED");

    const isValid = await bcrypt.compare(otpCode, storedOtp);
    // Dev bypass code — only outside production.
    const devBypass = process.env.NODE_ENV !== "production" && otpCode === "12345";
    if (!isValid && !devBypass) {
      throw new BadRequestException("OTP.INVALID");
    }

    await this.redisService.del(`admin_otp:${admin.id}`);
    admin.lastLoginAt = new Date();
    await this.adminRepo.save(admin);

    return {
      access_token: await this.makeJwtToken(admin.id, UserRoleEnum.ADMIN),
      admin: {
        id: admin.id,
        phone: admin.phone,
        email: admin.email,
        role: admin.role,
      },
    };
  }

  private generateRandomOtp(): number {
    return Math.floor(10000 + Math.random() * 90000);
  }

  private validatePhoneNumber(phone: string): void {
    if (!/^09[0-9]{9}$/.test(phone)) {
      throw new BadRequestException("PHONE.INVALID");
    }
  }

  private async makeJwtToken(userId: string, role: UserRoleEnum) {
    const payload: TokenPayload = { userId, role };
    const token = this.jwtService.sign(payload);
    return token;
  }

  public async UserTest() {
    return true;
  }

  public async findAdmin(userId: string, role: UserRoleEnum) {
    if (role == UserRoleEnum.ADMIN) {
      const admin = await this.adminRepo.findOne({ where: { id: userId } });
      if (admin) return admin;
      return null;
    }
    return null;
  }
}
