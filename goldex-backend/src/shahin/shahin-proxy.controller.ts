import { Controller, Post, Body, Get, Query, Param, UseGuards, HttpException, HttpStatus, Inject, Logger, Request } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { AdminAuthGuard } from '../admin/auth/Guard/admin.guard';
import { AdminRolesGuard } from '../admin/auth/Guard/admin.role.guard';
import { AdminPermissionsGuard } from '../admin-role/guard/admin-permissions.guard';
import { RequirePermissions } from '../admin-role/guard/require-permissions.decorator';
import { AdminRoles } from '../admin/role/admin.role.decorator';
import { AdminRole } from '../admin/role/admin.roles.enum';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom, timeout, catchError, of } from 'rxjs';
import axios, { AxiosRequestConfig } from 'axios';
import { ShahinPersistenceService } from './shahin-persistence.service';
import { ShahinEntryType } from './entities/shahin-entry.entity';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ShahinAccount } from './entities/shahin-account.entity';
import { ShahinEntry } from './entities/shahin-entry.entity';
import { CreateShahinAccountDto } from './dto/create-shahin-account.dto';
import { RIAL_SYMBOL_SLUG } from "../shared/constants/currency.constants";

/**
 * Proxy controller to forward shahin requests to the shahin microservice
 * This allows the frontend to use the same endpoints through the main backend
 */
@Controller('api/shahin')
export class ShahinProxyController {
  private readonly logger = new Logger(ShahinProxyController.name);
  private readonly microserviceUrl: string;
  private readonly requestTimeout: number;
  private readonly apiKey: string;

  constructor(
    @Inject(HttpService)
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
    private readonly persistenceService: ShahinPersistenceService,
    @InjectRepository(ShahinAccount)
    private readonly shahinAccountRepo: Repository<ShahinAccount>,
    @InjectRepository(ShahinEntry)
    private readonly shahinEntryRepo: Repository<ShahinEntry>,
  ) {
    // Get microservice URL from config, default to the shahin server domain
    this.microserviceUrl = this.configService.get('SHAHIN_SERVICE_URL', '');
    this.requestTimeout = parseInt(this.configService.get('SHAHIN_REQUEST_TIMEOUT', '60000'), 10); // Default 60 seconds
    this.apiKey = this.configService.get<string>('SHAHIN_SERVICE_API_KEY', '');
    
    this.logger.log(`Shahin proxy initialized with URL: ${this.microserviceUrl}`);
    this.logger.log(`Request timeout set to: ${this.requestTimeout}ms`);
    if (!this.apiKey) {
      this.logger.warn('⚠️  SHAHIN_SERVICE_API_KEY not configured. Requests may fail if microservice requires authentication.');
    }
    // Verify URL is not truncated
    if (this.microserviceUrl.length < 50) {
      this.logger.error(`⚠️  WARNING: Microservice URL appears truncated! Length: ${this.microserviceUrl.length}, URL: ${this.microserviceUrl}`);
      this.logger.error(`Expected a full URL such as https://9eb6cj.parszargar.com`);
    }
  }

  /**
   * Forwarding lives in ShahinPersistenceService now, so the admin surface and
   * this legacy proxy talk to the bank through one client. Two clients to the
   * same upstream would eventually disagree about error shapes and about which
   * calls get written to the entry log.
   */
  private forwardRequest(path: string, body?: any, transformBody = false, userId?: string) {
    return this.persistenceService.forward(path, body, transformBody, userId);
  }


  // ========== Account Endpoints ==========

  /**
   * These read the *company's* bank accounts, so they are operator routes.
   *
   * They were behind UserAuthGuard, which meant any signed-in customer could
   * read the company's balances and statements. Superseded by
   * GET /admin/shahin/accounts/:id/balance and .../statement.
   *
   * @deprecated Use the admin routes; kept only so existing callers get a
   *   clear 403 rather than a silent route change.
   */
  @Post('account/balance')
  @UseGuards(AdminAuthGuard, AdminPermissionsGuard)
  @RequirePermissions('accounting')
  async getAccountBalance(@Body() dto: any, @Request() req: any) {
    return this.forwardRequest('/account/balance', dto, true, req.admin?.id);
  }

  /** @deprecated Use GET /admin/shahin/accounts/:id/statement. */
  @Post('account/statement')
  @UseGuards(AdminAuthGuard, AdminPermissionsGuard)
  @RequirePermissions('accounting')
  async getAccountStatement(@Body() dto: any, @Request() req: any) {
    return this.forwardRequest('/account/statement', dto, true, req.admin?.id);
  }

  // ========== Transfer Endpoints ==========

  /*
   * Transfers moved to POST /admin/shahin/transfer and /batch-transfer.
   *
   * These three were behind UserAuthGuard: any authenticated customer could
   * ask for an OTP to be sent to *their own phone* and then use it to move
   * money out of the company's Shahin accounts, with the request body — source,
   * destination and amount — forwarded to the bank unvalidated. The admin
   * routes require `wallets_ops` and an operation OTP bound to the amount.
   *
   * They are removed rather than re-gated: keeping a second, differently
   * authorised path to the same bank rail is how the first one survived
   * unnoticed. See docs/SHAHIN-ADMIN.md.
   */

