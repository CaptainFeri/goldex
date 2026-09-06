import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Transform } from "class-transformer";
import { IsBoolean, IsEnum, IsOptional } from "class-validator";
import { PaginationQueryDto } from "../../shared/dto/pagination-query.dto";
import { InboxCategory, InboxSeverity } from "../admin-inbox.enums";

export class InboxItemDto {
  @ApiProperty() id: string;
  @ApiProperty() event: string;
  @ApiProperty({ enum: InboxCategory }) category: InboxCategory;
  @ApiProperty({ enum: InboxSeverity }) severity: InboxSeverity;
  @ApiProperty() title: string;
  @ApiProperty() body: string;
  @ApiProperty({
    nullable: true,
    description: "Ids to link to, and amounts in rial for the client to format.",
  })
  metadata: Record<string, unknown> | null;
  @ApiProperty({ description: "Read by the calling admin, not by anyone." }) isRead: boolean;
  @ApiProperty({ nullable: true }) readAt: Date | null;
  @ApiProperty() createAt: Date;
}

/** Extends the shared pagination contract rather than redeclaring page/limit. */
export class InboxQueryDto extends PaginationQueryDto {
  @ApiPropertyOptional({ description: "Only items the caller has not read." })
  @IsOptional()
  // Query strings carry "true"/"false" as text; without this every present
  // value would be truthy and `unreadOnly=false` would filter anyway.
  @Transform(({ value }) => value === true || value === "true")
  @IsBoolean()
  unreadOnly?: boolean;

  @ApiPropertyOptional({ enum: InboxCategory })
  @IsOptional()
  @IsEnum(InboxCategory)
  category?: InboxCategory;

  @ApiPropertyOptional({ enum: InboxSeverity })
  @IsOptional()
  @IsEnum(InboxSeverity)
  severity?: InboxSeverity;
}

export class UnreadCountDto {
  @ApiProperty() unread: number;
}

export class InboxStatsDto {
  @ApiProperty({ description: "Unread and visible to the caller." }) unread: number;
  @ApiProperty({ description: "Unread and urgent." }) urgent: number;
  @ApiProperty({ description: "Arrived since midnight, read or not." }) today: number;
  @ApiProperty({
    description: "Whether the websocket feed is actually up, so the UI can say when it is only polling.",
  })
  realtimeEnabled: boolean;
  @ApiProperty({ description: "Operators currently connected to the feed." }) connectedAdmins: number;
}

export class MarkedReadDto {
  @ApiProperty({ description: "How many items this call newly marked as read." }) marked: number;
}
