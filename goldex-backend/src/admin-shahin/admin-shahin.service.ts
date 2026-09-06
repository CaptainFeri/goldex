import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { In, Repository } from "typeorm";
import { ShahinAccount } from "../shahin/entities/shahin-account.entity";
import { ShahinEntry, ShahinEntryType } from "../shahin/entities/shahin-entry.entity";
import { ShahinPersistenceService } from "../shahin/shahin-persistence.service";
import {
  AccountBalanceDto,
  InquiryResultDto,
  OpenBankingConnectionDto,
  ShahinAccountDto,
  StatementQueryDto,
  StatementRowDto,
  TransferDto,
} from "./dto/admin-shahin.dto";

/** The bank answers in several shapes; this is the one place that knows them. */
function respObject(response: unknown): Record<string, any> | null {
  const r = response as any;
  return r?.respObject ?? r?.data?.respObject ?? null;
}

function firstString(source: Record<string, any> | null, keys: string[]): string | null {
  if (!source) return null;
  for (const k of keys) {
    const v = source[k];
    if (v !== undefined && v !== null && String(v).trim() !== "") return String(v);
  }
  return null;
}

@Injectable()
export class AdminShahinService {
  constructor(
    @InjectRepository(ShahinAccount) private readonly accounts: Repository<ShahinAccount>,
    @InjectRepository(ShahinEntry) private readonly entries: Repository<ShahinEntry>,
    private readonly shahin: ShahinPersistenceService,
  ) {}

  // ── Accounts ────────────────────────────────────────────────────────────

  async listAccounts(): Promise<ShahinAccountDto[]> {
    const rows = await this.accounts.find({ order: { createdAt: "DESC" } });
    return rows.map((a) => this.toAccountDto(a));
  }

  async account(id: number): Promise<ShahinAccountDto> {
    return this.toAccountDto(await this.requireAccount(id));
  }

  /**
   * Asks the bank, rather than reading the stored figure.
   *
   * The stored `balance` is whatever the last call happened to return; an
   * operator about to move money needs the number now, and the timestamp says
   * which it is.
   */
  async balance(id: number, adminId: string): Promise<AccountBalanceDto> {
    const account = await this.requireAccount(id);
    const response = await this.shahin.forward(
      "/account/balance",
      { accountNumber: account.accountNumber, bankCode: account.bankCode },
      true,
      adminId,
    );
    const body = respObject(response);
    return {
      accountNumber: account.accountNumber,
      availableBalance: firstString(body, ["availableBalance", "balance"]),
      effectiveBalance: firstString(body, ["effectiveBalance", "ledgerBalance", "balance"]),
      fetchedAt: new Date(),
    };
  }

  async statement(id: number, query: StatementQueryDto, adminId: string): Promise<StatementRowDto[]> {
    const account = await this.requireAccount(id);

    if (query.from && query.to && new Date(query.from) > new Date(query.to)) {
      // Silently returning nothing reads as "no transactions in that range".
      throw new BadRequestException("SHAHIN.RANGE_INVERTED");
    }

    const response = await this.shahin.forward(
      "/account/statement",
      {
        accountNumber: account.accountNumber,
        bankCode: account.bankCode,
        fromDate: query.from,
        toDate: query.to,
        page: query.page ?? 1,
      },
      true,
      adminId,
    );

    const rows = this.parseStatement(response);
    // The bank does not filter on these, so we do — and it happens after the
    // fetch, which is why the page size the bank returns is what bounds it.
    return rows.filter((r) => {
      if (query.trackNo && r.trackNo !== query.trackNo) return false;
      const amount = r.amount === null ? null : Number(r.amount);
      if (query.minAmount && (amount === null || amount < Number(query.minAmount))) return false;
      if (query.maxAmount && (amount === null || amount > Number(query.maxAmount))) return false;
      return true;
    });
  }

  parseStatement(response: unknown): StatementRowDto[] {
    const body = respObject(response);
    const list: any[] =
      (Array.isArray(body?.transactions) && body!.transactions) ||
      (Array.isArray(body?.items) && body!.items) ||
      (Array.isArray(body?.records) && body!.records) ||
      (Array.isArray(body) && body) ||
      [];

    return list.map((t) => {
      const amount = firstString(t, ["amount", "transactionAmount", "value"]);
      const explicit = firstString(t, ["direction", "type", "transactionType"]);
      return {
        date: firstString(t, ["date", "transactionDate", "documentDate"]),
        description: firstString(t, ["description", "desc", "narration", "title"]),
        amount,
        balance: firstString(t, ["balance", "runningBalance", "afterBalance"]),
        trackNo: firstString(t, ["trackNo", "trackingNumber", "followUpCode", "refCode"]),
        direction: normalizeDirection(explicit, amount),
      };
    });
  }

  // ── Inquiry ─────────────────────────────────────────────────────────────

