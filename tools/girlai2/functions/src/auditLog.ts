import * as admin from 'firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';
import * as functions from 'firebase-functions';
import { createHash } from 'crypto';

export type AuditAction =
  | 'account.delete'
  | 'account.delete_partial'
  | 'account.export'
  | 'onboarding.age_attested'
  | 'onboarding.disclaimer_acknowledged'
  | 'subscription.activated'
  | 'subscription.renewed'
  | 'subscription.cancelled'
  | 'subscription.expired'
  | 'subscription.refunded'
  | 'memory.user_delete'
  | 'security.webhook_misconfigured'
  | 'security.unauthorized_webhook'
  | 'crisis.detected'
  | 'harm.reported'
  | 'persona.event';

export type AuditOutcome = 'success' | 'failure' | 'partial';

interface AuditEntry {
  uid: string;
  action: AuditAction;
  outcome: AuditOutcome;
  ts: FieldValue;
  ipHash?: string;
  detail?: Record<string, unknown>;
}

function hashIp(ip: string | undefined): string | undefined {
  if (!ip) return undefined;
  return createHash('sha256').update(ip).digest('hex').slice(0, 16);
}

/**
 * Append a sensitive-action audit entry. Best-effort: a failed write is
 * logged but never throws into the caller — audit logging must not break
 * the user-facing action that triggered it.
 *
 * Retention: governed by Firestore TTL policy on the `ts` field
 * (configure to 365 days via gcloud firestore fields ttl).
 */
export async function writeAuditLog(args: {
  uid: string;
  action: AuditAction;
  outcome: AuditOutcome;
  ip?: string;
  detail?: Record<string, unknown>;
}): Promise<void> {
  const entry: AuditEntry = {
    uid: args.uid,
    action: args.action,
    outcome: args.outcome,
    ts: FieldValue.serverTimestamp(),
    ipHash: hashIp(args.ip),
    detail: args.detail,
  };
  try {
    await admin.firestore().collection('audit_log').add(entry);
  } catch (err: any) {
    functions.logger.error('auditLog: write failed', {
      action: args.action,
      uid: args.uid,
      error: err?.message,
    });
  }
}
