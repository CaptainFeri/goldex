import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { Observable, tap } from "rxjs";
import { REQUIRED_PERMISSIONS } from "../admin-role/guard/require-permissions.decorator";
import { AdminAuditService } from "./admin-audit.service";
import { describeRoute } from "./describe-route";
import { redactBody } from "./redact";
import { AUDIT_SKIP } from "./audit.decorators";

const MUTATIONS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/**
 * Records every admin mutation.
 *
 * Registered globally rather than per-controller: an audit trail with opt-in
 * coverage records exactly the routes someone remembered, which is not an audit
 * trail. Reads are skipped — they are the overwhelming majority of traffic and
 * the log is about what *changed*.
 *
 * Refusals are recorded too. "Who tried to approve this and was told no" is
 * usually the more interesting question.
 */
@Injectable()
export class AdminAuditInterceptor implements NestInterceptor {
  constructor(
    private readonly reflector: Reflector,
    private readonly audit: AdminAuditService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== "http") return next.handle();

    const http = context.switchToHttp();
    const request = http.getRequest();
    const method = String(request?.method ?? "").toUpperCase();

    if (!MUTATIONS.has(method)) return next.handle();
    if (this.reflector.get<boolean>(AUDIT_SKIP, context.getHandler())) return next.handle();

    const routePath: string | undefined = request?.route?.path ?? request?.originalUrl;
    // Only the admin surface. User-facing mutations have their own trails and
    // would swamp this one.
    if (!String(routePath ?? "").includes("/admin")) return next.handle();

    const started = Date.now();
    const { action, entity, entityId } = describeRoute(method, routePath, request?.params ?? {});
    const permissions = this.reflector.get<string[]>(REQUIRED_PERMISSIONS, context.getHandler());
    const body = request?.body ?? null;

    const write = (statusCode: number | null, errorMessage: string | null) => {
      const admin = request?.admin;
      void this.audit.record({
        adminId: admin?.id ?? null,
        // Denormalised: the log must still read correctly after the admin row
        // changes or goes away.
        adminLabel: admin?.fullName ?? admin?.phone ?? admin?.email ?? null,
        permission: permissions?.length ? permissions.join(",") : null,
        action,
        entity,
        entityId,
        // Populated only by handlers that called `captureBefore`.
        before: request?.auditBefore ?? null,
        after: redactBody(body),
        otpChallengeId: typeof body?.challengeId === "string" ? body.challengeId : null,
        statusCode,
        errorMessage,
        ip: request?.ip ?? null,
        userAgent: String(request?.headers?.["user-agent"] ?? "").slice(0, 400) || null,
        durationMs: Date.now() - started,
      });
    };

    return next.handle().pipe(
      tap({
        next: () => write(http.getResponse()?.statusCode ?? null, null),
        error: (e) => write(e?.status ?? e?.getStatus?.() ?? 500, e?.message ?? String(e)),
      }),
    );
  }
}
