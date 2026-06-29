import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { ILike, Repository } from "typeorm";
import { AdminUserDto } from "./dto/admin.user.dto";
import { GenderEnum } from "../shared/enum/gender.enum";
import { UserEntity } from "../user/entity/user.entity";
import { BaseInfoService } from "../baseinfo/baseinfo.service";
import { CountryEntity } from "../baseinfo/entity/country.entity";
import { AdminUserprofileDto } from "./dto/admin.user.profile.dto";
import { UserProfileEntity } from "../user/entity/user.profile.entity";
import { UserLoginHistoryEntity } from "../user/entity/user.login.history.entity";

@Injectable()
export class AdminUserService {
  constructor(
    @InjectRepository(UserEntity)
    private readonly userRepo: Repository<UserEntity>,
    @InjectRepository(UserProfileEntity)
    private readonly userProfileRepo: Repository<UserProfileEntity>,
    @InjectRepository(UserLoginHistoryEntity)
    private readonly userLoginHistoryRepo: Repository<UserLoginHistoryEntity>,
    private readonly baseInfoService: BaseInfoService
  ) {}

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
        registeredAt: true,
        blockedAt: true,
        createAt: true,
      },
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
