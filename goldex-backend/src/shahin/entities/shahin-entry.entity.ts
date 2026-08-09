import { Column, Entity, PrimaryGeneratedColumn, CreateDateColumn, ManyToOne, JoinColumn, Index } from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';
import { UserEntity } from '../../user/entity/user.entity';
import { ShahinAccount } from './shahin-account.entity';

export enum ShahinEntryType {
  ACCOUNT_INFO = 'account_info',
  ACCOUNT_BALANCE = 'account_balance',
  ACCOUNT_LIST = 'account_list',
  ACCOUNT_STATEMENT = 'account_statement',
  TRANSFER = 'transfer',
  BATCH_TRANSFER = 'batch_transfer',
  TRANSFER_TO = 'transfer_to',
  TRANSFER_VALIDATION = 'transfer_validation',
  TRANSFER_CONFIRM = 'transfer_confirm',
  TRANSACTION_INQUIRY = 'transaction_inquiry',
  CARD_INFO = 'card_info',
  CARD_BALANCE = 'card_balance',
  CARD_TRANSFER = 'card_transfer',
  CUSTOMER_INFO = 'customer_info',
  IBAN_INFO = 'iban_info',
  OTHER = 'other',
}

export enum ShahinEntryStatus {
  SUCCESS = 'success',
  FAILED = 'failed',
  PENDING = 'pending',
}

@Entity('shahin_entries')
@Index(['userId', 'createdAt'])
@Index(['accountId', 'createdAt'])
@Index(['type', 'status'])
export class ShahinEntry {
  @ApiProperty({ example: 'uuid-string' })
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ApiProperty({ example: 'uuid-string' })
  @Column({ nullable: true })
  userId?: string;

  @ApiProperty({ example: 1 })
  @Column({ nullable: true })
  accountId?: number;

  @ApiProperty({ example: 'account_info', enum: ShahinEntryType })
  @Column({ type: 'varchar', length: 50 })
  type: ShahinEntryType;

  @ApiProperty({ example: 'success', enum: ShahinEntryStatus })
  @Column({ type: 'varchar', length: 20, default: ShahinEntryStatus.PENDING })
  status: ShahinEntryStatus;

  @ApiProperty({ example: '/obh/api/aisp/get-account-info' })
  @Column({ length: 200 })
  endpoint: string;

  @ApiProperty({ example: 'POST' })
  @Column({ length: 10 })
  method: string;

  @ApiProperty({ example: '200' })
  @Column({ type: 'int', nullable: true })
  statusCode?: number;

  @ApiProperty({ example: '{}' })
  @Column({ type: 'json', nullable: true })
  requestData?: any;

  @ApiProperty({ example: '{}' })
  @Column({ type: 'json', nullable: true })
  responseData?: any;

  @ApiProperty({ example: 'Error message if failed' })
  @Column({ type: 'text', nullable: true })
  errorMessage?: string;

  @ApiProperty({ example: '20000' })
  @Column({ length: 50, nullable: true })
  errorCode?: string;

  @ApiProperty({ example: 'uuid-string' })
  @Column({ length: 100, nullable: true })
  transactionId?: string; // Shahin transaction ID/UUID

  @ApiProperty({ example: 'uuid-string' })
  @Column({ length: 100, nullable: true })
  transactionUuid?: string; // Shahin transaction UUID

  @ApiProperty({ example: '1000000.00' })
  @Column({ type: 'decimal', precision: 18, scale: 2, nullable: true })
  amount?: number;

  @ApiProperty({ example: 'IRR' })
  @Column({ length: 10, nullable: true })
  currency?: string;

  @ApiProperty({ example: '2024-01-01T00:00:00.000Z' })
  @CreateDateColumn()
  createdAt: Date;

  @ApiProperty({ example: '{}' })
  @Column({ type: 'json', nullable: true })
  metadata?: any; // Additional metadata

  @ManyToOne(() => UserEntity, { nullable: true })
  @JoinColumn({ name: 'userId' })
  user?: UserEntity;

  @ManyToOne(() => ShahinAccount, { nullable: true })
  @JoinColumn({ name: 'accountId' })
  account?: ShahinAccount;
}

