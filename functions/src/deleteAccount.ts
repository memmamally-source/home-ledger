import type { Auth } from 'firebase-admin/auth';
import { FieldValue, type DocumentReference, type Firestore, type QueryDocumentSnapshot } from 'firebase-admin/firestore';

/**
 * Account deletion policy (POPIA-minded; review with a lawyer before launch):
 *  - The person's own records are deleted: profile, deletion request, invitations they sent, properties where they
 *    are the only member (with every inspection, photo, tenancy and audit event), and inspections only they can see.
 *  - Records shared with other people stay with those people: an inspection another participant took part in is kept
 *    (with its photos and signatures), and the deleted person is removed from its access lists. Their name stays on
 *    what they submitted, because it is part of the other party's record.
 *  - A property they own together with others passes to a co-owner when there is one. Without a co-owner the owner's
 *    property record is deleted, except inspections that other participants rely on.
 *  - Membership elsewhere is removed (including tenancy links), and finally the sign-in account is deleted.
 */

export interface StorageLike {
  deleteFiles(opts: { prefix: string }): Promise<unknown>;
}

export interface DeletionReport {
  propertiesDeleted: number;
  propertiesTransferred: number;
  propertiesLeft: number;
  inspectionsDeleted: number;
  inspectionsKeptForOthers: number;
  invitationsDeleted: number;
}

interface PropertyDoc {
  ownerUid: string;
  memberIds: string[];
  members: Record<string, { role: string }>;
}

const TEAM = ['owner', 'co_owner', 'manager', 'agent'];

export async function deleteAccountData(deps: { db: Firestore; storage: StorageLike | null; auth: Auth | null }, uid: string): Promise<DeletionReport> {
  const { db, storage } = deps;
  const report: DeletionReport = { propertiesDeleted: 0, propertiesTransferred: 0, propertiesLeft: 0, inspectionsDeleted: 0, inspectionsKeptForOthers: 0, invitationsDeleted: 0 };
  const handledInspections = new Set<string>();

  const deleteFilesUnder = async (prefix: string) => {
    if (storage) await storage.deleteFiles({ prefix }).catch(() => undefined);
  };

  /** Keeps an inspection for the other people on it, or deletes it when nobody else relies on it. */
  const settleInspection = async (snap: QueryDocumentSnapshot, othersStillHaveTeamAccess: boolean) => {
    handledInspections.add(snap.ref.path);
    const d = snap.data() as { participantIds?: string[]; teamVisible?: boolean; createdBy?: string };
    const otherParticipants = (d.participantIds ?? []).filter((p) => p !== uid);
    const keep = otherParticipants.length > 0 || (d.teamVisible === true && othersStillHaveTeamAccess);
    if (keep) {
      const patch: Record<string, unknown> = {
        participantIds: FieldValue.arrayRemove(uid),
        editorIds: FieldValue.arrayRemove(uid),
      };
      if (d.createdBy === uid) patch.authorAccountDeleted = true;
      await snap.ref.update(patch);
      report.inspectionsKeptForOthers++;
    } else {
      await db.recursiveDelete(snap.ref);
      await deleteFilesUnder(`${snap.ref.path}/`);
      report.inspectionsDeleted++;
    }
  };

  const properties = await db.collection('properties').where('memberIds', 'array-contains', uid).get();
  for (const prop of properties.docs) {
    const p = prop.data() as PropertyDoc;
    const others = p.memberIds.filter((m) => m !== uid);
    const inspections = await prop.ref.collection('inspections').get();

    if (p.ownerUid === uid && others.length === 0) {
      inspections.docs.forEach((i) => handledInspections.add(i.ref.path));
      report.inspectionsDeleted += inspections.size;
      await db.recursiveDelete(prop.ref);
      await deleteFilesUnder(`properties/${prop.id}/`);
      report.propertiesDeleted++;
      continue;
    }

    if (p.ownerUid === uid) {
      const coOwner = others.find((m) => p.members[m]?.role === 'co_owner');
      if (coOwner) {
        for (const i of inspections.docs) await settleInspection(i, true);
        await prop.ref.update({
          ownerUid: coOwner,
          [`members.${coOwner}.role`]: 'owner',
          memberIds: FieldValue.arrayRemove(uid),
          [`members.${uid}`]: FieldValue.delete(),
          updatedAt: FieldValue.serverTimestamp(),
        });
        await removeFromTenancies(prop.ref);
        report.propertiesTransferred++;
        continue;
      }
      // No co-owner: the owner's record goes, apart from inspections other participants rely on.
      for (const i of inspections.docs) await settleInspection(i, false);
      for (const sub of ['private', 'tenancies', 'audit']) {
        const docs = await prop.ref.collection(sub).listDocuments();
        for (const ref of docs) await db.recursiveDelete(ref);
      }
      const stillShared = (await prop.ref.collection('inspections').limit(1).get()).size > 0;
      if (stillShared) {
        // Keep a stub so kept inspections stay addressable; nobody is a member any more.
        await prop.ref.set({ ownerDeleted: true, memberIds: [], members: {}, archived: true, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
        await prop.ref.update({ ownerUid: FieldValue.delete() });
      } else {
        await prop.ref.delete();
        await deleteFilesUnder(`properties/${prop.id}/photos/`);
      }
      report.propertiesDeleted++;
      continue;
    }

    // A member who doesn't own the property: leave it.
    const teamRemains = others.some((m) => m === p.ownerUid || TEAM.includes(p.members[m]?.role ?? ''));
    for (const i of inspections.docs) {
      const d = i.data() as { participantIds?: string[] };
      if ((d.participantIds ?? []).includes(uid)) await settleInspection(i, teamRemains);
    }
    await prop.ref.update({ memberIds: FieldValue.arrayRemove(uid), [`members.${uid}`]: FieldValue.delete(), updatedAt: FieldValue.serverTimestamp() });
    await removeFromTenancies(prop.ref);
    report.propertiesLeft++;
  }

  // Inspections on properties the person had already left.
  const remaining = await db.collectionGroup('inspections').where('participantIds', 'array-contains', uid).get();
  for (const i of remaining.docs) if (!handledInspections.has(i.ref.path)) await settleInspection(i, true);

  const invites = await db.collection('invitations').where('invitedBy', '==', uid).get();
  for (const inv of invites.docs) await inv.ref.delete();
  report.invitationsDeleted = invites.size;

  await db.doc(`users/${uid}`).delete();
  await db.doc(`deletionRequests/${uid}`).delete();
  if (deps.auth) await deps.auth.deleteUser(uid).catch((e: { code?: string }) => (e.code === 'auth/user-not-found' ? undefined : Promise.reject(e)));
  return report;

  async function removeFromTenancies(propRef: DocumentReference) {
    const ts = await propRef.collection('tenancies').where('partyIds', 'array-contains', uid).get();
    for (const t of ts.docs) await t.ref.update({ partyIds: FieldValue.arrayRemove(uid) });
  }
}
