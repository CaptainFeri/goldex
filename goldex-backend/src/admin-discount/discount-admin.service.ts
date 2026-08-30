import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { CreateAdminDiscountDto } from "./dto/create-discount.dto";
import { InjectRepository } from "@nestjs/typeorm";
import { ILike, Repository } from "typeorm";
import { AdminEntity } from "../admin/entity/admin.entity";
import { PromotionEntity } from "./entity/promotion.entity";
import { UpdateDiscountDto } from "./dto/update-discount.dto";
import { getDiscountCouponDto } from "./dto/get-discount.dto";
import { DiscountTypeEnum } from "../user-discount/enum/discountType.enum";
import { DiscountCouponEntity } from "../user-discount/entity/discount.entity";

@Injectable()
export class DiscountAdminService {
  constructor(
    @InjectRepository(DiscountCouponEntity)
    private readonly discountCouponRepo: Repository<DiscountCouponEntity>,
    @InjectRepository(PromotionEntity)
    private readonly promotionRepo: Repository<PromotionEntity>,
    @InjectRepository(AdminEntity)
    private readonly adminRepo: Repository<AdminEntity>
  ) {}

  private createResponseData<T>(mapper: (...args: any[]) => T, ...args: any[]): T {
    return mapper(...args);
  }

  private isValueInEnum<T>(enumType: T, value: string | number): boolean {
    return Object.values(enumType).includes(value);
  }

  // async deletePromotion(admin: AdminEntity, id: number) {
  //   const promotion = await this.promotionRepo.findOne({ where: { id } });
  //   if (!promotion) throw new BadRequestException("PROMOTION.NOT_FOUND");
  //   if (promotion.adminId != admin.id) throw new BadRequestException("ADMIN.NOT_ALLOWED");
  //   promotion.deleteAt = new Date();
  //   await this.promotionRepo.save(promotion);
  //   return null;
  // }

  // async updatePromotion(id: number, data: UpdatePromotionDto): Promise<PromotionDto> {
  //   const promotion = await this.promotionRepo.findOne({ where: { id } });
  //   if (!promotion) throw new BadRequestException("PROMOTION.NOT_FOUND");

  //   const admin = await this.adminRepo.findOne({ where: { id: promotion.adminId } });
  //   const challengePromotion = await this.challengePromotionRepo.find({
  //     where: { promotion: { id: promotion.id } },
  //     // relations: ['challenge'],
  //   });
  //   for (let i = 0; i < challengePromotion.length; i++) {
  //     if (data.deselectedChallengeIds.includes(challengePromotion[i].challenge.id)) {
  //       challengePromotion[i].deleteAt = new Date();
  //       await this.challengePromotionRepo.save(challengePromotion[i]);
  //     }
  //   }

  //   const challengePromotionListRes: ChallengePromotionDTO[] = [];
  //   for (let i = 0; i < data.newSelectedChallengeIds.length; i++) {
  //     const pchallenge = await this.challengePromotionRepo.findOne({
  //       where: { promotion: { id: promotion.id }, challenge: { id: data.newSelectedChallengeIds[i] } },
  //       // relations: ['challenge'],
  //     });
  //     if (!pchallenge) {
  //       const challenge = await this.challengeRepo.findOne({ where: { id: data.newSelectedChallengeIds[i] } });
  //       if (challenge) {
  //         let newchallengePromotion = new ChallengePromotionEntity();
  //         newchallengePromotion.promotion = promotion;
  //         newchallengePromotion.challenge = challenge;
  //         newchallengePromotion = await this.challengePromotionRepo.save(newchallengePromotion);
  //         challengePromotionListRes.push({
  //           id: newchallengePromotion.challenge.id,
  //           balance: newchallengePromotion.challenge.balance,
  //           title: newchallengePromotion.challenge.title,
  //           category: newchallengePromotion.challenge.challengeCategory,
  //         });
  //       }
  //     } else
  //       challengePromotionListRes.push({
  //         id: pchallenge.challenge.id,
  //         balance: pchallenge.challenge.balance,
  //         title: pchallenge.challenge.title,
  //         category: pchallenge.challenge.challengeCategory,
  //       });
  //   }

