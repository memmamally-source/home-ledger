// Runs against the Firestore, Auth and Storage emulators (see the root `npm run test:rules`).
import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { beforeEach, describe, expect, it } from 'vitest';
import { deleteAccountData } from './deleteAccount.js';

const app = initializeApp({ projectId: 'demo-homeledger', storageBucket: 'demo-homeledger.appspot.com' });
const db = getFirestore(app);
const auth = getAuth(app);
const bucket = getStorage(app).bucket();

const ME = 'me';
const now = Timestamp.now();

const prop = (ownerUid: string, members: Record<string, string>) => ({
  name: 'P',
  ownerUid,
  memberIds: Object.keys(members),
  members: Object.fromEntries(Object.entries(members).map(([u, role]) => [u, { role, displayName: u }])),
  recordKind: 'landlord',
  archived: false,
  createdAt: now,
});
const insp = (createdBy: string, participantIds: string[], teamVisible: boolean) => ({ createdBy, participantIds, editorIds: [createdBy], teamVisible, status: 'completed', rooms: {}, createdAt: now });

async function clear() {
  await fetch(`http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/demo-homeledger/databases/(default)/documents`, { method: 'DELETE' });
  await bucket.deleteFiles().catch(() => undefined);
}

beforeEach(async () => {
  await clear();
  await auth.deleteUser(ME).catch(() => undefined);
  await auth.createUser({ uid: ME, email: 'me@example.com' });
  await db.doc(`users/${ME}`).set({ displayName: 'Me', intents: ['landlord'] });
  await db.doc(`deletionRequests/${ME}`).set({ status: 'requested' });
});

const exists = async (path: string) => (await db.doc(path).get()).exists;
const fileExists = async (path: string) => (await bucket.file(path).exists())[0];

