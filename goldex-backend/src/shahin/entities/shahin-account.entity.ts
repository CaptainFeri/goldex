import { Column, Entity, PrimaryGeneratedColumn, CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn, Index } from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';
import { UserEntity } from '../../user/entity/user.entity';

@Entity('shahin_accounts')
@Index(['accountNumber', 'bankCode'], { unique: true })
export class ShahinAccount {
  @ApiProperty({ example: 1 })
  @PrimaryGeneratedColumn()
  id: number;

  @ApiProperty({ example: 'uuid-string' })
  @Column({ nullable: true })
  userId?: string;

  @ApiProperty({ example: '1234567890' })
  @Column({ length: 50 })
  accountNumber: string;

  @ApiProperty({ example: 'IR123456789012345678901234' })
  @Column({ length: 50, nullable: true })
  iban?: string;

  @ApiProperty({ example: 'John Doe' })
  @Column({ length: 100, nullable: true })
  ownerName?: string;

  @ApiProperty({ example: 'بانک ملی ایران' })
  @Column({ length: 100, nullable: true })
  bankName?: string;

  @ApiProperty({ example: 'BSI' })
  @Column({ length: 10 })
  bankCode: string;

  @ApiProperty({ example: '0081123035' })
  @Column({ length: 20, nullable: true })
  nationalCode?: string;

  @ApiProperty({ example: '1000000.00' })
  @Column({ type: 'decimal', precision: 18, scale: 2, nullable: true })
  balance?: number;

  @ApiProperty({ example: 'active' })
  @Column({ length: 20, default: 'active' })
  accountStatus: string;

  @ApiProperty({ example: 'savings' })
  @Column({ length: 20, nullable: true })
  accountType?: string;

  @ApiProperty({ example: '2024-01-01T00:00:00.000Z' })
  @Column({ type: 'timestamp', nullable: true })
  lastAccessedAt?: Date;

  @ApiProperty({ example: '2024-01-01T00:00:00.000Z' })
  @CreateDateColumn()
  createdAt: Date;

  @ApiProperty({ example: '2024-01-01T00:00:00.000Z' })
  @UpdateDateColumn()
  updatedAt: Date;

  @ApiProperty({ example: '{}' })
  @Column({ type: 'json', nullable: true })
  metadata?: any; // Store full API response data

  @ManyToOne(() => UserEntity, { nullable: true })
  @JoinColumn({ name: 'userId' })
  user?: UserEntity;
}

