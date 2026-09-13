/**
 * When a credit request held for admin sign-off runs out of time, from the TTL
 * snapshotted on it at request time. Null when the level set no deadline, so the
 * request waits indefinitely.
 *
 * Derived in one place because the cron that enforces it and both panels that
 * count down to it must agree on the same instant.
 */
export function pendingApprovalDeadline(credit: {
  createAt?: Date | string | null;
  metadata?: { approvalTtlHours?: number | null } | null;
}): Date | null {
  const ttlHours = Number(credit.metadata?.approvalTtlHours) || 0;
  if (!(ttlHours > 0) || !credit.createAt) return null;
  const createdAt = new Date(credit.createAt).getTime();
  if (!Number.isFinite(createdAt)) return null;
  return new Date(createdAt + ttlHours * 60 * 60 * 1000);
}
