import { ApiProperty } from "@nestjs/swagger";

export class OtpScopeRefSourceDto {
  @ApiProperty({ enum: ["param", "body"] }) source: string;
  @ApiProperty() key: string;
}

export class OtpScopeCatalogDto {
  @ApiProperty() scope: string;
  @ApiProperty() label: string;
  @ApiProperty({ type: [String], description: "Hashed into the challenge, in this order." })
  fields: string[];
  @ApiProperty() bulk: boolean;
  @ApiProperty({ type: OtpScopeRefSourceDto, nullable: true })
  refIdFrom: OtpScopeRefSourceDto | null;
}
