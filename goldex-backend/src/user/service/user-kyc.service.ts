import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
  MethodNotAllowedException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { UserKycEntity } from "../entity/user.kyc.entity";
import { In, Repository } from "typeorm";
import { UserEntity } from "../entity/user.entity";
import { JibitProvider } from "../../kyc/providers/jibit/jibit.provider";
import { VerifyBankAccountDto } from "../dto/verifyBankAccount.dto";
import { UserKycHistoryEntity } from "../entity/user.kyc.history.entity";
import { KycLevelEnum } from "../../baseinfo/enum/kycLevel.enum";
import { KycStatusEnum } from "../../baseinfo/enum/kycStatus.enum";
import { UserBankAccountEntity } from "../entity/user.bank.account.entity";
import { MinioService } from "../../minio/minio.service";
import { KycDocumentStatus, UserKycDocumentEntity } from "../entity/user.kyc.document.entity";
import { UploadKycDocumentDto } from "../dto/upload-kyc-document.dto";

@Injectable()
export class UserKycService {
  private readonly MAX_UPLOADS_PER_USER = 5;
  constructor(
    @InjectRepository(UserKycEntity)
    private readonly kycRepo: Repository<UserKycEntity>,

    @InjectRepository(UserEntity)
    private readonly userRepo: Repository<UserEntity>,

    @InjectRepository(UserKycHistoryEntity)
    private readonly kycHistoryRepo: Repository<UserKycHistoryEntity>,

    @InjectRepository(UserBankAccountEntity)
    private readonly userBankRepo: Repository<UserBankAccountEntity>,

    @InjectRepository(UserKycDocumentEntity)
    private readonly userKycDocumentRepo: Repository<UserKycDocumentEntity>,

    private readonly minioService: MinioService,
    private readonly jibitProvider: JibitProvider
  ) {}

  async uploadDocument(
    userId: string,
    file: Express.Multer.File,
    dto: UploadKycDocumentDto
  ): Promise<UserKycDocumentEntity> {
    const userDocuments = await this.userKycDocumentRepo.find({
      where: { user: { id: userId } },
    });

    const userKyc = await this.kycRepo.findOne({ where: { user: { id: userId } } });

    // Document upload is only allowed once the user has reached Level 2
    // verification. (Previously this compared `status` against a *level* enum,
    // which blocked approved users and crashed when no KYC record existed.)
    if (!userKyc || userKyc.level < KycLevelEnum.LEVEL_2) {
      throw new MethodNotAllowedException("Document upload requires completing Level 2 verification first.");
    }
    if (userDocuments.length >= this.MAX_UPLOADS_PER_USER) {
      throw new BadRequestException(
        `Maximum upload limit of ${this.MAX_UPLOADS_PER_USER} documents reached. ` +
          `Please contact support if you need to upload more documents.`
      );
    }

    const existingDocument = await this.userKycDocumentRepo.findOne({
      where: {
        user: { id: userId },
        fileTarget: dto.fileTarget,
        status: In([KycDocumentStatus.PENDING, KycDocumentStatus.APPROVED]),
      },
    });

    if (existingDocument) {
      throw new BadRequestException(
        `You already have a ${dto.fileTarget} document that is ${existingDocument.status}. ` +
          `Please wait for admin review or contact support.`
      );
    }

    const objectName = `kyc/${userId}/${dto.fileTarget}/${Date.now()}-${file.originalname}`;
    const uploadOptions = {
      objectName: objectName,
      stream: file.buffer,
      size: file.size,
      contentType: file.mimetype,
      metadata: {
        userId,
        fileTarget: dto.fileTarget,
        uploadedBy: "user",
        originalName: file.originalname,
      },
    };

    const uploadedFile = await this.minioService.uploadFile(uploadOptions, dto.fileTarget);

    const document = this.userKycDocumentRepo.create({
      userId,
      fileTarget: dto.fileTarget,
      fileName: file.originalname,
      fileUrl: uploadedFile.url,
      fileSize: file.size,
      mimeType: file.mimetype,
      etag: uploadedFile.etag,
      status: KycDocumentStatus.PENDING,
      // metadata: {
      //   ...dto.metadata,
      //   description: dto.description,
      //   uploadedAt: new Date(),
      //   ipAddress: dto.metadata?.ipAddress,
      //   userAgent: dto.metadata?.userAgent,
      // },
    });

    return await this.userKycDocumentRepo.save(document);
  }

