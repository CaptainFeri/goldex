import { PartialType } from "@nestjs/mapped-types";
import { CreateSymbolDto } from "./create-symbol.dto";

export class UpdateSymbolDto extends PartialType(CreateSymbolDto) {}
