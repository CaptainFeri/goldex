import { SetMetadata } from "@nestjs/common";

export const AUDIT_SKIP = "admin-audit:skip";

/**
 * Leave this mutation out of the audit trail.
 *
 * Use sparingly and only where a record has no investigative value — a
 * high-frequency toggle, or an endpoint whose body is entirely secret. Never
 * on anything that moves money or changes access: the point of a global
 * interceptor is that coverage is not a matter of who remembered.
 */
export const SkipAudit = () => SetMetadata(AUDIT_SKIP, true);