  async getUserDocuments(userId: string): Promise<UserKycDocumentEntity[]> {
    return await this.userKycDocumentRepo.find({
      where: { user: { id: userId } },
      order: { createdAt: "DESC" },
    });
  }

  async getUserDocumentsByStatus(userId: string, status?: KycDocumentStatus): Promise<UserKycDocumentEntity[]> {
    const where: any = { user: { id: userId } };
    if (status) {
      where.status = status;
    }
    return await this.userKycDocumentRepo.find({
      where,
      order: { createdAt: "DESC" },
    });
  }

  private mapToSummary(document: UserKycDocumentEntity): any {
    return {
      id: document.id,
      fileTarget: document.fileTarget,
      fileName: document.fileName,
      status: document.status,
      rejectionReason: document.rejectionReason,
      createdAt: document.createdAt,
    };
  }

  async getUserUploadStats(userId: string): Promise<any> {
    const allDocuments = await this.getUserDocuments(userId);

    const pending = allDocuments.filter((doc) => doc.status === KycDocumentStatus.PENDING);
    const approved = allDocuments.filter((doc) => doc.status === KycDocumentStatus.APPROVED);
    const rejected = allDocuments.filter((doc) => doc.status === KycDocumentStatus.REJECTED);

    return {
      totalUploads: allDocuments.length,
      maxAllowed: this.MAX_UPLOADS_PER_USER,
      remaining: this.MAX_UPLOADS_PER_USER - allDocuments.length,
      pendingCount: pending.length,
      approvedCount: approved.length,
      rejectedCount: rejected.length,
      documents: {
        pending: pending.map(this.mapToSummary),
        approved: approved.map(this.mapToSummary),
        rejected: rejected.map(this.mapToSummary),
      },
    };
  }

  async getDocumentById(documentId: string, userId?: string): Promise<UserKycDocumentEntity> {
    const where: any = { id: documentId };
    if (userId) {
      where.user = { id: userId };
    }

    const document = await this.userKycDocumentRepo.findOne({ where });
    if (!document) {
      throw new NotFoundException("Document not found");
    }
    return document;
  }

  async deleteDocument(userId: string, documentId: string): Promise<void> {
    const document = await this.getDocumentById(documentId, userId);

    if (document.status === KycDocumentStatus.APPROVED) {
      throw new ForbiddenException("Cannot delete an approved document");
    }

    await this.userKycDocumentRepo.softDelete(documentId);
  }

  async verifyLevel1(userId: string, nationalId: string) {
    const user = await this.userRepo.findOne({
      where: { id: userId },
      relations: { kyc: true },
    });

    if (
      !user ||
      (user.kyc && user.kyc.level === KycLevelEnum.LEVEL_1 && user.kyc.status === KycStatusEnum.APPROVED) ||
      (user.kyc && user.kyc.level === KycLevelEnum.LEVEL_3 && user.kyc.status === KycStatusEnum.APPROVED)
    ) {
      throw new BadRequestException("BAD_REQUEST");
    }

    const matched = await this.jibitProvider.matchMobileAndNationalId(nationalId, user.phone);

    let kyc = await this.kycRepo.findOne({
      where: { userId },
    });

    if (!kyc) {
      kyc = this.kycRepo.create({
        userId,
      });
    }

    if (matched !== true) {
      kyc.nationalId = nationalId;
      kyc.level = KycLevelEnum.LEVEL_1;
      kyc.status = KycStatusEnum.REJECTED;
      kyc.verifiedAt = new Date();
    } else {
      kyc.nationalId = nationalId;
      kyc.level = KycLevelEnum.LEVEL_1;
      kyc.status = KycStatusEnum.APPROVED;
      kyc.verifiedAt = new Date();
    }
    if (kyc.status == KycStatusEnum.REJECTED) throw new BadRequestException("BAD_REQUEST");

    const [saveResult] = await Promise.all([
      this.kycRepo.save(kyc),
      // this.saveKycHistory(user, kyc.level, kyc.status),
    ]);

    return saveResult;
  }

