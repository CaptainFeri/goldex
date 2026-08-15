import { Controller, Post, Body, Get, Query, Param, UseGuards, HttpException, HttpStatus, Inject, Logger, Request } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { UserAuthGuard } from '../user/auth/Guard/user.guard';
import { AdminAuthGuard } from '../admin/auth/Guard/admin.guard';
import { AdminRolesGuard } from '../admin/auth/Guard/admin.role.guard';
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
   * Map endpoint path to ShahinEntryType
   */
  private getEntryType(path: string): ShahinEntryType {
    const pathMap: Record<string, ShahinEntryType> = {
      '/account/balance': ShahinEntryType.ACCOUNT_BALANCE,
      '/account/statement': ShahinEntryType.ACCOUNT_STATEMENT,
      '/transfer': ShahinEntryType.TRANSFER,
      '/batch-transfer': ShahinEntryType.BATCH_TRANSFER,
    };
    return pathMap[path] || ShahinEntryType.OTHER;
  }

  /**
   * Convert Gregorian date (YYYY-MM-DD) to Jalali date (YYYYMMDD)
   * Uses reliable conversion algorithm for Gregorian to Jalali (Persian) calendar
   */
  private convertToJalali(gregorianDate: string): string {
    if (!gregorianDate) return gregorianDate;
    
    // If already in Jalali format (8 digits, no dashes), return as is
    if (/^\d{8}$/.test(gregorianDate)) {
      return gregorianDate;
    }
    
    // Parse Gregorian date (YYYY-MM-DD)
    const dateMatch = gregorianDate.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!dateMatch) {
      this.logger.warn(`Invalid date format: ${gregorianDate}, returning as is`);
      return gregorianDate;
    }
    
    const gYear = parseInt(dateMatch[1], 10);
    const gMonth = parseInt(dateMatch[2], 10);
    const gDay = parseInt(dateMatch[3], 10);
    
    // Use reliable Gregorian to Jalali conversion algorithm
    let gy = gYear;
    const gm = gMonth;
    const gd = gDay;
    
    const g_d_m = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334];
    let jy = (gy <= 1600) ? 0 : 979;
    gy -= (gy <= 1600) ? 621 : 1600;
    let gy2 = (gm > 2) ? (gy + 1) : gy;
    let days = (365 * gy) + (Math.floor((gy2 + 3) / 4)) - (Math.floor((gy2 + 99) / 100)) + (Math.floor((gy2 + 399) / 400)) - 80 + gd + g_d_m[gm - 1];
    jy += 33 * Math.floor(days / 12053);
    days %= 12053;
    jy += 4 * Math.floor(days / 1461);
    days %= 1461;
    jy += Math.floor((days - 1) / 365);
    
    if (days > 365) days = (days - 1) % 365;
    
    let jm, jd;
    if (days < 186) {
      jm = 1 + Math.floor(days / 31);
      jd = 1 + (days % 31);
    } else {
      jm = 7 + Math.floor((days - 186) / 30);
      jd = 1 + ((days - 186) % 30);
    }
    
    // Format as YYYYMMDD (ensure 8 digits)
    return `${jy}${String(jm).padStart(2, '0')}${String(jd).padStart(2, '0')}`;
  }

  // Helper method to transform request body for account endpoints
  private transformAccountRequest(body: any): any {
    const transformed: any = { ...body };
    
    // Map accountNumber to sourceAccount if present
    if (body.accountNumber && !body.sourceAccount) {
      transformed.sourceAccount = body.accountNumber;
      delete transformed.accountNumber;
      this.logger.debug(`Mapped accountNumber to sourceAccount: ${body.accountNumber}`);
    }
    
    // Convert dates from Gregorian (YYYY-MM-DD) to Jalali (YYYYMMDD) format
    if (transformed.fromDate) {
      transformed.fromDate = this.convertToJalali(transformed.fromDate);
      this.logger.debug(`Converted fromDate to Jalali: ${transformed.fromDate}`);
    }
    
    if (transformed.toDate) {
      transformed.toDate = this.convertToJalali(transformed.toDate);
      this.logger.debug(`Converted toDate to Jalali: ${transformed.toDate}`);
    }
    
    // Add default bank if not provided
    if (!transformed.bank) {
      transformed.bank = this.configService.get('SHAHIN_BANK_CODE', 'BSI');
      this.logger.debug(`Added default bank: ${transformed.bank}`);
    }
    
    // Add default nationalCode if not provided (from config)
    if (!transformed.nationalCode) {
      const defaultNationalCode = this.configService.get('SHAHIN_COMPANY_NATIONAL_CODE');
      if (defaultNationalCode) {
        transformed.nationalCode = defaultNationalCode;
        this.logger.debug(`Added default nationalCode from config`);
      } else {
        this.logger.warn(`nationalCode is required but not provided and no default is configured`);
      }
    }
    
    // Validate required fields
    if (!transformed.sourceAccount) {
      throw new HttpException(
        { 
          message: 'sourceAccount (or accountNumber) is required',
          details: 'Please provide either sourceAccount or accountNumber in the request body'
        },
        HttpStatus.BAD_REQUEST,
      );
    }
    
    if (!transformed.nationalCode) {
      throw new HttpException(
        { 
          message: 'nationalCode is required',
          details: 'Please provide nationalCode in the request body or configure SHAHIN_COMPANY_NATIONAL_CODE'
        },
        HttpStatus.BAD_REQUEST,
      );
    }
    
    this.logger.debug(`Transformed request body: ${JSON.stringify(transformed)}`);
    return transformed;
  }

  // Helper method to forward requests
  private async forwardRequest(
    path: string, 
    body?: any, 
    transformBody: boolean = false,
    userId?: string,
  ) {
    const startTime = Date.now();
    const entryType = this.getEntryType(path);
    const endpoint = `/api/shahin${path.startsWith('/') ? path : `/${path}`}`;
    
    try {
      // Transform body if needed (for account endpoints)
      const requestBody = transformBody ? this.transformAccountRequest(body || {}) : body;
      
      // Normalize URL to avoid double slashes
      const baseUrl = this.microserviceUrl.replace(/\/+$/, ''); // Remove trailing slashes
      const normalizedPath = path.startsWith('/') ? path : `/${path}`;
      // Microservice has global prefix 'api' and controller 'shahin', so path is: /api/shahin/...
      const url = `${baseUrl}/api/shahin${normalizedPath}`;
      
      this.logger.log(`Forwarding POST request to: ${url}`);
      this.logger.debug(`Request body: ${JSON.stringify(requestBody)}`);
      this.logger.debug(`Request method: POST`);
      this.logger.debug(`Base URL: ${baseUrl}, Path: ${normalizedPath}`);
      this.logger.debug(`Full microservice URL: ${this.microserviceUrl}`);
      
      const config: AxiosRequestConfig = { 
        timeout: this.requestTimeout,
        validateStatus: () => true,
        headers: {
          'Content-Type': 'application/json',
          'X-API-Key': this.apiKey,
        },
      };
      // If you really need to explicitly disable proxy
       
      if (process.env.HTTP_PROXY) {
        // Only set proxy config if you need to override
        config.proxy = false;
      }

      let responseData: any;
      let statusCode: number = 500;
      let errorMessage: string | undefined;
      let errorCode: string | undefined;
      
      try {
        const response = await firstValueFrom(
          this.httpService.post(url, requestBody, config).pipe(
            timeout(this.requestTimeout),
            catchError((error: any) => {
              const elapsed = Date.now() - startTime;
              this.logger.error(`Request failed after ${elapsed}ms`);
              
              if (error.code === 'ECONNABORTED' || error.message.includes('timeout')) {
                this.logger.error(`Timeout connecting to ${url} after ${this.requestTimeout}ms`);
                this.logger.error(`Error details: ${error.message}`);
                this.logger.error(`Error code: ${error.code}`);
                throw new HttpException(
                  { 
                    message: `Timeout connecting to shahin service after ${this.requestTimeout}ms`,
                    details: {
                      url,
                      timeout: this.requestTimeout,
                      error: error.message,
                      code: error.code,
                      microserviceUrl: this.microserviceUrl,
                    }
                  },
                  HttpStatus.GATEWAY_TIMEOUT,
                );
              }
              
              // If we have a response from shahin, return it (even if it's an error)
              if (error.response) {
                const status = error.response.status;
                const responseData = error.response.data;
                
                if (status === 404) {
                  this.logger.error(`❌ 404 Not Found - Microservice route doesn't exist`);
                  this.logger.error(`Request URL: ${url}`);
                  this.logger.error(`Response: ${JSON.stringify(responseData)}`);
                  this.logger.error(`⚠️  ACTION REQUIRED: The microservice needs to be rebuilt and restarted!`);
                  this.logger.error(`   1. cd micro-shahin && npm run build`);
                  this.logger.error(`   2. Restart the microservice process`);
                  this.logger.error(`   3. Verify routes exist: /api/shahin/account/balance, /api/shahin/account/statement, /api/shahin/transfer`);
                } else {
                  this.logger.warn(`⚠️  Shahin service responded with status ${status}`);
                  this.logger.warn(`Response data: ${JSON.stringify(responseData)}`);
                }
                
                // Return the actual shahin response as a successful observable
                // This allows the client to see the actual error details from shahin
                return of(error.response);
              }
              
              if (error.request) {
                this.logger.error(`No response received from shahin service`);
                this.logger.error(`Request details: ${JSON.stringify({
                  url,
                  method: 'POST',
                  timeout: this.requestTimeout,
                })}`);
                throw new HttpException(
                  {
                    message: `No response from shahin service`,
                    details: {
                      url,
                      error: error.message,
                      code: error.code,
                      microserviceUrl: this.microserviceUrl,
                    }
                  },
                  HttpStatus.BAD_GATEWAY,
                );
              }
              
              this.logger.error(`Unknown error: ${error.message}`);
              throw error;
            })
          )
        );
        
        const elapsed = Date.now() - startTime;
        this.logger.log(`Request completed in ${elapsed}ms with status ${response.status}`);
        
        // Get response data - microservice returns { ...responseData, statusCode: status }
        // For 424 errors, responseData will contain: { transactionState: "CORE_FAILED", respObject: {...}, statusCode: 424 }
        // For success, responseData will contain: { transactionState: "SUCCESS", respObject: {...}, statusCode: 200 }
        responseData = response.data;
        statusCode = response.status;
        
        // Log response structure for debugging
        if (statusCode >= 400) {
          this.logger.debug(`Error response structure: ${JSON.stringify(responseData)}`);
        }
        
        // Handle different response structures (following PHP pattern - return JSON body as-is)
        // Success: { transactionState: "SUCCESS", respObject: {...}, statusCode: 200 }
        // Error: { transactionState: "CORE_FAILED", respObject: { errorCode, message }, statusCode: 424 }
        // Wrapped success: { success: true, statusCode: 201, data: { transactionState: "SUCCESS", ... } }
        
        // Extract error info if present
        if (responseData?.respObject) {
          errorCode = responseData.respObject.errorCode;
          errorMessage = responseData.respObject.message;
        } else if (responseData?.data?.respObject) {
          // Check nested data structure (wrapped responses)
          errorCode = responseData.data.respObject.errorCode;
          errorMessage = responseData.data.respObject.message;
        }
        
        // Also check transactionState for errors
        const transactionState = responseData?.transactionState || responseData?.data?.transactionState;
        if (transactionState === 'CORE_FAILED' || transactionState === 'FAILED') {
          if (!errorCode && responseData?.respObject?.errorCode) {
            errorCode = responseData.respObject.errorCode;
          }
          if (!errorMessage && responseData?.respObject?.message) {
            errorMessage = responseData.respObject.message;
          }
        }
        
        // Save account information if this is an account-related endpoint
        if (entryType === ShahinEntryType.ACCOUNT_BALANCE) {
          try {
            const account = await this.persistenceService.extractAndSaveAccount(
              responseData,
              requestBody,
              userId,
            );
            
            // Save entry with account reference
            if (account) {
              await this.persistenceService.saveEntry({
                userId,
                accountId: account.id,
                type: entryType,
                endpoint,
                method: 'POST',
                statusCode,
                requestData: requestBody,
                responseData,
                errorMessage,
                errorCode,
                amount: responseData?.respObject?.availableBalance || 
                        responseData?.respObject?.effectiveBalance ||
                        responseData?.respObject?.balance ||
                        responseData?.data?.respObject?.availableBalance ||
                        responseData?.data?.respObject?.effectiveBalance ||
                        responseData?.data?.respObject?.balance ||
                        requestBody?.amount,
                currency: 'IRR',
              });
            } else {
              // Save entry without account reference
              await this.persistenceService.saveEntry({
                userId,
                type: entryType,
                endpoint,
                method: 'POST',
                statusCode,
                requestData: requestBody,
                responseData,
                errorMessage,
                errorCode,
              });
            }
          } catch (persistError: any) {
            // Log but don't fail the request if persistence fails
            this.logger.warn(`Failed to persist account/entry: ${persistError.message}`);
          }
        } else {
          // Save entry for non-account endpoints
          try {
              await this.persistenceService.saveEntry({
                userId,
                type: entryType,
                endpoint,
                method: 'POST',
                statusCode,
                requestData: requestBody,
                responseData,
                errorMessage,
                errorCode,
                transactionId: responseData?.transactionId,
                transactionUuid: responseData?.uuid,
                amount:
                  // Single transfer amount
                  requestBody?.amount ||
                  // Sum of batch-transfer destination amounts if present
                  (Array.isArray(requestBody?.destination)
                    ? requestBody.destination.reduce(
                        (sum: number, dest: any) =>
                          sum + (Number(dest?.amount) || 0),
                        0,
                      )
                    : undefined) ||
                  // Fallbacks from response
                  responseData?.respObject?.totalAmount ||
                  responseData?.amount,
                currency: 'IRR',
              });
          } catch (persistError: any) {
            // Log but don't fail the request if persistence fails
            this.logger.warn(`Failed to persist entry: ${persistError.message}`);
          }
        }
        
        // Return the actual shahin response data (success or error)
        // Following PHP pattern: return JSON body as-is regardless of HTTP status code
        // For 424: { transactionState: "CORE_FAILED", respObject: {...}, statusCode: 424 }
        // For 200: { transactionState: "SUCCESS", respObject: {...}, statusCode: 200 }
        // This matches PHP's json_decode($response) behavior
        return responseData;
      } catch (error: any) {
        // If it's already an HttpException (timeout, connection error), re-throw it
        if (error instanceof HttpException) {
          throw error;
        }
        
        // For other errors, try to extract response data if available
        if (error.response && error.response.data) {
          this.logger.log(`Returning shahin error response: ${JSON.stringify(error.response.data)}`);
          responseData = error.response.data;
          statusCode = error.response.status;
          
          // Try to save entry even for errors
          try {
            await this.persistenceService.saveEntry({
              userId,
              type: entryType,
              endpoint,
              method: 'POST',
              statusCode,
              requestData: requestBody,
              responseData,
              errorMessage: error.message,
              errorCode: responseData?.respObject?.errorCode,
            });
          } catch (persistError: any) {
            this.logger.warn(`Failed to persist error entry: ${persistError.message}`);
          }
          
          return responseData;
        }
        
        // If no response data, throw the error
        throw error;
      }
    } catch (error: any) {
      const elapsed = Date.now() - startTime;
      
      // If it's already an HttpException, re-throw it
      if (error instanceof HttpException) {
        throw error;
      }
      
      // Handle other errors
      this.logger.error(`Unexpected error after ${elapsed}ms: ${error.message}`);
      this.logger.error(`Error stack: ${error.stack}`);
      
      throw new HttpException(
        { 
          message: `Failed to connect to shahin service: ${error.message}`,
          details: {
            error: error.message,
            code: error.code,
            microserviceUrl: this.microserviceUrl,
            elapsed: `${elapsed}ms`,
          }
        },
        HttpStatus.BAD_GATEWAY,
      );
    }
  }

  // ========== Account Endpoints ==========

  @Post('account/balance')
  @UseGuards(UserAuthGuard)
  async getAccountBalance(@Body() dto: any, @Request() req: any) {
    return this.forwardRequest('/account/balance', dto, true, req.user?.id);
  }

  @Post('account/statement')
  @UseGuards(UserAuthGuard)
  async getAccountStatement(@Body() dto: any, @Request() req: any) {
    return this.forwardRequest('/account/statement', dto, true, req.user?.id);
  }

  // ========== Transfer Endpoints ==========

  @Post('request-transfer')
  @UseGuards(UserAuthGuard)
  async requestTransfer(@Body() dto: any, @Request() req: any) {
    return this.persistenceService.requestTransfer(dto, req.user?.id);
  }

  @Post('transfer')
  @UseGuards(UserAuthGuard)
  async transfer(@Body() dto: any, @Request() req: any) {
    const isVerified = await this.persistenceService.verifyOtp({
      otp: dto.otpcode,
      mobile: req.user?.phone,
    })
    if (!isVerified) {
      throw new HttpException('Invalid OTP', HttpStatus.UNAUTHORIZED);
    }
    return this.forwardRequest('/transfer', dto, false, req.user?.id);
  }

  @Post('batch-transfer')
  @UseGuards(UserAuthGuard)
  async batchTransfer(@Body() dto: any, @Request() req: any) {
    const isVerified = await this.persistenceService.verifyOtp({
      otp: dto.otpcode,
      mobile: req.user?.phone,
    });
    if (!isVerified) {
      throw new HttpException('Invalid OTP', HttpStatus.UNAUTHORIZED);
    }
    return this.forwardRequest('/batch-transfer', dto, false, req.user?.id);
  }

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

