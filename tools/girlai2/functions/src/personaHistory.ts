import * as admin from 'firebase-admin';
import * as functions from 'firebase-functions';
import { writeAuditLog } from './auditLog';

/**
 * T1.L — Immutable persona event log.
 *
 * Round 9 finding: every winning AI-companion app (Nomi, Kindroid, etc.)
 * stores persona facts at the PLATFORM level. Aria is moving that direction
 * in Phase 4 (versioned Firestore docs replacing hardcoded persona prompt
 * content). Phase 0 ships the harness so that when Phase 4 lands, every
 * persona write naturally feeds the immutable history without retrofit.
 *
 * Schema: `persona_history/{scope}/events/{auto-id}`
 *   - scope = `aria-v1` for the canonical Aria persona (closed-beta)
 *   - scope = `users/{uid}` for per-user relationship attribute changes
 *
 * Why immutable: protects against the "Aria changed and I never agreed"
 * complaint pattern Round 9 found killing Replika 2.0. Future you can diff
 * any two events to explain exactly what changed and when.
 */

export type PersonaEventKind =
  | 'persona.created'
  | 'persona.updated'
  | 'persona.version_pinned'
  | 'persona.rolled_back'
  | 'relationship.attribute_changed'
  | 'relationship.stage_changed';

export interface PersonaEventInput {
  scope: string;             // e.g. 'aria-v1' or `users/${uid}`
  kind: PersonaEventKind;
  uid?: string;              // who triggered the change (admin OR end-user)
  actor?: 'system' | 'admin' | 'user';
  before?: unknown;          // snapshot of relevant fields before
  after?: unknown;           // snapshot after
  reason?: string;
  fieldsChanged?: string[];  // names of fields that diverge before→after
}

/**
 * Append an immutable event to persona_history. Best-effort: a failed
 * write logs but does not throw into the caller. Companion writeAuditLog
 * entry fires so it shows up in the cross-cutting audit stream too.
 */
export async function writePersonaEvent(input: PersonaEventInput): Promise<void> {
  const ref = admin
    .firestore()
    .collection('persona_history')
    .doc(input.scope)
    .collection('events');
  try {
    await ref.add({
      kind: input.kind,
      uid: input.uid ?? null,
      actor: input.actor ?? 'system',
      before: input.before ?? null,
      after: input.after ?? null,
      reason: input.reason ?? null,
      fieldsChanged: input.fieldsChanged ?? [],
      ts: admin.firestore.FieldValue.serverTimestamp(),
    });
  } catch (err: any) {
    functions.logger.error('personaHistory: write failed', {
      scope: input.scope,
      kind: input.kind,
      error: err?.message,
    });
    // Continue — never block the originating persona write because of audit.
  }

  // Surface in the cross-cutting audit log for unified triage.
  await writeAuditLog({
    uid: input.uid ?? 'system',
    action: 'persona.event',
    outcome: 'success',
    detail: {
      scope: input.scope,
      kind: input.kind,
      fieldsChanged: input.fieldsChanged ?? [],
    },
  });
}

/**
 * Helper: compute a shallow list of changed top-level fields between two
 * snapshots. Used by Phase 4 persona-write code to populate `fieldsChanged`
 * without each callsite having to handcode it.
 */
export function diffFields(
  before: Record<string, unknown> | null | undefined,
  after: Record<string, unknown> | null | undefined
): string[] {
  if (!before && !after) return [];
  if (!before) return Object.keys(after ?? {});
  if (!after) return Object.keys(before);
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  const changed: string[] = [];
  for (const k of keys) {
    const a = JSON.stringify(before[k]);
    const b = JSON.stringify(after[k]);
    if (a !== b) changed.push(k);
  }
  return changed;
}
