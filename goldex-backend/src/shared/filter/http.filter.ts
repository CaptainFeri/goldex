import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  InternalServerErrorException,
  Inject,
} from "@nestjs/common";
import { Response, Request } from "express";
import { I18nValidationException } from "nestjs-i18n";
import { TranslateHandler } from "../handler/translate.handler";
import { IResponse } from "../interface/response.interface";
import { WinstonLoggerService } from "../../logger/winston.logger";

@Catch(HttpException)
export class HttpExceptionFilter<T> extends TranslateHandler implements ExceptionFilter {
  constructor(
    @Inject(WinstonLoggerService)
    private readonly logger: WinstonLoggerService
  ) {
    super();
  }

  catch(exception: HttpException, host: ArgumentsHost) {
    this.setI18nContextFromArgumentHost(host);

    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();
    const { method, originalUrl: url, body } = request;

    const timestamp = new Date().toISOString();
    const statusCode = exception.getStatus();

    const result: IResponse = {
      status: statusCode,
      data: null,
      errors: {},
    };

    // Build response message
    if (exception instanceof I18nValidationException) {
      result.errors = this.makeErrorObject(exception.errors);
      result.message = this.getMessage("BAD_REQUEST");
    } else if (exception instanceof InternalServerErrorException) {
      result.message = exception.message;
    } else {
      const message = exception.getResponse()["message"];

      if (message?.includes?.("Cannot")) {
        result.message = message;
      } else if (typeof message === "string") {
        const translated = this.getMessage(message);
        result.message =
          translated && translated.startsWith("message.") ? message : translated;
      } else {
        result.message = this.getMessage(exception.getResponse()["error"]);
        result.errors = message;
      }
    }

    // Log the error
    const logPayload = {
      method,
      url,
      body,
      message: result.message,
      errors: result.errors,
      statusCode,
      timestamp,
    };

    if (statusCode >= 500) {
      this.logger.error(JSON.stringify(logPayload));
    } else {
      this.logger.warn(JSON.stringify(logPayload));
    }

    // Send response
    response.status(statusCode).json(result);
  }
}
