import { Controller, Get, Param } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { ExampleService } from './example.service';

@Controller({ path: 'example', version: '1' })
@ApiTags('Test-Email')
export class ExampleController {
  constructor(private readonly exampleService: ExampleService) {}

  @Get('send/:email')
  async sendMail(@Param('email') email: string) {
    return { data: this.exampleService.sendWelcomeEmail(email) };
  }
}