  //   if (data.discountType && data.discountType == DiscountTypeEnum.FIXED) {
  //     if (data.promotionAmount) {
  //       promotion.promotionAmount = data.promotionAmount;
  //       promotion.couponType = data.discountType;
  //       if (data.title) promotion.title = data.title;
  //       if (data.description) promotion.description = data.description;
  //       if (data.isActive && (data.isActive == true || data.isActive == false)) promotion.isActive = data.isActive;
  //       if (data.startAt) promotion.startAt = data.startAt;
  //       if (data.expiredAt) promotion.expiredAt = data.expiredAt;
  //       if (data.usageLimit && data.usageLimit > promotion.usageLimit) promotion.usageLimit = data.usageLimit;
  //       if (data.promotionType) promotion.promotionType = PromotionTypeEnum[data.promotionType];
  //       await this.promotionRepo.save(promotion);
  //       return this.createResponseData<PromotionDto>(
  //         (promotion: PromotionEntity, challenges: ChallengePromotionDTO[], admin: AdminEntity) => ({
  //           id: promotion.id,
  //           title: promotion.title,
  //           description: promotion.description,
  //           isActive: promotion.isActive,
  //           usageCount: promotion.usageCount,
  //           usageLimit: promotion.usageLimit,
  //           startAt: promotion.startAt,
  //           expiresAt: promotion.expiredAt,
  //           createdAt: promotion.createAt,
  //           updatedAt: promotion.updateAt,
  //           deletedAt: promotion.deleteAt,
  //           promotionType: promotion.promotionType,
  //           discountType: promotion.couponType,
  //           maxPromotion: promotion.maxPromotion,
  //           promotionAmount: promotion.promotionAmount,
  //           promotionPercentage: promotion.promotionPercentage,
  //           selectedChallengeList: challenges,
  //           adminInfo: {
  //             id: admin.id,
  //             email: admin.email,
  //             role: "superAdmin",
  //           },
  //         }),
  //         promotion,
  //         challengePromotionListRes,
  //         admin
  //       );
  //     } else throw new BadRequestException("PROMOTION_AMOUNT.INVALID");
  //   } else if (data.discountType && data.discountType == DiscountTypeEnum.PERCENTAGE) {
  //     if (data.maxPromotion && data.promotionPercentage) {
  //       promotion.maxPromotion = data.maxPromotion;
  //       promotion.promotionPercentage = data.promotionPercentage;
  //       promotion.couponType = data.discountType;
  //       if (data.title) promotion.title = data.title;
  //       if (data.description) promotion.description = data.description;
  //       if (data.isActive && (data.isActive == true || data.isActive == false)) promotion.isActive = data.isActive;
  //       if (data.startAt) promotion.startAt = data.startAt;
  //       if (data.expiredAt) promotion.expiredAt = data.expiredAt;
  //       if (data.usageLimit && data.usageLimit > promotion.usageLimit) promotion.usageLimit = data.usageLimit;
  //       if (data.promotionType) promotion.promotionType = PromotionTypeEnum[data.promotionType];
  //       await this.promotionRepo.save(promotion);
  //       return this.createResponseData<PromotionDto>(
  //         (promotion: PromotionEntity, challenges: ChallengePromotionDTO[], admin: AdminEntity) => ({
  //           id: promotion.id,
  //           title: promotion.title,
  //           description: promotion.description,
  //           isActive: promotion.isActive,
  //           usageCount: promotion.usageCount,
  //           usageLimit: promotion.usageLimit,
  //           startAt: promotion.startAt,
  //           expiresAt: promotion.expiredAt,
  //           createdAt: promotion.createAt,
  //           updatedAt: promotion.updateAt,
  //           deletedAt: promotion.deleteAt,
  //           promotionType: promotion.promotionType,
  //           discountType: promotion.couponType,
  //           maxPromotion: promotion.maxPromotion,
  //           promotionAmount: promotion.promotionAmount,
  //           promotionPercentage: promotion.promotionPercentage,
  //           selectedChallengeList: challenges,
  //           adminInfo: {
  //             id: admin.id,
  //             email: admin.email,
  //             role: "superAdmin",
  //           },
  //         }),
  //         promotion,
  //         challengePromotionListRes,
  //         admin
  //       );
  //     } else throw new BadRequestException("PROMOTION_AMOUNT.INVALID");
  //   } else throw new BadRequestException("PROMOTION_TYPE.INVALID");
  // }

  // async getPromotionDetail(id: number): Promise<PromotionDto> {
  //   const promotion = await this.promotionRepo.findOne({ where: { id } });
  //   if (!promotion) throw new BadRequestException("PROMOTION.NOT_FOUND");

