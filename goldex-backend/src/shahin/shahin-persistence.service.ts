import { Injectable, NotFoundException, Logger, UnauthorizedException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ShahinAccount } from './entities/shahin-account.entity';
import { ShahinEntry, ShahinEntryType, ShahinEntryStatus } from './entities/shahin-entry.entity';
import { UserRoleEnum } from '../shared/enum/user.role.enum';
import { SmsService } from '../sms/sms.service';
import { UserEntity } from '../user/entity/user.entity';

@Injectable()
export class ShahinPersistenceService {
  private readonly logger = new Logger(ShahinPersistenceService.name);
  private readonly otpStore = new Map<string, { otp: string; expiresAt: Date }>();

  constructor(
    @InjectRepository(UserEntity)
    private readonly userRepository: Repository<UserEntity>,
    @InjectRepository(ShahinAccount)
    private readonly shahinAccountRepo: Repository<ShahinAccount>,
    @InjectRepository(ShahinEntry)
    private readonly shahinEntryRepo: Repository<ShahinEntry>,
    private readonly smsService: SmsService,
  ) { }

  async requestTransfer(data: any, userId: string) {
    const user = await this.userRepository.findOne({
      where: { id: userId }
    });

    if (!user || !user.phone) {
      throw new UnauthorizedException('USER_NOT_FOUND');
    }

    // Generate 6-digit OTP
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes

    // Store OTP
    this.otpStore.set(this.normalizeMobile(user.phone), { otp, expiresAt });

    // Log OTP generation
    this.logger.log(`OTP generated for user ${user.id}`);

    // Send OTP via SMS
    try {
      await this.smsService.sendOTP(user.phone, otp);
      this.logger.log(`OTP sent to ${user.phone}`);
    } catch (error: any) {
      this.logger.error(`Failed to send OTP: ${error?.message ?? error}`);
      // Don't throw error, just log it
    }

    return {
      message: 'OTP sent successfully',
      expiresAt,
    };
  }

  private normalizeMobile(mobile: string): string {
    return mobile.startsWith('+') ? mobile : `+98${mobile.replace(/^0/, '')}`;
  }

  async verifyOtp(verifyOtpDto: { mobile: string; otp: string }): Promise<boolean> {
    const { mobile, otp } = verifyOtpDto;
  
    const normalizedKey = this.normalizeMobile(mobile);
    const storedOtp = this.otpStore.get(normalizedKey);
  
    if (
      !storedOtp ||
      storedOtp.otp !== otp ||
      Date.now() > storedOtp.expiresAt.getTime()
    ) {
      this.logger.warn(`OTP verification failed for ${mobile}`);
  
      throw new UnauthorizedException('INVALID_OTP');
    }
  
    // Remove OTP from store (use normalized key)
    this.otpStore.delete(normalizedKey);
  
    return true;
  }
  

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
}

