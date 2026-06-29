import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { KycDocumentStatus, UserKycDocumentEntity } from "../user/entity/user.kyc.document.entity";
import { FindOptionsWhere, ILike, In, Repository } from "typeorm";
import { GetKycDocumentsQueryDto } from "./dto/admin-kyc.dto";
import { UserKycEntity } from "../user/entity/user.kyc.entity";
import { KycLevelEnum } from "../baseinfo/enum/kycLevel.enum";
import { UserEntity } from "../user/entity/user.entity";

@Injectable()
export class AdminKycService {
  constructor(
    @InjectRepository(UserKycDocumentEntity)
    private kycDocumentRepository: Repository<UserKycDocumentEntity>,
    @InjectRepository(UserKycEntity)
    private userKycRepo: Repository<UserKycEntity>,
    @InjectRepository(UserEntity)
    private userRepo: Repository<UserEntity>
  ) {}

  // Users with their KYC level/status + basic info, for the admin KYC list.
  async getUsersWithKyc(take: number, skip: number, search?: string) {
    const [users, total] = await this.userRepo.findAndCount({
      where: search
        ? [
            { firstName: ILike(`%${search}%`) },
            { lastName: ILike(`%${search}%`) },
            { phone: ILike(`%${search}%`) },
            { email: ILike(`%${search}%`) },
          ]
        : undefined,
      relations: { kyc: true, profile: true },
      order: { createAt: "DESC" },
      take,
      skip,
    });

    return {
      items: users.map((u) => ({
        id: u.id,
        firstName: u.firstName,
        lastName: u.lastName,
        phone: u.phone,
        email: u.email,
        nationalId: u.kyc?.nationalId ?? null,
        birthDate: u.kyc?.birthDate ?? null,
        kycLevel: u.kyc?.level ?? 0,
        kycStatus: u.kyc?.status ?? 0,
        verifiedAt: u.kyc?.verifiedAt ?? null,
        rejectReason: u.kyc?.rejectReason ?? null,
        blockedAt: u.blockedAt ?? null,
        createdAt: u.createAt,
      })),
      total,
    };
  }

  async getUserDocuments(userId: string): Promise<UserKycDocumentEntity[]> {
    return await this.kycDocumentRepository.find({
      where: { user: { id: userId } },
      order: { createdAt: "DESC" },
    });
  }