  // ========== Account Management Endpoints ==========

  @Post('accounts')
  @UseGuards(AdminAuthGuard, AdminRolesGuard)
  @AdminRoles(AdminRole.ADMIN)
  async createAccount(@Body() dto: CreateShahinAccountDto, @Request() req: any) {
    const accountData = {
      accountNumber: dto.accountNumber,
      bankCode: dto.bankCode || 'BKV',
      userId: req.admin?.id,
      iban: dto.iban,
      ownerName: dto.ownerName,
      bankName: dto.bankName || 'بانک کشاورزی',
      nationalCode: dto.nationalCode,
      balance: dto.balance,
      accountStatus: dto.accountStatus || 'active',
      accountType: dto.accountType,
      metadata: dto.metadata,
    };

    const account = await this.persistenceService.saveAccount(accountData);
    return account;
  }

  // ========== Stored Data Endpoints ==========

  @Get('accounts')
  @UseGuards(AdminAuthGuard, AdminRolesGuard)
  @AdminRoles(AdminRole.ADMIN)
  async getStoredAccounts(
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '50',
    @Query('accountNumber') accountNumber?: string,
    @Query('bankCode') bankCode?: string,
  ) {
    const pageNum = parseInt(page, 10) || 1;
    const limitNum = parseInt(limit, 10) || 50;
    const skip = (pageNum - 1) * limitNum;

    const queryBuilder = this.shahinAccountRepo
      .createQueryBuilder('account')
      .leftJoinAndSelect('account.user', 'user')
      .orderBy('account.lastAccessedAt', 'DESC')
      .addOrderBy('account.createdAt', 'DESC');

    if (accountNumber) {
      queryBuilder.andWhere('account.accountNumber LIKE :accountNumber', {
        accountNumber: `%${accountNumber}%`,
      });
    }

    if (bankCode) {
      queryBuilder.andWhere('account.bankCode = :bankCode', { bankCode });
    }

    const [accounts, total] = await queryBuilder
      .skip(skip)
      .take(limitNum)
      .getManyAndCount();

    return {
      data: accounts,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum),
      },
    };
  }

  @Get('accounts/:id')
  @UseGuards(AdminAuthGuard, AdminRolesGuard)
  @AdminRoles(AdminRole.ADMIN)
  async getStoredAccount(@Param('id') id: string) {
    const account = await this.shahinAccountRepo.findOne({
      where: { id: parseInt(id, 10) },
      relations: {user:true},
    });

    if (!account) {
      throw new HttpException('Account not found', HttpStatus.NOT_FOUND);
    }

    return account;
  }

  @Get('accounts/:id/entries')
  @UseGuards(AdminAuthGuard, AdminRolesGuard)
  @AdminRoles(AdminRole.ADMIN)
  async getAccountEntries(
    @Param('id') id: string,
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '50',
  ) {
    const pageNum = parseInt(page, 10) || 1;
    const limitNum = parseInt(limit, 10) || 50;
    const skip = (pageNum - 1) * limitNum;

    const [entries, total] = await this.shahinEntryRepo.findAndCount({
      where: { accountId: parseInt(id, 10) },
      order: { createdAt: 'DESC' },
      skip,
      take: limitNum,
      relations: {user:true},
    });

    return {
      data: entries,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum),
      },
    };
  }

  @Get('entries')
  @UseGuards(AdminAuthGuard, AdminRolesGuard)
  @AdminRoles(AdminRole.ADMIN)
  async getStoredEntries(
    @Query('page') page: string = '1',
    @Query('limit') limit: string = '50',
    @Query('type') type?: string,
    @Query('status') status?: string,
    @Query('accountId') accountId?: string,
    @Query('userId') userId?: string,
  ) {
    const pageNum = parseInt(page, 10) || 1;
    const limitNum = parseInt(limit, 10) || 50;
    const skip = (pageNum - 1) * limitNum;

    const queryBuilder = this.shahinEntryRepo
      .createQueryBuilder('entry')
      .leftJoinAndSelect('entry.user', 'user')
      .leftJoinAndSelect('entry.account', 'account')
      .orderBy('entry.createdAt', 'DESC');

    if (type) {
      queryBuilder.andWhere('entry.type = :type', { type });
    }

    if (status) {
      queryBuilder.andWhere('entry.status = :status', { status });
    }

    if (accountId) {
      queryBuilder.andWhere('entry.accountId = :accountId', {
        accountId: parseInt(accountId, 10),
      });
    }

    if (userId) {
      queryBuilder.andWhere('entry.userId = :userId', { userId });
    }

    const [entries, total] = await queryBuilder
      .skip(skip)
      .take(limitNum)
      .getManyAndCount();

    return {
      data: entries,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum),
      },
    };
  }

  @Get('entries/:id')
  @UseGuards(AdminAuthGuard, AdminRolesGuard)
  @AdminRoles(AdminRole.ADMIN)
  async getStoredEntry(@Param('id') id: string) {
    const entry = await this.shahinEntryRepo.findOne({
      where: { id },
      relations: {user:true, account:true},
    });

    if (!entry) {
      throw new HttpException('Entry not found', HttpStatus.NOT_FOUND);
    }

    return entry;
  }
}

