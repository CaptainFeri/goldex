import { Column, Entity, Index, JoinColumn, ManyToOne } from "typeorm";
import { myBaseEntity } from "../../shared/entity/base.entity";
import { ArbitrageBotEntity } from "./arbitrage-bot.entity";
import {
  ArbitrageBotEventSeverityEnum,
  ArbitrageBotEventTypeEnum,
} from "../enum/arbitrage-bot.enums";

/**
 * A bot's own log: what it saw, what it did, and what it told its owner.
 *
 * Every event is recorded whether or not it was notified, so "the bot did
 * nothing" and "the bot did something and the alert never arrived" are
 * distinguishable after the fact.
 */
@Entity("arbitrage_bot_event")
@Index(["botId", "createAt"])
export class ArbitrageBotEventEntity extends myBaseEntity {
  @Column({ name: "bot_id", type: "uuid" })
  botId: string;

  @ManyToOne(() => ArbitrageBotEntity, { onDelete: "CASCADE" })
  @JoinColumn({ name: "bot_id" })
  bot: ArbitrageBotEntity;

  @Column({ type: "varchar", length: 30 })
  type: ArbitrageBotEventTypeEnum;

  @Column({
    type: "varchar",
    length: 10,
    default: ArbitrageBotEventSeverityEnum.INFO,
  })
  severity: ArbitrageBotEventSeverityEnum;

  @Column({ length: 200 })
  title: string;

  @Column({ type: "text" })
  message: string;

  @Column({ type: "jsonb", nullable: true })
  metadata: Record<string, any> | null;

  /** Channels the alert actually went out on; empty when it was not notified. */
  @Column({ name: "notified_channels", type: "jsonb", default: () => "'[]'::jsonb" })
  notifiedChannels: string[];

  @Column({ name: "trade_id", type: "uuid", nullable: true })
  tradeId: string | null;
}
