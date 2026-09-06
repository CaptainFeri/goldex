import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { IsEnum, IsInt, IsOptional, Max, Min } from "class-validator";
import { DashboardMetric, DashboardSeverity } from "../dashboard.enums";

export class DashboardMetricQueryDto {
  @ApiProperty({ enum: DashboardMetric, example: DashboardMetric.VOLUME })
  @IsEnum(DashboardMetric)
  metric: DashboardMetric;
}

export class DashboardSeriesQueryDto extends DashboardMetricQueryDto {
  @ApiPropertyOptional({
    example: 1405,
    description: "Jalali year. Defaults to the current one.",
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1300)
  @Max(1500)
  year?: number;
}

export class DashboardListQueryDto extends DashboardMetricQueryDto {
  @ApiPropertyOptional({ example: 5, description: "Rows to return, 1–50" })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number;
}

/** One of the four cards. */
export class DashboardKpiDto {
  @ApiProperty({ enum: DashboardMetric })
  metric: DashboardMetric;

  @ApiProperty({ example: "حجم معاملات" })
  label: string;

  @ApiProperty({
    example: "2480.5",
    description: "Decimal string. In `unit`'s own terms — never converted by the API.",
  })
  value: string;

  @ApiPropertyOptional({
    nullable: true,
    example: "XAU",
    description:
      "The symbol `value` is denominated in, where it is money or a weight. Null for a count. " +
      "Format by it; a rial value is shown as toman by the panel, not by the API.",
  })
  unit?: string | null;

  @ApiPropertyOptional({
    nullable: true,
    example: 12.4,
    description:
      "Percent change against the previous period of equal length. Null when the previous " +
      "period was empty — a rise from nothing is not a percentage.",
  })
  deltaPercent?: number | null;

  @ApiProperty({ example: "30 روز گذشته", description: "The card's sub-line" })
  sub: string;

  @ApiPropertyOptional({
    nullable: true,
    example: "21000000000.00",
    description:
      "A figure belonging to the sub-line, kept separate from `sub` so the client formats it. " +
      "The API must not bake an amount into prose: a rial number inside a sentence cannot be " +
      "converted to toman by the panel, and would be the one unformatted amount on the page.",
  })
  subValue?: string | null;

  @ApiPropertyOptional({ nullable: true, example: "IRR", description: "Unit of `subValue`" })
  subUnit?: string | null;
}

export class DashboardKpisDto {
  @ApiProperty({ type: [DashboardKpiDto], description: "All four cards, in display order" })
  cards: DashboardKpiDto[];

  @ApiProperty({ example: "2026-09-05T09:12:00.000Z" })
  generatedAt: string;
}

/** One Jalali month of the series. */
export class DashboardSeriesPointDto {
  @ApiProperty({ example: 1, description: "Jalali month, 1–12" })
  month: number;

  @ApiProperty({ example: "فرو", description: "Short Jalali month name" })
  label: string;

  @ApiProperty({ example: "1204.50", description: "Decimal string" })
  primary: string;

  @ApiProperty({ example: "980.25", description: "Decimal string" })
  secondary: string;
}

export class DashboardSeriesDto {
  @ApiProperty({ example: 1405, description: "The Jalali year covered" })
  year: number;

  @ApiProperty({ example: "خرید", description: "What `primary` counts" })
  primaryLabel: string;

  @ApiProperty({ example: "فروش", description: "What `secondary` counts" })
  secondaryLabel: string;

  @ApiPropertyOptional({ nullable: true, example: "XAU", description: "Unit of both series" })
  unit?: string | null;

  @ApiProperty({
    type: [DashboardSeriesPointDto],
    description: "Always twelve, in Jalali month order. Months with no data are zero, not absent.",
  })
  points: DashboardSeriesPointDto[];
}

export class DashboardSliceDto {
  @ApiProperty({ example: "خرید" })
  label: string;

  @ApiProperty({ example: "1204.50", description: "Raw magnitude, decimal string" })
  value: string;

  @ApiProperty({ example: 54.2, description: "Share of the whole, 0–100" })
  percent: number;
}

export class DashboardDistributionDto {
  @ApiProperty({ example: "سهم پروایدرها" })
  title: string;

  @ApiProperty({ type: [DashboardSliceDto], description: "Largest first" })
  slices: DashboardSliceDto[];
}

export class DashboardActivityItemDto {
  @ApiProperty({ format: "uuid" })
  id: string;

  @ApiProperty({ example: "سفارش خرید ثبت شد" })
  title: string;

  @ApiProperty({ example: "علی رضایی — ۲٫۵ گرم XAU" })
  description: string;

  @ApiProperty({ enum: DashboardSeverity })
  severity: DashboardSeverity;

  @ApiProperty({ example: "2026-09-05T09:12:00.000Z" })
  at: Date;
}

export class DashboardHealthRowDto {
  @ApiProperty({ example: "تکمیل‌شده" })
  label: string;

  @ApiProperty({ example: 92.4, description: "0–100" })
  percent: number;

  @ApiProperty({ enum: DashboardSeverity })
  variant: DashboardSeverity;

  @ApiProperty({ example: 231, description: "Rows behind the percentage" })
  count: number;
}

export class DashboardHealthDto {
  @ApiProperty({ example: "سلامت موتور معاملات" })
  title: string;

  @ApiProperty({
    example: 30,
    description: "Days the composition is measured over, so the client can say so",
  })
  windowDays: number;

  @ApiProperty({ type: [DashboardHealthRowDto] })
  rows: DashboardHealthRowDto[];
}

/**
 * A row of the metric-shaped table.
 *
 * Deliberately generic: the four metrics have four different tables, and typing
 * each one separately would put four shapes on the wire for one component to
 * switch over. `columns` names the headers in order and each row carries
 * `cells` in the same order, so the client renders without knowing the metric.
 */
export class DashboardRecentRowDto {
  @ApiProperty({ example: "9f1c…", description: "Row identity, for keying and linking" })
  id: string;

  @ApiProperty({ type: [String], example: ["9f1c", "علی رضایی", "خرید", "XAU/IRR", "1250000000.00"] })
  cells: string[];

  @ApiPropertyOptional({
    nullable: true,
    example: "COMPLETED",
    description: "Raw status where the row has one, so the client can badge it",
  })
  status?: string | null;
}

/**
 * What a column holds, so the client can format it.
 *
 * `cells` are strings by design — one table serves four metrics — but a client
 * that cannot tell a rial amount from an order code renders raw digits where
 * the rest of the panel shows toman. This says which is which, by position.
 */
export enum DashboardColumnKind {
  TEXT = "text",
  /** Money in the table's `unit`; the panel converts rial to toman. */
  MONEY = "money",
  /** An amount in its own symbol's units — gold grams, not money. */
  QUANTITY = "quantity",
  /** An ISO instant, to be shown in the panel's calendar. */
  DATE = "date",
}

export class DashboardRecentDto {
  @ApiProperty({ example: "آخرین تراکنش‌ها" })
  title: string;

  @ApiProperty({ type: [String], example: ["شناسه", "کاربر", "نوع", "جفت‌ارز", "ارزش"] })
  columns: string[];

  @ApiProperty({
    enum: DashboardColumnKind,
    isArray: true,
    description: "One per column, in the same order",
    example: ["text", "text", "text", "text", "quantity", "money"],
  })
  columnKinds: DashboardColumnKind[];

  @ApiProperty({ type: [DashboardRecentRowDto] })
  rows: DashboardRecentRowDto[];

  @ApiPropertyOptional({
    nullable: true,
    example: "IRR",
    description: "Symbol for the money column, where the table has one",
  })
  unit?: string | null;
}