describe('deleteAccountData', () => {
  it('deletes a property only I am on, with everything under it and its files', async () => {
    await db.doc('properties/solo').set(prop(ME, { [ME]: 'owner' }));
    await db.doc('properties/solo/private/details').set({ purchasePrice: 1 });
    await db.doc('properties/solo/inspections/i1').set(insp(ME, [ME], true));
    await db.doc('properties/solo/inspections/i1/evidence/e1').set({ sha256: 'x' });
    await bucket.file('properties/solo/inspections/i1/e1/original-a.jpg').save('img');
    const r = await deleteAccountData({ db, storage: bucket, auth }, ME);
    expect(r.propertiesDeleted).toBe(1);
    for (const p of ['properties/solo', 'properties/solo/private/details', 'properties/solo/inspections/i1', 'properties/solo/inspections/i1/evidence/e1', `users/${ME}`, `deletionRequests/${ME}`]) expect(await exists(p)).toBe(false);
    expect(await fileExists('properties/solo/inspections/i1/e1/original-a.jpg')).toBe(false);
    await expect(auth.getUser(ME)).rejects.toThrow();
  });

  it('as a tenant on someone else’s property: leaves it, keeps shared inspections for them, deletes my private ones', async () => {
    await db.doc('properties/theirs').set(prop('landlord', { landlord: 'owner', [ME]: 'tenant' }));
    await db.doc('properties/theirs/tenancies/t1').set({ partyIds: [ME], tenantName: 'Me' });
    await db.doc('properties/theirs/inspections/shared').set(insp(ME, [ME, 'landlord'], true));
    await db.doc('properties/theirs/inspections/sharedWithTeam').set(insp(ME, [ME], true));
    await db.doc('properties/theirs/inspections/private').set(insp(ME, [ME], false));
    await bucket.file('properties/theirs/inspections/private/e/original.jpg').save('img');
    await bucket.file('properties/theirs/inspections/shared/e/original.jpg').save('img');
    await deleteAccountData({ db, storage: bucket, auth }, ME);

    const p = (await db.doc('properties/theirs').get()).data()!;
    expect(p.memberIds).toEqual(['landlord']);
    expect(p.members[ME]).toBeUndefined();
    expect((await db.doc('properties/theirs/tenancies/t1').get()).data()!.partyIds).toEqual([]);
    const shared = (await db.doc('properties/theirs/inspections/shared').get()).data()!;
    expect(shared.participantIds).toEqual(['landlord']);
    expect(shared.authorAccountDeleted).toBe(true);
    expect(await exists('properties/theirs/inspections/sharedWithTeam')).toBe(true); // the landlord's team relies on it
    expect(await exists('properties/theirs/inspections/private')).toBe(false);
    expect(await fileExists('properties/theirs/inspections/private/e/original.jpg')).toBe(false);
    expect(await fileExists('properties/theirs/inspections/shared/e/original.jpg')).toBe(true);
  });

  it('passes a jointly owned property to the co-owner', async () => {
    await db.doc('properties/joint').set(prop(ME, { [ME]: 'owner', partner: 'co_owner', tenant: 'tenant' }));
    await db.doc('properties/joint/private/details').set({ purchasePrice: 1 });
    await db.doc('properties/joint/inspections/i').set(insp(ME, [ME], true));
    const r = await deleteAccountData({ db, storage: bucket, auth }, ME);
    expect(r.propertiesTransferred).toBe(1);
    const p = (await db.doc('properties/joint').get()).data()!;
    expect(p.ownerUid).toBe('partner');
    expect(p.members.partner.role).toBe('owner');
    expect(p.memberIds.sort()).toEqual(['partner', 'tenant']);
    expect(await exists('properties/joint/private/details')).toBe(true);
    expect(await exists('properties/joint/inspections/i')).toBe(true);
  });

  it('without a co-owner, deletes my owner records but keeps inspections the tenant took part in', async () => {
    await db.doc('properties/mine').set(prop(ME, { [ME]: 'owner', tenant: 'tenant' }));
    await db.doc('properties/mine/private/details').set({ purchasePrice: 1 });
    await db.doc('properties/mine/tenancies/t').set({ partyIds: ['tenant'] });
    await db.doc('properties/mine/inspections/withTenant').set(insp(ME, [ME, 'tenant'], true));
    await db.doc('properties/mine/inspections/ownerOnly').set(insp(ME, [ME], true));
    await deleteAccountData({ db, storage: bucket, auth }, ME);
    expect(await exists('properties/mine/private/details')).toBe(false);
    expect(await exists('properties/mine/tenancies/t')).toBe(false);
    expect(await exists('properties/mine/inspections/ownerOnly')).toBe(false);
    expect((await db.doc('properties/mine/inspections/withTenant').get()).data()!.participantIds).toEqual(['tenant']);
    const stub = (await db.doc('properties/mine').get()).data()!;
    expect(stub.memberIds).toEqual([]);
    expect(stub.ownerUid).toBeUndefined();
  });

  it('settles inspections on properties I had already left, deletes my invitations, and touches nobody else', async () => {
    await db.doc('properties/old').set(prop('landlord', { landlord: 'owner' }));
    await db.doc('properties/old/inspections/past').set(insp(ME, [ME, 'landlord'], true));
    await db.doc('properties/other').set(prop('someone', { someone: 'owner' }));
    await db.doc('properties/other/inspections/x').set(insp('someone', ['someone'], true));
    await db.doc('invitations/mine').set({ invitedBy: ME, propertyId: 'x' });
    await db.doc('invitations/theirs').set({ invitedBy: 'someone', propertyId: 'other' });
    const r = await deleteAccountData({ db, storage: bucket, auth }, ME);
    expect((await db.doc('properties/old/inspections/past').get()).data()!.participantIds).toEqual(['landlord']);
    expect(r.invitationsDeleted).toBe(1);
    expect(await exists('invitations/mine')).toBe(false);
    expect(await exists('invitations/theirs')).toBe(true);
    expect(await exists('properties/other/inspections/x')).toBe(true);
  });
});
