import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from "@nestjs/common";
import { Observable, tap } from "rxjs";
import { ApiKeyService } from "./api-key.service";

/**
 * Records one hour-bucket counter per API-key request.
 *
 * Only fires when the request actually carried a key — admin panel traffic is
 * not API traffic, and folding it in would make the API dashboard describe
 * something other than what it claims to.
 */
@Injectable()
export class ApiKeyUsageInterceptor implements NestInterceptor {
  constructor(private readonly keys: ApiKeyService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest();
    const apiKey = request?.apiKey;
    if (!apiKey?.id) return next.handle();

    const started = Date.now();
    const write = (isError: boolean) => {
      // Never let telemetry break the response it is measuring.
      void this.keys
        .record(apiKey.id, Date.now() - started, isError)
        .catch(() => undefined);
    };

    return next.handle().pipe(
      tap({
        next: () => write(false),
        error: () => write(true),
      }),
    );
  }
}