  // private async saveKycHistory(user: UserEntity, level: number, status: number, reason?: string) {
  //   return await this.kycHistoryRepo.save({ user, level, status, reason });
  // }

  async verifyLevel2(user: UserEntity, dto: VerifyBankAccountDto) {
    let kyc = await this.kycRepo.findOne({
      where: { userId: user.id, level: KycLevelEnum.LEVEL_1 },
    });

    if (!kyc) throw new BadRequestException("Level 1 KYC not found");

    if (kyc.status === KycStatusEnum.APPROVED && kyc.level === KycLevelEnum.LEVEL_2)
      throw new BadRequestException("BAD_REQUEST");

    const result = await this.jibitProvider.verifyBankAccount(
      dto.bank,
      dto.depositNumber,
      kyc.nationalId,
      dto.birthDate,
      dto.iban
    );

    const bankAccount = new UserBankAccountEntity();

    if (!result) {
      kyc.level = KycLevelEnum.LEVEL_2;
      kyc.status = KycStatusEnum.REJECTED;
      kyc.birthDate = dto.birthDate;
      bankAccount.user = user;
      bankAccount.bankName = dto.bank;
      bankAccount.iban = dto.iban;
      bankAccount.depositNumber = dto.depositNumber;
    } else {
      const iban = await this.jibitProvider.getIbanInfo(dto.iban);
      user.firstName = iban.ibanInfo.owners[0].firstName;
      user.lastName = iban.ibanInfo.owners[0].lastName;
      if (iban.ibanInfo.status === "ACTIVE") {
        kyc.birthDate = dto.birthDate;
        bankAccount.user = user;
        bankAccount.bankName = dto.bank;
        bankAccount.iban = dto.iban;
        bankAccount.depositNumber = dto.depositNumber;
        kyc.level = KycLevelEnum.LEVEL_2;
        kyc.status = KycStatusEnum.APPROVED;
        kyc.verifiedAt = new Date();
      } else {
        kyc.birthDate = dto.birthDate;
        bankAccount.user = user;
        bankAccount.bankName = dto.bank;
        bankAccount.iban = dto.iban;
        bankAccount.depositNumber = dto.depositNumber;
        kyc.level = KycLevelEnum.LEVEL_2;
        kyc.status = KycStatusEnum.REJECTED;
        kyc.verifiedAt = new Date();
      }
    }

    if (kyc.status == KycStatusEnum.REJECTED) throw new BadRequestException("BAD_REQUEST");

    const [userResult, saveResult] = await Promise.all([
      this.userRepo.save(user),
      this.kycRepo.save(kyc),
      this.userBankRepo.save(bankAccount),
    ]);
    return userResult.firstName + " " + userResult.lastName;
  }

  async getKyc(userId: string) {
    const kyc = await this.kycRepo.findOne({
      where: { userId },
      select: {
        id: true,
        createAt: true,
        updateAt: true,
        verifiedAt: true,
        nationalId: true,
        birthDate: true,
        level: true,
        status: true,
        rejectReason: true,
      },
    });
    if (kyc)
      return {
        ...kyc,
        level: KycLevelEnum[kyc.level],
        status: KycStatusEnum[kyc.status],
      };
    else return null;
  }
}
