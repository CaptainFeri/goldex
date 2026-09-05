// import { Injectable, NestInterceptor, ExecutionContext, CallHandler } from "@nestjs/common";
// import { map, Observable } from "rxjs";
// import { IResponse } from "../interface/response.interface";
// import { TranslateHandler } from "../handler/translate.handler";

// @Injectable()
// export class ResponseInterceptor extends TranslateHandler implements NestInterceptor {
//   intercept(context: ExecutionContext, next: CallHandler): Observable<IResponse> {
//     this.setI18nContextFromRequest(context);
//     return next.handle().pipe(
//       map(({ data, message, status }: IResponse) => ({
//         status: status ?? 200,
//         message: this.getMessage(message),
//         data: data ?? null,
//       }))
//     );
//   }
// }

import { CallHandler, ExecutionContext, HttpStatus, Injectable, NestInterceptor } from "@nestjs/common";
import { Observable, tap, map } from "rxjs";
import { IResponse } from "../interface/response.interface";
import { WinstonLoggerService } from "../../logger/winston.logger";
import { TranslateHandler } from "../handler/translate.handler";

@Injectable()
export class ResponseInterceptor extends TranslateHandler implements NestInterceptor {
  constructor(private readonly logger: WinstonLoggerService) {
    super();
  }

  intercept(context: ExecutionContext, next: CallHandler): Observable<IResponse> {
    const req = context.switchToHttp().getRequest();
    const { method, originalUrl: url, body, headers } = req;
    const now = Date.now();

    this.setI18nContextFromRequest(context);

    return next.handle().pipe(
      tap((responseData) => {
        const res = context.switchToHttp().getResponse();
        const { statusCode } = res;

        const logData = {
          method,
          url,
          body,
          response: responseData,
          statusCode,
          headers,
          duration: `${Date.now() - now}ms`,
        };

        const resLog = `<==P=A=R=S=Z=A=R=G=A=R==I=R==>
         - Method: ${method}
         - URL: ${url}
         - Status: ${statusCode}
         - Headers: ${JSON.stringify(headers)}
         - Body: ${JSON.stringify(body)}
         - Response: ${JSON.stringify(responseData)}
         - Duration: ${Date.now() - now}ms
        `;

        // will improve ...
        if ([HttpStatus.ACCEPTED, HttpStatus.CREATED].includes(statusCode)) {
          // this.logger.log(JSON.stringify(logData));
          this.logger.log(resLog);
        } else if ([HttpStatus.BAD_REQUEST, HttpStatus.FORBIDDEN].includes(statusCode)) {
          // this.logger.error(JSON.stringify(logData));
          this.logger.error(resLog);
        }
      }),
      map((responseData: IResponse | undefined) => {
        const res = context.switchToHttp().getResponse();
        if (res.statusCode === HttpStatus.NO_CONTENT) return;
        const { data, message, status } = responseData || {};
        return {
          status: status ?? res.statusCode ?? 200,
          message: this.getMessage(message),
          data: data ?? null,
        };
      })
    );
  }
}
