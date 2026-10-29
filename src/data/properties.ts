import { collection, doc, query, serverTimestamp, where, writeBatch, deleteField } from 'firebase/firestore';
import { getMarket } from '@/config/markets';
import type { Property, PropertyMember, PropertyPrivateDetails } from '@/domain/property';
import { capabilitiesFor, type Capabilities, type PropertyRole, type RecordKind } from '@/domain/roles';
import { getDb } from '@/lib/firebase';
import { useLiveDoc, useLiveQuery } from '@/lib/live';
import { addAudit, clean, type Actor } from './common';

export function mapProperty(id: string, d: Record<string, unknown>): Property {
  return { ...(d as unknown as Property), id, members: (d.members as Record<string, PropertyMember>) ?? {}, memberIds: (d.memberIds as string[]) ?? [] };
}

export function useMyProperties(uid: string | null) {
  return useLiveQuery(uid ? `props:${uid}` : null, () => query(collection(getDb(), 'properties'), where('memberIds', 'array-contains', uid)), mapProperty);
}

export function useProperty(pid: string | undefined) {
  return useLiveDoc(pid ? `prop:${pid}` : null, () => doc(getDb(), `properties/${pid}`), mapProperty);
}

export function usePrivateDetails(pid: string | undefined, allowed: boolean) {
  return useLiveDoc(pid && allowed ? `private:${pid}` : null, () => doc(getDb(), `properties/${pid}/private/details`), (_id, d) => d as PropertyPrivateDetails);
}

export function myRole(p: Property | null | undefined, uid: string | undefined): PropertyRole | undefined {
  return p && uid ? p.members[uid]?.role : undefined;
}

export function capsFor(p: Property | null | undefined, uid: string | undefined): Capabilities {
  return capabilitiesFor(myRole(p, uid), Boolean(p && uid && p.ownerUid === uid));
}

export type PropertyInput = Pick<Property, 'name' | 'type' | 'address' | 'unitNumber' | 'buildingName' | 'portfolio' | 'notes'>;

export async function createProperty(input: PropertyInput, kind: RecordKind, actor: Actor & { email?: string }, marketId: string, privateDetails?: PropertyPrivateDetails): Promise<string> {
  const db = getDb();
  const ref = doc(collection(db, 'properties'));
  const market = getMarket(marketId);
  const b = writeBatch(db);
  b.set(
    ref,
    clean({
      ...input,
      recordKind: kind,
      marketId: market.id,
      currency: market.currency,
      ownerUid: actor.uid,
      memberIds: [actor.uid],
      members: { [actor.uid]: clean({ role: kind === 'landlord' ? 'owner' : 'tenant', displayName: actor.name, email: actor.email }) },
      archived: false,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    }),
  );
  if (privateDetails && Object.keys(clean(privateDetails)).length > 0)
    b.set(doc(db, `properties/${ref.id}/private/details`), clean({ ...privateDetails, updatedAt: serverTimestamp(), updatedBy: actor.uid }));
  addAudit(b, ref.id, actor, { action: 'property.created', kind: 'create', target: { type: 'property', id: ref.id }, summary: `${actor.name} added ${input.name}` });
  await b.commit();
  return ref.id;
}

export async function updateProperty(pid: string, input: PropertyInput, actor: Actor) {
  const db = getDb();
  const b = writeBatch(db);
  // Optional fields cleared in the form are removed rather than stored as empty strings.
  const patch: Record<string, unknown> = { ...input, updatedAt: serverTimestamp() };
  for (const k of ['unitNumber', 'buildingName', 'portfolio', 'notes'] as const) if (!input[k]) patch[k] = deleteField();
  b.update(doc(db, `properties/${pid}`), clean(patch));
  addAudit(b, pid, actor, { action: 'property.updated', kind: 'edit', target: { type: 'property', id: pid }, summary: `${actor.name} updated the property details` });
  await b.commit();
}

export async function savePrivateDetails(pid: string, details: PropertyPrivateDetails, actor: Actor) {
  const db = getDb();
  const b = writeBatch(db);
  b.set(doc(db, `properties/${pid}/private/details`), clean({ ...details, updatedAt: serverTimestamp(), updatedBy: actor.uid }));
  // The audit summary never includes figures: audit events can be read by the whole team.
  addAudit(b, pid, actor, { action: 'property.private_updated', kind: 'edit', target: { type: 'property', id: pid }, summary: `${actor.name} updated ownership and finance details` });
  await b.commit();
}

export async function setArchived(pid: string, archived: boolean, actor: Actor) {
  const db = getDb();
  const b = writeBatch(db);
  b.update(doc(db, `properties/${pid}`), { archived, updatedAt: serverTimestamp() });
  addAudit(b, pid, actor, { action: 'property.archived', kind: 'edit', target: { type: 'property', id: pid }, summary: `${actor.name} ${archived ? 'archived' : 'restored'} the property` });
  await b.commit();
}

export async function removeMember(p: Property, memberUid: string, actor: Actor) {
  const db = getDb();
  const b = writeBatch(db);
  const name = p.members[memberUid]?.displayName ?? 'A member';
  addAudit(b, p.id, actor, { action: 'member.removed', kind: 'access', target: { type: 'member', id: memberUid }, summary: `${actor.name} removed ${name}` });
  b.update(doc(db, `properties/${p.id}`), { memberIds: p.memberIds.filter((m) => m !== memberUid), [`members.${memberUid}`]: deleteField(), updatedAt: serverTimestamp() });
  await b.commit();
}

export async function leaveProperty(p: Property, actor: Actor) {
  const db = getDb();
  const b = writeBatch(db);
  addAudit(b, p.id, actor, { action: 'member.left', kind: 'access', target: { type: 'member', id: actor.uid }, summary: `${actor.name} left the property` });
  b.update(doc(db, `properties/${p.id}`), { memberIds: p.memberIds.filter((m) => m !== actor.uid), [`members.${actor.uid}`]: deleteField(), updatedAt: serverTimestamp() });
  await b.commit();
}