  /** The "استعلام" step: who owns the destination account, before money moves. */
  async inquiry(destAccount: string, adminId: string): Promise<InquiryResultDto> {
    const response = await this.shahin.forward(
      "/account/inquiry",
      { destAccount, accountNumber: destAccount },
      false,
      adminId,
    );
    const body = respObject(response);
    const ownerName = firstString(body, ["ownerName", "owner", "fullName", "name", "depositOwners"]);
    if (!ownerName) {
      // Better a clear refusal than a confirmation dialog showing a blank owner.
      throw new BadRequestException("SHAHIN.INQUIRY_NO_OWNER");
    }
    return {
      ownerName,
      accountNumber: firstString(body, ["accountNumber", "deposit", "iban"]) ?? destAccount,
      bankName: firstString(body, ["bankName", "bank"]),
    };
  }

  // ── Transfers ───────────────────────────────────────────────────────────

  /**
   * The operation OTP is already spent by the guard before this runs, so the
   * confirmation fields are stripped rather than forwarded to the bank.
   */
  async transfer(dto: TransferDto, adminId: string): Promise<unknown> {
    const { challengeId: _c, otp: _o, ...payload } = dto;
    return this.shahin.forward("/transfer", payload, false, adminId);
  }

  async batchTransfer(payload: Record<string, unknown>, adminId: string): Promise<unknown> {
    const { challengeId: _c, otp: _o, refIds: _r, ...rest } = payload;
    return this.shahin.forward("/batch-transfer", rest, false, adminId);
  }

  // ── Open banking ────────────────────────────────────────────────────────

  /**
   * Connection state derived from what we actually observed.
   *
   * There is no upstream endpoint that reports consent or scope, so nothing
   * here is invented: `connected` is "did the last call for this account
   * succeed", and the fields the bank does not tell us stay null rather than
   * being guessed at.
   */
  async openBanking(): Promise<OpenBankingConnectionDto[]> {
    const accounts = await this.accounts.find({ order: { createdAt: "DESC" } });
    if (accounts.length === 0) return [];

    const latest = await this.latestEntryPerAccount(accounts.map((a) => a.id));

    return accounts.map((a) => {
      const entry = latest.get(a.id);
      const meta = (a.metadata ?? {}) as Record<string, any>;
      return {
        accountId: a.id,
        accountNumber: a.accountNumber,
        bankName: a.bankName ?? null,
        connected: entry ? (entry.statusCode ?? 0) < 400 : false,
        lastSyncAt: a.lastAccessedAt ?? entry?.createdAt ?? null,
        accessScope: firstString(meta, ["accessScope", "scope"]),
        consentExpiresAt: meta.consentExpiresAt ? new Date(meta.consentExpiresAt) : null,
        lastError: entry && (entry.statusCode ?? 0) >= 400 ? entry.errorMessage ?? null : null,
      };
    });
  }

  /** Re-asks the bank for this account, which is what "sync" can honestly mean here. */
  async syncOpenBanking(id: number, adminId: string): Promise<OpenBankingConnectionDto> {
    await this.balance(id, adminId);
    const all = await this.openBanking();
    const row = all.find((c) => c.accountId === id);
    if (!row) throw new NotFoundException("SHAHIN.ACCOUNT_NOT_FOUND");
    return row;
  }

  async accountsByIds(ids: number[]): Promise<ShahinAccount[]> {
    if (ids.length === 0) return [];
    return this.accounts.find({ where: { id: In(ids) } });
  }

  // ── Helpers ─────────────────────────────────────────────────────────────

  private async requireAccount(id: number): Promise<ShahinAccount> {
    const account = await this.accounts.findOne({ where: { id } });
    if (!account) throw new NotFoundException("SHAHIN.ACCOUNT_NOT_FOUND");
    return account;
  }

  private async latestEntryPerAccount(ids: number[]): Promise<Map<number, ShahinEntry>> {
    const rows = await this.entries.find({
      where: { accountId: In(ids) },
      order: { createdAt: "DESC" },
    });
    const map = new Map<number, ShahinEntry>();
    for (const e of rows) {
      // Ordered newest first, so the first one seen per account is the latest.
      if (e.accountId != null && !map.has(e.accountId)) map.set(e.accountId, e);
    }
    return map;
  }

  private toAccountDto(a: ShahinAccount): ShahinAccountDto {
    return {
      id: a.id,
      accountNumber: a.accountNumber,
      iban: a.iban ?? null,
      ownerName: a.ownerName ?? null,
      bankName: a.bankName ?? null,
      bankCode: a.bankCode,
      balance: a.balance === null || a.balance === undefined ? null : String(a.balance),
      accountStatus: a.accountStatus,
      lastAccessedAt: a.lastAccessedAt ?? null,
    };
  }
}

/**
 * Which way the money went.
 *
 * Falls back to the sign of the amount only when the bank said nothing, and
 * returns null when even that is unavailable — a guessed direction on a bank
 * statement is worse than an empty cell.
 */
export function normalizeDirection(explicit: string | null, amount: string | null): string | null {
  if (explicit) {
    const v = explicit.toLowerCase();
    if (/(credit|deposit|واریز|بستانکار)/.test(v)) return "credit";
    if (/(debit|withdraw|برداشت|بدهکار)/.test(v)) return "debit";
  }
  if (amount === null || amount.trim() === "") return null;
  const n = Number(amount);
  if (!Number.isFinite(n) || n === 0) return null;
  return n < 0 ? "debit" : "credit";
}