  //   const challengePromotion = await this.challengePromotionRepo.find({ where: { promotion: { id: promotion.id } } });
  //   const admin = await this.adminRepo.findOne({ where: { id: promotion.adminId } });
  //   const resChallengePromotion: ChallengePromotionDTO[] = [];
  //   for (let i = 0; i < challengePromotion.length; i++) {
  //     resChallengePromotion.push({
  //       id: challengePromotion[i].challenge.id,
  //       balance: challengePromotion[i].challenge.balance,
  //       title: challengePromotion[i].challenge.title,
  //       category: challengePromotion[i].challenge.challengeCategory,
  //     });
  //   }
  //   return this.createResponseData<PromotionDto>(
  //     (promotion: PromotionEntity, challenges: ChallengePromotionDTO[], admin: AdminEntity) => ({
  //       id: promotion.id,
  //       title: promotion.title,
  //       description: promotion.description,
  //       isActive: promotion.isActive,
  //       adminInfo: {
  //         id: admin.id,
  //         email: admin.email,
  //         role: "superAdmin",
  //       },
  //       usageCount: promotion.usageCount,
  //       usageLimit: promotion.usageLimit,
  //       startAt: promotion.startAt,
  //       expiresAt: promotion.expiredAt,
  //       createdAt: promotion.createAt,
  //       updatedAt: promotion.updateAt,
  //       deletedAt: promotion.deleteAt,
  //       promotionType: promotion.promotionType,
  //       discountType: promotion.couponType,
  //       maxPromotion: promotion.maxPromotion,
  //       promotionAmount: promotion.promotionAmount,
  //       promotionPercentage: promotion.promotionPercentage,
  //       selectedChallengeList: challenges,
  //     }),
  //     promotion,
  //     resChallengePromotion,
  //     admin
  //   );
  // }

  // async getPromotions(
  //   take: number,
  //   skip: number,
  //   promotionType: string,
  //   searchTerm?: string
  // ): Promise<{
  //   promotionOverviewList: PromotionOverviewDto[];
  //   totalItems: number;
  //   allExpired: boolean;
  // }> {
  //   const [promotionList, totalItems] = await this.promotionRepo.findAndCount({
  //     take,
  //     skip,
  //     where:
  //       searchTerm && searchTerm.trim() !== "" ? { title: ILike(`%${searchTerm}%`), promotionType } : { promotionType },
  //   });

  //   const [expiredPromotions, expiredItems] = await this.promotionRepo.findAndCount({
  //     where: { promotionType, isExpired: true },
  //   });

  //   const promotions: PromotionOverviewDto[] = [];
  //   let allExpired: boolean = totalItems == expiredItems ? true : false;
  //   for (let i = 0; i < promotionList.length; i++) {
  //     const admin = await this.adminRepo.findOne({ where: { id: promotionList[i].adminId } });
  //     promotions.push(
  //       this.createResponseData<PromotionOverviewDto>(
  //         (promotion: PromotionEntity, admin: AdminEntity) => ({
  //           id: promotion.id,
  //           isActive: promotion.isActive,
  //           discountType: promotion.couponType,
  //           promotionType: promotion.promotionType,
  //           title: promotion.title,
  //           startAt: promotion.startAt,
  //           expiresAt: promotion.expiredAt,
  //           maxPromotion: promotion.maxPromotion,
  //           promotionAmount: promotion.promotionAmount,
  //           promotionPercentage: promotion.promotionPercentage,
  //           usageCount: promotion.usageCount,
  //           usageLimit: promotion.usageLimit,
  //           admin: admin.email,
  //         }),
  //         promotionList[i],
  //         admin
  //       )
  //     );
  //   }
  //   return {
  //     promotionOverviewList: promotions,
  //     totalItems,
  //     allExpired,
  //   };
  // }

  // async createNewPromotion(admin: AdminEntity, data: CreatePromotionDto): Promise<PromotionDto> {
  //   const { title, description, promotionType, startAt, expiresAt, usageLimit, discountType, selectedChallengeIdList } =
  //     data;
  //   let newPromotion = new PromotionEntity();
  //   newPromotion.title = title;
  //   newPromotion.description = description;
  //   newPromotion.startAt = new Date(startAt);
  //   newPromotion.expiredAt = new Date(expiresAt);
  //   newPromotion.usageLimit = usageLimit;
  //   newPromotion.promotionType = promotionType;
  //   newPromotion.isActive = false;
  //   newPromotion.adminId = admin.id;
  //   if (discountType == DiscountTypeEnum.FIXED) {
  //     newPromotion.promotionAmount = data.promotionAmount;
  //     newPromotion.promotionPercentage = 0;
  //     newPromotion.maxPromotion = 0;
  //   } else if (discountType == DiscountTypeEnum.PERCENTAGE) {
  //     newPromotion.promotionAmount = 0;
  //     newPromotion.promotionPercentage = data.promotionPercentage;
  //     newPromotion.maxPromotion = data.maxPromotion;
  //   } else throw new BadRequestException("DISCOUNT_TYPE.INVALID");
  //   newPromotion.couponType = discountType;
  //   if (this.isValueInEnum(PromotionTypeEnum, promotionType)) newPromotion.promotionType = promotionType;
  //   else throw new BadRequestException("DISCOUNT_TYPE.INVALID");

