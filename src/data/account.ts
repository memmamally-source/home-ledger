import { collection, collectionGroup, doc, getDoc, getDocs, query, serverTimestamp, setDoc, where } from 'firebase/firestore';
import { TEAM_ROLES } from '@/domain/roles';
import { callFunction, getDb } from '@/lib/firebase';
import { toDate } from '@/lib/live';
import { mapProperty } from './properties';

function plain(v: unknown): unknown {
  const d = toDate(v);
  if (d && typeof v === 'object' && v !== null && 'toDate' in v) return d.toISOString();
  if (Array.isArray(v)) return v.map(plain);
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, plain(x)]));
  return v;
}

/**
 * Everything this account can read, as JSON: profile, properties, private details (team only),
 * tenancies, inspections with evidence records and signatures. Photo files are listed by path and
 * hash; they can be downloaded from each inspection.
 */
export async function exportMyData(uid: string): Promise<Blob> {
  const db = getDb();
  const profile = (await getDoc(doc(db, `users/${uid}`))).data();
  const props = (await getDocs(query(collection(db, 'properties'), where('memberIds', 'array-contains', uid)))).docs.map((d) => mapProperty(d.id, d.data()));
  const properties = [];
  for (const p of props) {
    const team = p.ownerUid === uid || TEAM_ROLES.includes(p.members[uid]?.role ?? 'tenant');
    const priv = team ? (await getDoc(doc(db, `properties/${p.id}/private/details`)).catch(() => null))?.data() : undefined;
    const tq = team ? collection(db, `properties/${p.id}/tenancies`) : query(collection(db, `properties/${p.id}/tenancies`), where('partyIds', 'array-contains', uid));
    const tenancies = (await getDocs(tq)).docs.map((d) => ({ id: d.id, ...d.data() }));
    properties.push({ ...p, privateDetails: priv, tenancies });
  }
  const inspDocs = (await getDocs(query(collectionGroup(db, 'inspections'), where('participantIds', 'array-contains', uid)))).docs;
  const inspections = [];
  for (const d of inspDocs) {
    const evidence = (await getDocs(collection(d.ref, 'evidence'))).docs.map((e) => e.data());
    const signatures = (await getDocs(collection(d.ref, 'signatures'))).docs.map((s) => s.data());
    inspections.push({ id: d.id, ...d.data(), evidence, signatures });
  }
  const out = { exportedAt: new Date().toISOString(), format: 'homeledger-export-v1', profile, properties, inspections };
  return new Blob([JSON.stringify(plain(out), null, 2)], { type: 'application/json' });
}

export async function requestDeletion(uid: string, reason: string) {
  await setDoc(doc(getDb(), `deletionRequests/${uid}`), { status: 'requested', reason: reason.slice(0, 1000), requestedAt: serverTimestamp() });
}

export async function getDeletionRequest(uid: string) {
  const s = await getDoc(doc(getDb(), `deletionRequests/${uid}`));
  return s.exists() ? s.data() : null;
}

export type DeleteOutcome = 'deleted' | 'service-unavailable';

/**
 * Deletes the account and data on the server (see functions/src/deleteAccount.ts for the policy). The caller must
 * have signed in within the last 15 minutes. If the server function isn't deployed yet, the request is recorded
 * instead and the person is told so.
 */
export async function deleteMyAccount(uid: string, reason: string): Promise<DeleteOutcome> {
  try {
    await callFunction('deleteAccount');
    return 'deleted';
  } catch (e) {
    const code = typeof e === 'object' && e && 'code' in e ? String((e as { code: unknown }).code) : '';
    if (code === 'functions/failed-precondition') throw Object.assign(new Error('requires-recent-login'), { code: 'auth/requires-recent-login' });
    if (['functions/not-found', 'functions/unavailable', 'functions/internal'].includes(code)) {
      await requestDeletion(uid, reason);
      return 'service-unavailable';
    }
    throw e;
  }
}