  // Admin Methods
  async getPendingDocuments(query: GetKycDocumentsQueryDto): Promise<{
    items: UserKycDocumentEntity[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }> {
    const { status, fileTarget, search, page = 1, limit = 10, sortBy = "createdAt", sortOrder = "DESC" } = query;

    const where: FindOptionsWhere<UserKycDocumentEntity> = {};

    if (status) {
      where.status = status;
    } else {
      // Default to show pending documents
      where.status = KycDocumentStatus.PENDING;
    }

    if (fileTarget) {
      where.fileTarget = fileTarget;
    }

    if (search) {
      where.fileName = ILike(`%${search}%`);
    }

    const [items, total] = await this.kycDocumentRepository.findAndCount({
      where,
      relations: { user: true },
      skip: (page - 1) * limit,
      take: limit,
      order: { [sortBy]: sortOrder },
    });

    return {
      items,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async getAllDocumentsForAdmin(query: GetKycDocumentsQueryDto): Promise<{
    items: UserKycDocumentEntity[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }> {
    const { status, fileTarget, search, page = 1, limit = 10, sortBy = "createdAt", sortOrder = "DESC" } = query;

    const where: FindOptionsWhere<UserKycDocumentEntity> = {};

    if (status) {
      where.status = status;
    }

    if (fileTarget) {
      where.fileTarget = fileTarget;
    }

    if (search) {
      where.fileName = ILike(`%${search}%`);
    }

    const [items, total] = await this.kycDocumentRepository.findAndCount({
      where,
      relations: { user: true },
      skip: (page - 1) * limit,
      take: limit,
      order: { [sortBy]: sortOrder },
    });

    return {
      items,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async approveDocuments(adminId: string, documentIds: string[], notes?: string): Promise<UserKycDocumentEntity[]> {
    const documents = [];
    for (let i = 0; i < documentIds.length; i++) {
      documents.push(await this.kycDocumentRepository.findOne({ where: { id: documentIds[i] } }));
    }

    if (documents.length !== documentIds.length) throw new NotFoundException("Some documents were not found");

    const approvedDocuments: UserKycDocumentEntity[] = [];

    for (const document of documents) {
      if (document.status !== KycDocumentStatus.PENDING) {
        throw new BadRequestException(
          `Document ${document.id} is already ${document.status}. Only pending documents can be approved.`
        );
      }

      document.status = KycDocumentStatus.APPROVED;
      document.reviewedBy = adminId;
      document.reviewedAt = new Date();
      document.metadata = {
        ...document.metadata,
        adminNotes: notes,
        approvedAt: new Date(),
        approvedBy: adminId,
      };

      approvedDocuments.push(await this.kycDocumentRepository.save(document));
    }

    for (const document of approvedDocuments) {
      await this.updateUserKycStatus(document.userId);
    }
    return approvedDocuments;
  }

  async getDocumentById(documentId: string, userId?: string): Promise<UserKycDocumentEntity> {
    const where: any = { id: documentId };
    if (userId) {
      where.userId = userId;
    }

    const document = await this.kycDocumentRepository.findOne({ where });
    if (!document) {
      throw new NotFoundException("Document not found");
    }
    return document;
  }

  async rejectDocument(
    adminId: string,
    documentId: string,
    reason: string,
    notes?: string
  ): Promise<UserKycDocumentEntity> {
    const document = await this.getDocumentById(documentId);

    if (document.status !== KycDocumentStatus.PENDING) {
      throw new BadRequestException(`Document is already ${document.status}. Only pending documents can be rejected.`);
    }

    document.status = KycDocumentStatus.REJECTED;
    document.rejectionReason = reason;
    document.reviewedBy = adminId;
    document.reviewedAt = new Date();
    document.metadata = {
      ...document.metadata,
      adminNotes: notes,
      rejectedAt: new Date(),
      rejectedBy: adminId,
      rejectionReason: reason,
    };

    const rejectedDocument = await this.kycDocumentRepository.save(document);
    await this.updateUserKycStatus(document.userId);

    return rejectedDocument;
  }

  async rejectMultipleDocuments(
    adminId: string,
    documentIds: string[],
    reason: string,
    notes?: string
  ): Promise<UserKycDocumentEntity[]> {
    const [documents, length] = await this.kycDocumentRepository.findAndCountBy({ id: In(documentIds) });

    if (documents.length !== documentIds.length) {
      throw new NotFoundException("Some documents were not found");
    }

    const rejectedDocuments: UserKycDocumentEntity[] = [];

    for (const document of documents) {
      if (document.status !== KycDocumentStatus.PENDING) {
        throw new BadRequestException(
          `Document ${document.id} is already ${document.status}. Only pending documents can be rejected.`
        );
      }

      document.status = KycDocumentStatus.REJECTED;
      document.rejectionReason = reason;
      document.reviewedBy = adminId;
      document.reviewedAt = new Date();
      document.metadata = {
        ...document.metadata,
        adminNotes: notes,
        rejectedAt: new Date(),
        rejectedBy: adminId,
        rejectionReason: reason,
      };

      rejectedDocuments.push(await this.kycDocumentRepository.save(document));
    }

    const userIds = [...new Set(rejectedDocuments.map((doc) => doc.userId))];
    for (const userId of userIds) {
      await this.updateUserKycStatus(userId);
    }

    return rejectedDocuments;
  }

  private async updateUserKycStatus(userId: string): Promise<void> {
    const userDocs = await this.kycDocumentRepository.find({ where: { user: { id: userId } } });

    const hasApproved = userDocs.some((doc) => doc.status === KycDocumentStatus.APPROVED);
    const hasPending = userDocs.some((doc) => doc.status === KycDocumentStatus.PENDING);
    const allRejected = userDocs.length > 0 && userDocs.every((doc) => doc.status === KycDocumentStatus.REJECTED);

    let kycStatus = KycLevelEnum.NONE;
    if (hasApproved && !hasPending) {
      kycStatus = KycLevelEnum.COMPLETE;
    } else if (hasPending) {
      kycStatus = KycLevelEnum.LEVEL_2;
    } else if (allRejected) {
      kycStatus = KycLevelEnum.LEVEL_2;
    }

    await this.userKycRepo.update(
      { user: { id: userId } },
      {
        level: kycStatus,
        verifiedAt: kycStatus === KycLevelEnum.COMPLETE ? new Date() : null,
      }
    );
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

  async getDocumentStats(): Promise<any> {
    const stats = await this.kycDocumentRepository
      .createQueryBuilder("document")
      .select("document.status", "status")
      .addSelect("document.fileTarget", "fileTarget")
      .addSelect("COUNT(*)", "count")
      .groupBy("document.status")
      .addGroupBy("document.fileTarget")
      .getRawMany();

    const total = await this.kycDocumentRepository.count();

    return {
      total,
      breakdown: stats,
    };
  }
}
