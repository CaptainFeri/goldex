import { Body, Controller, Get, Post, Query } from "@nestjs/common";
import { KycService } from "../services/kyc.service";
import { MobileMatchDto } from "../dto/mobile-match.dto";
import { BankAccountDto } from "../dto/bank-account.dto";

@Controller("kyc")
export class KycController {
  constructor(private readonly kycService: KycService) {}

  @Post("mobile-match")
  async mobileMatch(@Body() dto: MobileMatchDto) {
    return {
      data: await this.kycService.matchMobile(dto.nationalId, dto.mobile),
    };
  }

  @Post("bank-account")
  async verifyBankAccount(@Body() dto: BankAccountDto) {
    // return {
    //   data: await this.kycService.verifyBankAccount(
    //     dto.bank,
    //     dto.depositNumber,
    //     dto.nationalId,
    //     dto.birthDate,
    //     dto.iban
    //   ),
    // };
  }

  @Get("iban")
  async iban(@Query("iban") iban: string) {
    return { data: await this.kycService.getIbanInfo(iban) };
  }

  @Get("card")
  async card(@Query("number") number: string) {
    return { data: await this.kycService.getCardInfo(number) };
  }
}
