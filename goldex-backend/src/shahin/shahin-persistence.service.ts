import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { HttpException, HttpStatus } from '@nestjs/common';
import { AxiosRequestConfig } from 'axios';
import { firstValueFrom, of } from 'rxjs';
import { catchError, timeout } from 'rxjs/operators';
import { RIAL_SYMBOL_SLUG } from '../shared/constants/currency.constants';
import { Injectable, NotFoundException, Logger, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ShahinAccount } from './entities/shahin-account.entity';
import { ShahinEntry, ShahinEntryType, ShahinEntryStatus } from './entities/shahin-entry.entity';
import { UserRoleEnum } from '../shared/enum/user.role.enum';

@Injectable()
export class ShahinPersistenceService {
  private readonly microserviceUrl: string;
  private readonly requestTimeout: number;
  private readonly apiKey: string;

  private readonly logger = new Logger(ShahinPersistenceService.name);

  constructor(
    @InjectRepository(ShahinAccount)
    private readonly shahinAccountRepo: Repository<ShahinAccount>,
    @InjectRepository(ShahinEntry)
    private readonly shahinEntryRepo: Repository<ShahinEntry>,
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {
    this.microserviceUrl = this.configService.get('SHAHIN_SERVICE_URL', '');
    this.requestTimeout = parseInt(this.configService.get('SHAHIN_REQUEST_TIMEOUT', '60000'), 10);
    this.apiKey = this.configService.get<string>('SHAHIN_SERVICE_API_KEY', '');
 }

  /*
   * requestTransfer / verifyOtp lived here to gate POST /api/shahin/transfer.
   * Both are gone with that route: the code was an in-memory Map (so it did
   * not survive a restart and did not work across replicas) holding an OTP
   * sent to the *caller's own* phone, which authorised nothing meaningful for
   * a company bank transfer. Operation OTP (src/operation-otp) replaces it.
   */


  /**
   * Save or update a Shahin account when it's accessed
   */
  async saveAccount(
    accountData: {
      accountNumber: string;
      bankCode: string;
      userId?: string;
      iban?: string;
      ownerName?: string;
      bankName?: string;
      nationalCode?: string;
      balance?: number;
      accountStatus?: string;
      accountType?: string;
      metadata?: any;
    },
  ): Promise<ShahinAccount> {
    try {
      // Try to find existing account
      let account = await this.shahinAccountRepo.findOne({
        where: {
          accountNumber: accountData.accountNumber,
          bankCode: accountData.bankCode,
        },
      });

      if (account) {
        // Update existing account
        account.lastAccessedAt = new Date();
        if (accountData.balance !== undefined) account.balance = accountData.balance;
        if (accountData.accountStatus) account.accountStatus = accountData.accountStatus;
        if (accountData.iban) account.iban = accountData.iban;
        if (accountData.ownerName) account.ownerName = accountData.ownerName;
        if (accountData.bankName) account.bankName = accountData.bankName;
        if (accountData.nationalCode) account.nationalCode = accountData.nationalCode;
        if (accountData.accountType) account.accountType = accountData.accountType;
        if (accountData.metadata) account.metadata = accountData.metadata;
        if (accountData.userId) account.userId = accountData.userId;
      } else {
        // Create new account
        account = this.shahinAccountRepo.create({
          ...accountData,
          lastAccessedAt: new Date(),
        });
      }

      return await this.shahinAccountRepo.save(account);
    } catch (error: any) {
      this.logger.error(`Failed to save Shahin account: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Save an entry/transaction when a Shahin API operation is performed
   */
  async saveEntry(
    entryData: {
      userId?: string;
      accountId?: number;
      type: ShahinEntryType;
      endpoint: string;
      method: string;
      statusCode?: number;
      requestData?: any;
      responseData?: any;
      errorMessage?: string;
      errorCode?: string;
      transactionId?: string;
      transactionUuid?: string;
      amount?: number;
      currency?: string;
      metadata?: any;
    },
  ): Promise<ShahinEntry> {
    try {
      // Determine status based on statusCode
      let status = ShahinEntryStatus.PENDING;
      if (entryData.statusCode) {
        if (entryData.statusCode >= 200 && entryData.statusCode < 300) {
          status = ShahinEntryStatus.SUCCESS;
        } else {
          status = ShahinEntryStatus.FAILED;
        }
      } else if (entryData.errorMessage || entryData.errorCode) {
        status = ShahinEntryStatus.FAILED;
      }

      // Extract transaction info from response if available
      if (entryData.responseData) {
        if (entryData.responseData.uuid) {
          entryData.transactionUuid = entryData.responseData.uuid;
        }
        if (entryData.responseData.transactionId) {
          entryData.transactionId = entryData.responseData.transactionId;
        }
        if (entryData.responseData.respObject) {
          if (entryData.responseData.respObject.errorCode) {
            entryData.errorCode = entryData.responseData.respObject.errorCode;
          }
          if (entryData.responseData.respObject.message) {
            entryData.errorMessage = entryData.responseData.respObject.message;
          }
        }
      }

      const entry = this.shahinEntryRepo.create({
        ...entryData,
        status,
      });

      return await this.shahinEntryRepo.save(entry);
    } catch (error: any) {
      this.logger.error(`Failed to save Shahin entry: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Extract account information from API response and save it
   */
  async extractAndSaveAccount(
    responseData: any,
    requestData: any,
    userId?: string,
  ): Promise<ShahinAccount | null> {
    try {
      // Handle different response structures
      // Success response: { success: true, statusCode: 201, data: { transactionState: "SUCCESS", respObject: {...} } }
      // Error response: { transactionState: "CORE_FAILED", respObject: {...}, statusCode: 424 }
      // Direct response: { respObject: {...} }

      let accountInfo: any = null;

      // Check if response is wrapped in a data field (success case)
      if (responseData?.data) {
        accountInfo = responseData.data?.respObject || responseData.data;
      } else {
        // Direct response or error response
        accountInfo = responseData?.respObject || responseData;
      }

      if (!accountInfo) return null;

      const accountNumber = requestData?.sourceAccount || requestData?.accountNumber;
      const bankCode = requestData?.bank;

      if (!accountNumber || !bankCode) return null;

      const accountData: any = {
        accountNumber,
        bankCode,
        userId,
        nationalCode: requestData?.nationalCode,
      };

      // Extract account details from response
      // For account balance, check respObject for availableBalance or effectiveBalance
      if (accountInfo.availableBalance !== undefined) {
        accountData.balance = accountInfo.availableBalance;
      } else if (accountInfo.effectiveBalance !== undefined) {
        accountData.balance = accountInfo.effectiveBalance;
      } else if (accountInfo.balance !== undefined) {
        accountData.balance = accountInfo.balance;
      }

      if (accountInfo.accountNumber) accountData.accountNumber = accountInfo.accountNumber;
      if (accountInfo.iban) accountData.iban = accountInfo.iban;
      if (accountInfo.ownerName || accountInfo.accountOwnerName) {
        accountData.ownerName = accountInfo.ownerName || accountInfo.accountOwnerName;
      }
      if (accountInfo.bankName) accountData.bankName = accountInfo.bankName;
      if (accountInfo.accountStatus) accountData.accountStatus = accountInfo.accountStatus;
      if (accountInfo.accountType !== undefined) accountData.accountType = accountInfo.accountType;
      if (accountInfo.status) accountData.accountStatus = accountInfo.status;

      // Only save if we have meaningful data (not just error responses)
      // Check if this is an error response
      const isError = responseData?.transactionState === 'CORE_FAILED' ||
        responseData?.data?.transactionState === 'CORE_FAILED' ||
        responseData?.statusCode >= 400 ||
        (responseData?.data?.statusCode && responseData.data.statusCode >= 400);

      // For error responses, still save the account but with minimal data
      // This allows tracking which accounts were attempted
      accountData.metadata = responseData;

      return await this.saveAccount(accountData);
    } catch (error: any) {
      this.logger.warn(`Failed to extract and save account: ${error.message}`);
      return null;
    }
  }

  /**
   * Get account by account number and bank code
   */
  async getAccount(accountNumber: string, bankCode: string): Promise<ShahinAccount | null> {
    return this.shahinAccountRepo.findOne({
      where: { accountNumber, bankCode },
    });
  }

  /**
   * Get entries for a specific account
   */
  async getAccountEntries(accountId: number, limit: number = 50): Promise<ShahinEntry[]> {
    return this.shahinEntryRepo.find({
      where: { accountId },
      order: { createdAt: 'DESC' },
      take: limit,
    });
  }

  /**
   * Get entries for a specific user
   */
  async getUserEntries(userId: string, limit: number = 50): Promise<ShahinEntry[]> {
    return this.shahinEntryRepo.find({
      where: { userId },
      order: { createdAt: 'DESC' },
      take: limit,
    });
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
  async forward(
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
            const account = await this.extractAndSaveAccount(
              responseData,
              requestBody,
              userId,
            );
            
            // Save entry with account reference
            if (account) {
              await this.saveEntry({
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
                currency: RIAL_SYMBOL_SLUG,
              });
            } else {
              // Save entry without account reference
              await this.saveEntry({
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
              await this.saveEntry({
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
                currency: RIAL_SYMBOL_SLUG,
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
            await this.saveEntry({
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
}
