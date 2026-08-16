import { BadRequestException, Injectable, NotFoundException, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { EventEmitter2 } from "@nestjs/event-emitter";
import * as crypto from "crypto";
import * as bcrypt from "bcryptjs";
import { Between, ILike, In, IsNull, MoreThan, Repository } from "typeorm";
import { AdminUserDto } from "./dto/admin.user.dto";
import { GenderEnum } from "../shared/enum/gender.enum";
import { UserEntity } from "../user/entity/user.entity";
import { BaseInfoService } from "../baseinfo/baseinfo.service";
import { CountryEntity } from "../baseinfo/entity/country.entity";
import { AdminUserprofileDto } from "./dto/admin.user.profile.dto";
import { UserProfileEntity } from "../user/entity/user.profile.entity";
import { UserLoginHistoryEntity } from "../user/entity/user.login.history.entity";
import { UserSettingEntity } from "../user/entity/user.setting.entity";
import { UserKycEntity } from "../user/entity/user.kyc.entity";
import { WalletEntity } from "../wallet/entities/wallet.entity";
import { SymbolEntity } from "../admin-symbol/entity/symbol.entity";
import { UserRoleEnum } from "../shared/enum/user.role.enum";
import { KycStatusEnum } from "../baseinfo/enum/kycStatus.enum";
import { RedisService } from "../redis/redis.service";
import { CreatePartnerDto } from "./dto/create-partner.dto";
import { UserMarketTypeEntity } from "../user/entity/user.market.type.entity";
import { UserMarketKindEntity } from "../user/entity/user.market.kind.entity";
import { MarketTypeEnum } from "../admin-pair/enum/market.type.enum";
import { MarketKindEnum } from "../admin-pair/enum/market.kind.enum";
import {
  defaultMarketKindsForRole,
  defaultMarketTypesForRole,
} from "../shared/market-access.helper";
import { UserEvents } from "../shared/constants/events.constants";
import { UserLevelService } from "../user-level/user-level.service";

const ONLINE_SET = "online_users";

@Injectable()
export class AdminUserService {
  private readonly logger = new Logger(AdminUserService.name);

  constructor(
    @InjectRepository(UserEntity)
    private readonly userRepo: Repository<UserEntity>,
    @InjectRepository(UserProfileEntity)
    private readonly userProfileRepo: Repository<UserProfileEntity>,
    @InjectRepository(UserLoginHistoryEntity)
    private readonly userLoginHistoryRepo: Repository<UserLoginHistoryEntity>,
    @InjectRepository(UserSettingEntity)
    private readonly userSettingRepo: Repository<UserSettingEntity>,
    @InjectRepository(UserKycEntity)
    private readonly kycRepo: Repository<UserKycEntity>,
    @InjectRepository(WalletEntity)
    private readonly walletRepo: Repository<WalletEntity>,
    @InjectRepository(SymbolEntity)
    private readonly symbolRepo: Repository<SymbolEntity>,
    @InjectRepository(UserMarketTypeEntity)
    private readonly userMarketTypeRepo: Repository<UserMarketTypeEntity>,
    @InjectRepository(UserMarketKindEntity)
    private readonly userMarketKindRepo: Repository<UserMarketKindEntity>,
    private readonly redisService: RedisService,
    private readonly baseInfoService: BaseInfoService,
    private readonly eventEmitter: EventEmitter2,
    private readonly userLevelService: UserLevelService
  ) {}

  // Create a user (admin-initiated). Accepts an optional role (defaults to PARTNER).
  // Wallets are generated immediately. Optional market types can be assigned.
  async createPartner(dto: CreatePartnerDto): Promise<UserEntity> {
    const phoneRegex = /^09[0-9]{9}$/;
    if (!phoneRegex.test(dto.phone)) throw new BadRequestException("PHONE.INVALID");

    const existing = await this.userRepo.findOne({ where: { phone: dto.phone } });
    if (existing) throw new BadRequestException("USER.ALREADY_EXISTS");

    const profile = await this.userProfileRepo.save(new UserProfileEntity());

    const role = dto.role ?? UserRoleEnum.PARTNER;
    const emailDomain = role === UserRoleEnum.PARTNER ? "partner" : "user";

    const user = new UserEntity();
    user.phone = dto.phone;
    user.role = role;
    user.email = dto.email || `${dto.phone}@${emailDomain}.com`;
    user.firstName = dto.firstName ?? "";
    user.password = await bcrypt.hash(dto.password, 10);
    user.lastName = dto.lastName ?? "";
    user.registeredAt = new Date();
    user.activeUntil = dto.activeUntil ? new Date(dto.activeUntil) : null;
    user.profile = profile;
    const saved = await this.userRepo.save(user);

    saved.ReferralId = crypto
      .createHash("sha256")
      .update(`${saved.id}-${Date.now()}`)
      .digest("hex")
      .slice(0, 8)
      .toUpperCase();
    await this.userRepo.save(saved);

    // Generate a zero-balance wallet per active symbol.
    const symbols = await this.symbolRepo.find({ where: { isActive: true } });
    for (const s of symbols) {
      const w = new WalletEntity();
      w.symbol = s;
      w.user = saved;
      w.freeBalance = 0;
      w.lockedBalance = 0;
      await this.walletRepo.save(w);
    }

    const setting = new UserSettingEntity();
    setting.userId = saved.id;
    setting.isEmailNotificationEnabled = false;
    await this.userSettingRepo.save(setting);

    // Save market type assignments (default: formal + informal for partners)
    const marketTypes = dto.marketTypes?.length > 0 ? dto.marketTypes : defaultMarketTypesForRole(role);
    for (const mt of marketTypes) {
      const umt = new UserMarketTypeEntity();
      umt.userId = saved.id;
      umt.marketType = mt;
      await this.userMarketTypeRepo.save(umt);
    }

    // Save market kind assignments (which trading modes the user may use).
    const marketKinds = dto.marketKinds?.length > 0 ? dto.marketKinds : defaultMarketKindsForRole(role);
    for (const mk of marketKinds) {
      const umk = new UserMarketKindEntity();
      umk.userId = saved.id;
      umk.marketKind = mk;
      await this.userMarketKindRepo.save(umk);
    }

    return saved;
  }

  // Aggregate user KPIs (with an optional time window for "new users").
  async getUserStats(fromMs?: number, toMs?: number) {
    const now = new Date();
    const all = await this.userRepo.find({
      select: { id: true, role: true, blockedAt: true, activeUntil: true, registeredAt: true, createAt: true },
    });

    const byRole: Record<string, number> = { customer: 0, partner: 0, newUser: 0, admin: 0 };
    let active = 0;
    let blocked = 0;
    let expired = 0;
    for (const u of all) {
      if (u.role === UserRoleEnum.CUSTOMER) byRole.customer++;
      else if (u.role === UserRoleEnum.PARTNER) byRole.partner++;
      else if (u.role === UserRoleEnum.NEW_USER) byRole.newUser++;
      else if (u.role === UserRoleEnum.ADMIN) byRole.admin++;

      const isBlocked = u.blockedAt != null;
      const isExpired = u.activeUntil != null && new Date(u.activeUntil) < now;
      if (isBlocked) blocked++;
      else if (isExpired) expired++;
      else active++;
    }

    let online = 0;
    try {
      online = await this.redisService.getClient().scard(ONLINE_SET);
    } catch {
      online = 0;
    }

    const verifiedKyc = await this.kycRepo.count({ where: { status: KycStatusEnum.APPROVED } });
    const pendingKyc = await this.kycRepo.count({ where: { status: KycStatusEnum.PENDING } });

    let newUsers = all.length;
    if (fromMs != null && toMs != null) {
      newUsers = all.filter((u) => {
        const t = new Date(u.registeredAt ?? u.createAt ?? 0).getTime();
        return t >= fromMs && t <= toMs;
      }).length;
    }

    return {
      total: all.length,
      byRole,
      active,
      inactive: blocked + expired,
      blocked,
      expired,
      online,
      verifiedKyc,
      pendingKyc,
      newUsers,
    };
  }

  // Mark which user ids in a list are currently online (for the user table).
  async onlineUserIds(): Promise<string[]> {
    try {
      return await this.redisService.getClient().smembers(ONLINE_SET);
    } catch {
      return [];
    }
  }

  private createResponseData<T>(mapper: (...args: any[]) => T, ...args: any[]): T {
    return mapper(...args);
  }

  async getUserProfile(userId: string): Promise<AdminUserprofileDto> {
    const user = await this.userRepo.findOne({
      where: { id: userId },
      relations: { profile: true },
    });
    if (!user) throw new NotFoundException("USER.NOT_FOUND");
    const country =
      user.profile.countryId !== 0 ? await this.baseInfoService.getCountryById(user.profile.countryId) : null;
    return this.createResponseData<AdminUserprofileDto>(
      (user: UserEntity, country: CountryEntity) => ({
        id: user.id,
        firstname: user.firstName,
        lastname: user.lastName,
        gender: GenderEnum[user.profile.gender],
        email: user.email,
        cellPhone: user.phone,
        address: user.profile.address,
        postalCode: user.profile.postalCode,
        avatarImgPath: user.profile.avatarImgPath,
        twoFactorActivatedAt: user.twoFactorActivatedAt,
        createdAt: user.createAt,
        updatedAt: user.updateAt,
        country: country
          ? {
              id: country.id,
              isoCode: country.isoCode,
              isoCode2: country.isoCode2,
              primaryName: country.primaryName,
              region: country.region,
              secondaryName: country.secondaryName,
            }
          : null,
      }),
      user,
      country
    );
  }

  async getUserAdminList(
    take: number,
    skip: number,
    searchkey?: string
  ): Promise<{ userList: UserEntity[]; totalItems: number }> {
    const [userList, totalItems] = await this.userRepo.findAndCount({
      take,
      skip,
      where: searchkey
        ? [
            { firstName: ILike(`%${searchkey}%`) },
            { lastName: ILike(`%${searchkey}%`) },
            { email: ILike(`%${searchkey}`) },
          ]
        : undefined,
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        phone: true,
        role: true,
        activeUntil: true,
        registeredAt: true,
        blockedAt: true,
        createAt: true,
        profile: { avatarImgPath: true },
      },
      relations: { profile: true },
      order: {
        createAt: "desc",
      },
    });
    return { userList: userList, totalItems: totalItems };
  }

  async switchBlockStatusUserById(id: string): Promise<AdminUserDto> {
    const user = await this.userRepo.findOne({ where: { id } });
    if (!user) throw new BadRequestException("USER.INVALID");
    if (user.blockedAt == null) user.blockedAt = new Date();
    else user.blockedAt = null;
    await this.userRepo.save(user);
    this.eventEmitter.emit(
      user.blockedAt != null ? UserEvents.BLOCKED : UserEvents.UNBLOCKED,
      { userId: user.id },
    );
    return this.createResponseData<AdminUserDto>(
      (user: UserEntity) => ({
        id: user.id,
        firstname: user.firstName,
        lastname: user.lastName,
        email: user.email,
        blockedAt: user.blockedAt,
        createdAt: user.createAt,
        registeredAt: user.registeredAt,
      }),
      user
    );
  }

  // Assign which market types a user can see. Replaces any existing assignments.
  async assignUserMarketTypes(userId: string, marketTypes: MarketTypeEnum[]): Promise<MarketTypeEnum[]> {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException("USER.NOT_FOUND");

    // Enforce the level's MAX_MARKET_TYPES limit.
    const maxTypes = await this.userLevelService.getFeatureValue(userId, "MAX_MARKET_TYPES");
    const maxTypesNum = Number(maxTypes);
    if (maxTypesNum > 0 && marketTypes.length > maxTypesNum) {
      throw new BadRequestException(
        `حداکثر تعداد بازارهای مجاز در سطح شما ${maxTypesNum} است`
      );
    }

    await this.userMarketTypeRepo.delete({ userId });

    for (const mt of marketTypes) {
      const umt = new UserMarketTypeEntity();
      umt.userId = userId;
      umt.marketType = mt;
      await this.userMarketTypeRepo.save(umt);
    }

    // Sync wallets: create zero-balance wallets for any active symbols matching the
    // assigned market types that the user does not already have.
    try {
      const symbols = await this.symbolRepo.find({
        where: { isActive: true, marketType: In(marketTypes) },
      });
      for (const s of symbols) {
        const existing = await this.walletRepo.findOne({
          where: { userId, symbolId: s.id },
        });
        if (!existing) {
          const w = new WalletEntity();
          w.symbol = s;
          w.user = user;
          w.freeBalance = 0;
          w.lockedBalance = 0;
          await this.walletRepo.save(w);
        }
      }
      this.logger.log(`Wallets synced for user ${userId} after market type change`);
    } catch (err) {
      this.logger.error(`Failed to sync wallets for user ${userId}: ${(err as Error).message}`);
    }

    return marketTypes;
  }

  // Get the market types a user can see. Returns the role-based defaults when
  // the user has no explicit assignment.
  async getUserMarketTypes(userId: string): Promise<MarketTypeEnum[]> {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException("USER.NOT_FOUND");

    const records = await this.userMarketTypeRepo.find({ where: { userId } });
    if (records.length > 0) return records.map((r) => r.marketType);
    return defaultMarketTypesForRole(user.role);
  }

  // Assign which market kinds (trading modes: MARKET/LIMIT/OFFER) a user may
  // use. Replaces any existing assignments.
  async assignUserMarketKinds(userId: string, marketKinds: MarketKindEnum[]): Promise<MarketKindEnum[]> {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException("USER.NOT_FOUND");

    await this.userMarketKindRepo.delete({ userId });

    for (const mk of marketKinds) {
      const umk = new UserMarketKindEntity();
      umk.userId = userId;
      umk.marketKind = mk;
      await this.userMarketKindRepo.save(umk);
    }

    return marketKinds;
  }

  // Get the market kinds a user may use. Returns the role-based defaults when
  // the user has no explicit assignment.
  async getUserMarketKinds(userId: string): Promise<MarketKindEnum[]> {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException("USER.NOT_FOUND");

    const records = await this.userMarketKindRepo.find({ where: { userId } });
    if (records.length > 0) return records.map((r) => r.marketKind);
    return defaultMarketKindsForRole(user.role);
  }

  // Change a user's role between CUSTOMER and PARTNER (the only admin-toggleable
  // roles). Market access falls back to the new role's defaults wherever the
  // user has no explicit assignment.
  async changeUserRole(
    userId: string,
    role: UserRoleEnum,
  ): Promise<{ id: string; role: number; marketTypes: MarketTypeEnum[]; marketKinds: MarketKindEnum[] }> {
    const user = await this.userRepo.findOne({ where: { id: userId } });
    if (!user) throw new NotFoundException("USER.NOT_FOUND");
    if (user.role === UserRoleEnum.ADMIN) throw new BadRequestException("ROLE.ADMIN_NOT_EDITABLE");

    user.role = role;
    await this.userRepo.save(user);

    return {
      id: user.id,
      role: user.role,
      marketTypes: await this.getUserMarketTypes(userId),
      marketKinds: await this.getUserMarketKinds(userId),
    };
  }

  // async getKycByUserId(id: string): Promise<UserKycGetDto> {
  //   const kyc = await this.userKycRepo.findOne({ where: { userId: id } });
  //   if (!kyc) return null;
  //   return this.createResponseData<UserKycGetDto>(
  //     (userKyc: UserKycEntity) => ({
  //       id: userKyc.id,
  //       docBackImgPath: userKyc.docBackImgPath,
  //       docFrontImgPath: userKyc.docFrontImgPath,
  //       SelfieImgPath: userKyc.SelfieImgPath,
  //       docExpiryDate: userKyc.docExpiryDate,
  //       docNumber: userKyc.docNumber,
  //       KYCStatus: userKyc.KYCStatus,
  //       KYCType: userKyc.KYCType,
  //       RejectionReason: userKyc.RejectionReason || "",
  //     }),
  //     kyc
  //   );
  // }
}
