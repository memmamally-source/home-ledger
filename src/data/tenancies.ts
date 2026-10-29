import { collection, collectionGroup, deleteField, doc, query, serverTimestamp, where, writeBatch } from 'firebase/firestore';
import type { Tenancy } from '@/domain/tenancy';
import { getDb } from '@/lib/firebase';
import { useLiveDoc, useLiveQuery } from '@/lib/live';
import { addAudit, clean, type Actor } from './common';

export function mapTenancy(id: string, d: Record<string, unknown>): Tenancy {
  const t = d as unknown as Tenancy;
  return { ...t, id, adjustments: t.adjustments ?? [], additionalCharges: t.additionalCharges ?? [], partyIds: t.partyIds ?? [] };
}

/** The team sees every tenancy; a tenant sees only those they are a party to. */
export function useTenancies(pid: string | undefined, uid: string | undefined, isTeam: boolean) {
  return useLiveQuery(
    pid && uid ? `ten:${pid}:${isTeam ? 'all' : uid}` : null,
    () => {
      const c = collection(getDb(), `properties/${pid}/tenancies`);
      return isTeam ? c : query(c, where('partyIds', 'array-contains', uid));
    },
    mapTenancy,
  );
}

export function useTenancy(pid: string | undefined, tid: string | undefined) {
  return useLiveDoc(pid && tid ? `ten:${pid}:${tid}` : null, () => doc(getDb(), `properties/${pid}/tenancies/${tid}`), mapTenancy);
}

/** Tenancies on other people's records that this account is a linked party to. */
export function useMyLinkedTenancies(uid: string | undefined) {
  return useLiveQuery(uid ? `myten:${uid}` : null, () => query(collectionGroup(getDb(), 'tenancies'), where('partyIds', 'array-contains', uid)), mapTenancy);
}

export type TenancyInput = Omit<Tenancy, 'id' | 'propertyId' | 'partyIds' | 'createdBy' | 'createdAt' | 'updatedAt' | 'adjustments'>;

const OPTIONAL_KEYS = ['endDate', 'tenantEmail', 'landlordName', 'depositAmount', 'depositPaidDate', 'depositTerms', 'depositHeldBy', 'parking', 'managingAgent', 'notes'] as const;

export async function saveTenancy(pid: string, tid: string | null, input: TenancyInput, actor: Actor): Promise<string> {
  const db = getDb();
  const ref = tid ? doc(db, `properties/${pid}/tenancies/${tid}`) : doc(collection(db, `properties/${pid}/tenancies`));
  const b = writeBatch(db);
  if (tid) {
    const patch: Record<string, unknown> = { ...input, updatedAt: serverTimestamp() };
    for (const k of OPTIONAL_KEYS) if (input[k] === undefined || input[k] === '') patch[k] = deleteField();
    b.update(ref, clean(patch));
  } else {
    b.set(ref, clean({ ...input, propertyId: pid, partyIds: [], adjustments: [], createdBy: actor.uid, createdAt: serverTimestamp(), updatedAt: serverTimestamp() }));
  }
  addAudit(b, pid, actor, {
    action: tid ? 'tenancy.updated' : 'tenancy.created',
    kind: tid ? 'edit' : 'create',
    target: { type: 'tenancy', id: ref.id },
    summary: `${actor.name} ${tid ? 'updated' : 'added'} the tenancy for ${input.tenantName}`,
  });
  await b.commit();
  return ref.id;
}
