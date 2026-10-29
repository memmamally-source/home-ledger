import { collection, doc, getDoc, query, serverTimestamp, Timestamp, where, writeBatch, arrayUnion, orderBy } from 'firebase/firestore';
import { inviteExpiry, normaliseEmail, type Invitation } from '@/domain/invitation';
import { newToken } from '@/domain/ids';
import { ROLE_LABELS, type PropertyRole } from '@/domain/roles';
import type { Property } from '@/domain/property';
import { getDb } from '@/lib/firebase';
import { useLiveQuery } from '@/lib/live';
import { addAudit, clean, type Actor } from './common';

function mapInvite(id: string, d: Record<string, unknown>): Invitation {
  return { ...(d as unknown as Invitation), id };
}

export function usePropertyInvitations(pid: string | undefined, uid: string | undefined) {
  return useLiveQuery(
    pid && uid ? `inv:${pid}:${uid}` : null,
    () => query(collection(getDb(), 'invitations'), where('invitedBy', '==', uid), where('propertyId', '==', pid), orderBy('createdAt', 'desc')),
    mapInvite,
  );
}

export async function createInvitation(p: Property, input: { role: PropertyRole; email?: string; tenancyId?: string; message?: string }, actor: Actor): Promise<string> {
  const db = getDb();
  const token = newToken();
  const b = writeBatch(db);
  b.set(
    doc(db, `invitations/${token}`),
    clean({
      id: token,
      propertyId: p.id,
      propertyName: p.name,
      tenancyId: input.tenancyId || undefined,
      role: input.role,
      email: input.email ? normaliseEmail(input.email) : undefined,
      message: input.message?.trim() || undefined,
      invitedBy: actor.uid,
      invitedByName: actor.name,
      status: 'pending',
      createdAt: serverTimestamp(),
      expiresAt: Timestamp.fromDate(inviteExpiry()),
    }),
  );
  addAudit(b, p.id, actor, {
    action: 'invitation.created',
    kind: 'access',
    target: { type: 'invitation', id: token.slice(0, 6) },
    summary: `${actor.name} created an invitation for a ${ROLE_LABELS[input.role].toLowerCase()}${input.email ? ` (${normaliseEmail(input.email)})` : ''}`,
  });
  await b.commit();
  return token;
}

export async function revokeInvitation(inv: Invitation, actor: Actor) {
  const db = getDb();
  const b = writeBatch(db);
  b.update(doc(db, `invitations/${inv.id}`), { status: 'revoked', revokedAt: serverTimestamp() });
  addAudit(b, inv.propertyId, actor, { action: 'invitation.revoked', kind: 'access', target: { type: 'invitation', id: inv.id.slice(0, 6) }, summary: `${actor.name} cancelled an invitation` });
  await b.commit();
}

export async function getInvitation(token: string): Promise<Invitation | null> {
  const snap = await getDoc(doc(getDb(), `invitations/${token}`));
  return snap.exists() ? mapInvite(snap.id, snap.data()) : null;
}

/**
 * Accepting is one atomic batch, checked by the security rules: the person adds themselves to the
 * property with exactly the invited role, joins the tenancy if the invitation names one, and marks the
 * invitation used. Nothing of theirs is merged into the inviter's records.
 */
export async function acceptInvitation(inv: Invitation, actor: Actor & { email?: string }) {
  const db = getDb();
  const b = writeBatch(db);
  b.update(doc(db, `properties/${inv.propertyId}`), {
    memberIds: arrayUnion(actor.uid),
    [`members.${actor.uid}`]: clean({ role: inv.role, displayName: actor.name.slice(0, 100), email: actor.email, joinedAt: serverTimestamp(), inviteId: inv.id }),
    updatedAt: serverTimestamp(),
  });
  if (inv.tenancyId) b.update(doc(db, `properties/${inv.propertyId}/tenancies/${inv.tenancyId}`), { partyIds: arrayUnion(actor.uid), updatedAt: serverTimestamp() });
  b.update(doc(db, `invitations/${inv.id}`), { status: 'accepted', acceptedBy: actor.uid, acceptedAt: serverTimestamp() });
  await b.commit();
  // Recorded after joining, because only members can write audit events.
  const a = writeBatch(db);
  addAudit(a, inv.propertyId, actor, { action: 'invitation.accepted', kind: 'access', target: { type: 'member', id: actor.uid }, summary: `${actor.name} accepted an invitation as ${ROLE_LABELS[inv.role].toLowerCase()}` });
  await a.commit().catch(() => undefined);
}
