import { Entity, Column, Index } from 'typeorm';
import { myBaseEntity } from '../../shared/entity/base.entity';

export enum UserState {
  IDLE = 'idle',
  WAITING_FOR_OTP = 'waiting_for_otp',
  AUTHENTICATED = 'authenticated',
  WAITING_FOR_QUOTE_PAIR = 'waiting_for_quote_pair',
  WAITING_FOR_QUOTE_SIDE = 'waiting_for_quote_side',
  WAITING_FOR_QUOTE_AMOUNT = 'waiting_for_quote_amount',
  WAITING_FOR_QUOTE_PRICE = 'waiting_for_quote_price',
  WAITING_FOR_QUOTE_DESC = 'waiting_for_quote_desc',
  WAITING_FOR_QUOTE_CONFIRM = 'waiting_for_quote_confirm',
  WAITING_FOR_ORDER_CANCEL = 'waiting_for_order_cancel',
}

@Entity('telegram_users')
export class TelegramUserEntity extends myBaseEntity {
  @Index({ unique: true })
  @Column({ name: 'telegram_chat_id', type: 'bigint' })
  telegramChatId: number;

  @Column({ name: 'phone', nullable: true, length: 15 })
  phone?: string;

  @Column({ name: 'goldex_user_id', nullable: true })
  goldexUserId?: string;

  @Column({ name: 'access_token', nullable: true, type: 'text' })
  accessToken?: string;

  @Column({ name: 'refresh_token', nullable: true, type: 'text' })
  refreshToken?: string;

  @Column({
    name: 'state',
    type: 'varchar',
    length: 30,
    default: UserState.IDLE,
  })
  state: UserState;

  @Column({ name: 'first_name', nullable: true, length: 100 })
  firstName?: string;

  @Column({ name: 'last_name', nullable: true, length: 100 })
  lastName?: string;

  @Column({ name: 'username', nullable: true, length: 100 })
  username?: string;

  @Column({ name: 'last_activity_at', type: 'timestamptz', nullable: true })
  lastActivityAt?: Date;

  @Column({ name: 'is_channel_admin', type: 'boolean', default: false })
  isChannelAdmin: boolean;

  @Column({ name: 'role', type: 'integer', nullable: true })
  role?: number;

  @Column({ name: 'metadata', type: 'jsonb', nullable: true })
  metadata?: Record<string, any>;
}
