import { randomBytes, randomUUID } from 'node:crypto';

/** UUID v4. */
export function newUuid(): string {
  return randomUUID();
}

/** Short correlation ID for XFS requests: prefix + 10 hex chars. */
export function newRequestId(prefix = 'REQ'): string {
  return `${prefix}_${randomBytes(5).toString('hex').toUpperCase()}`;
}

/** Session ID: timestamp + random suffix. */
export function newSessionId(): string {
  return `SESS_${Date.now().toString(36).toUpperCase()}_${randomBytes(3).toString('hex').toUpperCase()}`;
}

/** 6-digit STAN (System Trace Audit Number) for ISO 8583. */
export function formatStan(n: number): string {
  return String(n % 1_000_000).padStart(6, '0');
}
