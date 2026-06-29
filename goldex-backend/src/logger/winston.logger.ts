import { Injectable, LoggerService } from "@nestjs/common";
import { Logger } from "winston";
import { winstonLoggerConfig } from "./winston.config";

@Injectable()
export class WinstonLoggerService implements LoggerService {
  private readonly logger: Logger;

  constructor() {
    this.logger = winstonLoggerConfig;
  }

  log(message: string) {
    this.logger.info(message);
  }

  error(message: string, trace?: string) {
    this.logger.error(`${message} - Trace: ${trace}`);
  }

  warn(message: string) {
    this.logger.warn(message);
  }

  debug(message: string) {
    this.logger.debug(message);
  }

  verbose(message: string) {
    this.logger.verbose(message);
  }
}
