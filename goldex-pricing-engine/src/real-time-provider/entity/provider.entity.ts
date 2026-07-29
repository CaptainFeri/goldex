import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('providers')
export class ProviderEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ unique: true })
  key!: string;

  @Column({ type: 'varchar' })
  category!: string;

  @Column({ type: 'text' })
  baseUrl!: string;

  @Column({ type: 'text', nullable: true })
  apiBaseUrl?: string;

  @Column({ type: 'varchar', nullable: true })
  persianName?: string;

  @Column({ type: 'text', nullable: true })
  webPanelUrl?: string;

  @Column({ type: 'varchar', nullable: true })
  phone?: string;

  @Column({ type: 'text', nullable: true })
  sendOtpUrl?: string;

  @Column({ type: 'text', nullable: true })
  verifyCodeUrl?: string;

  @Column({ type: 'jsonb', default: {} })
  auth!: Record<string, any>;

  @Column({ type: 'jsonb', default: {} })
  config!: Record<string, any>;

  @Column({ default: false })
  active!: boolean;

  @Column({ type: 'int', default: 60000 })
  metadataRefreshIntervalMs!: number;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
