import { BadRequestException, Injectable, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { EntityManager, Repository } from "typeorm";
import { UserBankAccountEntity } from "../../user/entity/user.bank.account.entity";
import { UserBankAccountTagEnum } from "../../user/enum/user-bank-account-tag.enum";

/** IR + 2 check digits + 22 digits. */
const IBAN_RE = /^IR\d{24}$/;

/**
 * Records the IBAN a customer gives for a p2p transfer.
 *
 * Ownership is deliberately not checked — the account need not be the
 * customer's own — so these are stored alongside the KYC account under the
 * P2P_WALLET tag rather than being mistaken for a verified one.
 */
@Injectable()
export class P2pUserBankService {
  private readonly logger = new Logger(P2pUserBankService.name);

  constructor(
    @InjectRepository(UserBankAccountEntity)
    private readonly repo: Repository<UserBankAccountEntity>,
  ) {}

  static normalise(iban: string): string {
    return String(iban ?? "").toUpperCase().replace(/[\s-]/g, "");
  }

  /**
   * Upserts the IBAN for this user and returns the stored row. Re-using an
   * IBAN the customer has given before returns the existing row rather than
   * creating a duplicate.
   */
  async remember(
    userId: string,
    rawIban: string,
    bankName?: string,
    manager?: EntityManager,
  ): Promise<UserBankAccountEntity> {
    const iban = P2pUserBankService.normalise(rawIban);
    if (!IBAN_RE.test(iban)) {
      throw new BadRequestException("شماره شبا معتبر نیست (نمونه: IR + ۲۴ رقم)");
    }

    const repo = manager ? manager.getRepository(UserBankAccountEntity) : this.repo;

    const existing = await repo.findOne({ where: { userId, iban } });
    if (existing) {
      // Only fill a blank bank name; never downgrade a KYC row's tag.
      if (bankName && !existing.bankName) {
        existing.bankName = bankName;
        return repo.save(existing);
      }
      return existing;
    }

    const saved = await repo.save(
      repo.create({
        userId,
        iban,
        bankName: bankName ?? null,
        tag: UserBankAccountTagEnum.P2P_WALLET,
      }),
    );
    this.logger.log(`Stored p2p IBAN ${iban.slice(0, 6)}… for user ${userId}`);
    return saved;
  }
}