  //   const challenges = await this.challengeRepo.find({
  //     where: { id: In(selectedChallengeIdList) },
  //   });
  //   newPromotion.usageCount = 0;
  //   const challengePromotionList: ChallengePromotionDTO[] = [];
  //   newPromotion = await this.promotionRepo.save(newPromotion);
  //   for (let i = 0; i < challenges.length; i++) {
  //     this.challengePromotionRepo.save({ promotion: { id: newPromotion.id }, challenge: { id: challenges[i].id } });
  //     challengePromotionList.push({
  //       id: challenges[i].id,
  //       title: challenges[i].title,
  //       balance: challenges[i].balance,
  //       category: challenges[i].challengeCategory,
  //     });
  //   }
  //   return this.createResponseData<PromotionDto>(
  //     (promotion: PromotionEntity, admin: AdminEntity, challengeList: ChallengePromotionDTO[]) => ({
  //       id: promotion.id,
  //       createdAt: promotion.createAt,
  //       updatedAt: promotion.updateAt,
  //       deletedAt: promotion.deleteAt,
  //       adminInfo: {
  //         id: admin.id,
  //         email: admin.email,
  //         role: "superAdmin",
  //       },
  //       title: promotion.title,
  //       description: promotion.description,
  //       startAt: promotion.startAt,
  //       expiresAt: promotion.expiredAt,
  //       isActive: promotion.isActive,
  //       maxPromotion: promotion.maxPromotion,
  //       promotionAmount: promotion.promotionAmount,
  //       promotionPercentage: promotion.promotionPercentage,
  //       usageLimit: promotion.usageLimit,
  //       usageCount: promotion.usageCount,
  //       promotionType: promotion.promotionType,
  //       discountType: promotion.couponType,
  //       selectedChallengeList: challengeList,
  //     }),
  //     newPromotion,
  //     admin,
  //     challengePromotionList
  //   );
  // }

  async activateDiscount(admin: AdminEntity, id: number): Promise<getDiscountCouponDto> {
    let discount = await this.discountCouponRepo.findOne({
      where: { id, adminId: admin.id },
    });
    if (!discount || discount.adminId != admin.id) throw new BadRequestException();

    discount.isActive == true ? (discount.isActive = false) : (discount.isActive = true);

    discount = await this.discountCouponRepo.save(discount);
    return this.createResponseData<getDiscountCouponDto>(
      (discount: DiscountCouponEntity, admin: AdminEntity) => ({
        id: discount.id,
        code: discount.code,
        couponType: DiscountTypeEnum[discount.couponType],
        discountAmount: discount.discountAmount,
        discountPercentage: discount.discountPercentage,
        maxDiscount: discount.maxDiscount,
        usageCount: discount.usageCount,
        usageLimit: discount.usageLimit,
        expiredAt: discount.expiredAt,
        isActive: discount.isActive,
        createdAt: discount.createAt,
        updatedAt: discount.updateAt,
        adminInfo: {
          id: admin.id,
          email: admin.email,
          role: null,
        },
      }),
      discount,
      admin
    );
  }

  async getDiscountDetails(id: number, admin: AdminEntity): Promise<getDiscountCouponDto> {
    const discount = await this.discountCouponRepo.findOne({
      where: { id, adminId: admin.id },
    });
    if (!discount) throw new BadRequestException();
    return this.createResponseData<getDiscountCouponDto>(
      (discount: DiscountCouponEntity, admin: AdminEntity) => ({
        id: discount.id,
        code: discount.code,
        couponType: discount.couponType,
        discountAmount: discount.discountAmount,
        discountPercentage: discount.discountPercentage,
        maxDiscount: discount.maxDiscount,
        usageCount: discount.usageCount,
        usageLimit: discount.usageLimit,
        expiredAt: discount.expiredAt,
        isActive: discount.isActive,
        createdAt: discount.createAt,
        updatedAt: discount.updateAt,
        adminInfo: {
          id: admin.id,
          email: admin.email,
          role: null,
        },
      }),
      discount,
      admin
    );
  }

