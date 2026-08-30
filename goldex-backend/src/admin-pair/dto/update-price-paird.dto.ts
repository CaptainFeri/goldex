import { PartialType } from "@nestjs/mapped-types";
import { CreatePricePairDto } from "./create-pair.dto";

export class UpdatePricePairDto extends PartialType(CreatePricePairDto) {}
