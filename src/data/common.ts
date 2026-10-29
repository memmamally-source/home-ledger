import { collection, doc, serverTimestamp, type WriteBatch } from 'firebase/firestore';
import type { AuditAction, AuditEvent, AuditKind } from '@/domain/audit';
import { getDb } from '@/lib/firebase';

export interface Actor {
  uid: string;
  name: string;
}

/** Adds an append-only audit event to a batch. Pass `id` for events the security rules require. */
export function addAudit(
  b: WriteBatch,
  propertyId: string,
  actor: Actor,
  e: { action: AuditAction; kind: AuditKind; target: AuditEvent['target']; summary: string; details?: AuditEvent['details'] },
  id?: string,
) {
  const ref = id ? doc(getDb(), `properties/${propertyId}/audit/${id}`) : doc(collection(getDb(), `properties/${propertyId}/audit`));
  const data: Record<string, unknown> = { ...e, actorUid: actor.uid, actorName: actor.name, at: serverTimestamp() };
  if (!e.details) delete data.details;
  b.set(ref, data);
}

/** Firestore rejects `undefined`; drop those keys (recursively for plain objects). */
export function clean<T>(value: T): T {
  if (Array.isArray(value)) return value.map(clean) as T;
  if (value && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) if (v !== undefined) out[k] = clean(v);
    return out as T;
  }
  return value;
}