  async getDiscountList(take: number, skip: number, searchkey?: string) {
    const [resList, totalItems] = await this.discountCouponRepo.findAndCount({
      take,
      skip,
      where: searchkey ? [{ code: ILike(`%${searchkey}%`) }] : undefined,
      order: {
        createAt: "desc",
      },
    });
    const discountCouponOverviewList = resList.map(
      ({ id, code, couponType, usageCount, usageLimit, isActive, expiredAt, createAt }) => ({
        id,
        code,
        usageCount,
        usageLimit,
        isActive,
        expiredAt,
        createAt,
        couponType,
      })
    );
    return { discountCouponOverviewList, totalItems };
  }

  async createDiscountCoupon(admin: AdminEntity, data: CreateAdminDiscountDto): Promise<getDiscountCouponDto> {
    if (!data.expiredAt) {
      throw new BadRequestException();
    }
    let newDiscount = new DiscountCouponEntity();
    newDiscount.adminId = admin.id;
    newDiscount.expiredAt = data.expiredAt;
    newDiscount.usageLimit = data.usageLimit ?? 0;
    newDiscount.usageCount = 0;
    newDiscount.isActive = false;
    newDiscount.code = this.generateCouponCode();
    while (true) {
      const existCode = await this.discountCouponRepo.findOne({
        where: { code: newDiscount.code },
      });
      if (existCode != null) newDiscount.code = this.generateCouponCode();
      else break;
    }
    if (data.couponType === DiscountTypeEnum.FIXED) {
      if (data.discountAmount == null) {
        throw new BadRequestException();
      }
      newDiscount.discountAmount = data.discountAmount;
    } else if (data.couponType === DiscountTypeEnum.PERCENTAGE) {
      if (data.discountPercentage == null) {
        throw new BadRequestException();
      }
      newDiscount.discountPercentage = data.discountPercentage;
      newDiscount.maxDiscount = data.maxDiscount ?? null;
    } else {
      throw new BadRequestException();
    }
    newDiscount.couponType = data.couponType;
    newDiscount = await this.discountCouponRepo.save(newDiscount);
    return this.createResponseData<getDiscountCouponDto>(
      (discount: DiscountCouponEntity, admin: AdminEntity) => ({
        id: discount.id,
        code: discount.code,
        couponType: DiscountTypeEnum[discount.couponType],
        discountAmount: discount.discountAmount,
        discountPercentage: discount.discountPercentage,
        maxDiscount: discount.maxDiscount,
        usageCount: discount.usageCount,
        usageLimit: discount.usageLimit,
        expiredAt: discount.expiredAt,
        isActive: discount.isActive,
        createdAt: discount.createAt,
        updatedAt: discount.updateAt,
        adminInfo: {
          id: admin.id,
          email: admin.email,
          role: null,
        },
      }),
      newDiscount,
      admin
    );
  }

  async updateDiscountDto(id: number, data: UpdateDiscountDto, admin: AdminEntity): Promise<getDiscountCouponDto> {
    let discount = await this.discountCouponRepo.findOne({ where: { id } });
    if (!discount) throw new NotFoundException();
    if (discount.adminId != admin.id) throw new BadRequestException();
    const { expiredAt, usageLimit } = data;
    if (discount.usageLimit >= usageLimit) throw new BadRequestException();
    else discount.usageLimit = usageLimit;
    if (new Date(discount.expiredAt).getTime() >= new Date(expiredAt).getTime()) throw new BadRequestException();
    else discount.expiredAt = expiredAt;
    discount = await this.discountCouponRepo.save(discount);
    return this.createResponseData<getDiscountCouponDto>(
      (discount: DiscountCouponEntity, admin: AdminEntity) => ({
        id: discount.id,
        code: discount.code,
        couponType: DiscountTypeEnum[discount.couponType],
        discountAmount: discount.discountAmount,
        discountPercentage: discount.discountPercentage,
        maxDiscount: discount.maxDiscount,
        usageCount: discount.usageCount,
        usageLimit: discount.usageLimit,
        expiredAt: discount.expiredAt,
        isActive: discount.isActive,
        createdAt: discount.createAt,
        updatedAt: discount.updateAt,
        adminInfo: {
          id: admin.id,
          email: admin.email,
          role: null,
        },
      }),
      discount,
      admin
    );
  }

  private generateCouponCode(): string {
    const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
    const alphanumeric = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    let coupon = letters.charAt(Math.floor(Math.random() * letters.length));
    for (let i = 1; i < 8; i++) {
      coupon += alphanumeric.charAt(Math.floor(Math.random() * alphanumeric.length));
    }
    return coupon;
  }
}
