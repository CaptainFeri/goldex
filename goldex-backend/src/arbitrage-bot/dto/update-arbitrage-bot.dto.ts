import { PartialType, OmitType } from "@nestjs/swagger";
import { CreateArbitrageBotDto } from "./create-arbitrage-bot.dto";

/**
 * Capital is not editable here: changing an allocation moves frozen money, so
 * it goes through the explicit allocate/release routes where it can be
 * recorded on the manager account's ledger.
 */
export class UpdateArbitrageBotDto extends PartialType(
  OmitType(CreateArbitrageBotDto, ["allocatedAmount", "symbolId"] as const)
) {}
