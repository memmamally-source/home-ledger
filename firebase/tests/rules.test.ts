import { readFileSync } from 'node:fs';
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing';
import {
  Timestamp,
  arrayUnion,
  deleteDoc,
  deleteField,
  doc,
  getDoc,
  getDocs,
  collection,
  collectionGroup,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
  type Firestore,
} from 'firebase/firestore';
import { getBytes, ref, uploadBytes } from 'firebase/storage';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

let env: RulesTestEnvironment;

const LANDLORD = 'landlord';
const MANAGER = 'manager';
const TENANT = 'tenant';
const STRANGER = 'stranger';
const CONTRACTOR = 'contractor';
const P = 'prop1';
const T = 'ten1';
const HASH = 'a'.repeat(64);

const auth = (uid: string, email = `${uid}@example.com`, verified = true) => env.authenticatedContext(uid, { email, email_verified: verified });
const db = (uid: string, email?: string, verified?: boolean) => auth(uid, email, verified).firestore() as unknown as Firestore;

const member = (role: string, displayName: string) => ({ role, displayName });

function propertyData(ownerUid: string, recordKind: 'landlord' | 'tenant', members: Record<string, { role: string; displayName: string }>) {
  return {
    name: 'Sea Point flat',
    type: 'apartment',
    address: { line1: '1 Beach Rd', city: 'Cape Town', country: 'ZA' },
    recordKind,
    marketId: 'ZA',
    currency: 'ZAR',
    ownerUid,
    memberIds: Object.keys(members),
    members,
    archived: false,
    createdAt: serverTimestamp(),
  };
}

function tenancyData(extra: Record<string, unknown> = {}) {
  return {
    propertyId: P,
    tenantName: 'Thandi',
    startDate: '2025-01-01',
    monthlyRent: 1_200_000,
    currency: 'ZAR',
    dueDay: 1,
    prorate: true,
    escalation: { kind: 'none' },
    adjustments: [],
    additionalCharges: [],
    utilities: { electricity: 'tenant', water: 'landlord' },
    partyIds: [],
    createdBy: LANDLORD,
    createdAt: serverTimestamp(),
    ...extra,
  };
}

function inspectionData(createdBy: string, role: string, team: boolean, extra: Record<string, unknown> = {}) {
  return {
    propertyId: P,
    propertyName: 'Sea Point flat',
    propertyAddress: '1 Beach Rd',
    type: 'ingoing',
    title: 'Move-in inspection',
    inspectionDate: '2025-01-01',
    status: 'draft',
    templateSet: 'standard-v1',
    rooms: { r1: { id: 'r1', name: 'Kitchen', type: 'kitchen', order: 0, notes: '', custom: false, items: { i1: { id: 'i1', label: 'Taps', condition: null } } } },
    generalNotes: '',
    parties: {},
    participantIds: [createdBy],
    editorIds: [createdBy],
    teamVisible: team,
    createdBy,
    createdByName: createdBy,
    createdByRole: role,
    createdByTeam: team,
    createdAt: serverTimestamp(),
    ...extra,
  };
}

/** Seeds a landlord property with a manager, a tenant and a contractor, bypassing rules. */
async function seed(opts: { tenantIsMember?: boolean } = {}) {
  await env.withSecurityRulesDisabled(async (ctx) => {
    const fs = ctx.firestore() as unknown as Firestore;
    const members: Record<string, { role: string; displayName: string }> = {
      [LANDLORD]: member('owner', 'Lerato'),
      [MANAGER]: member('manager', 'Mo'),
      [CONTRACTOR]: member('contractor', 'Fixit'),
    };
    if (opts.tenantIsMember !== false) members[TENANT] = member('tenant', 'Thandi');
    await setDoc(doc(fs, `properties/${P}`), { ...propertyData(LANDLORD, 'landlord', members), createdAt: Timestamp.now() });
    await setDoc(doc(fs, `properties/${P}/private/details`), { purchasePrice: 150_000_000 });
    await setDoc(doc(fs, `properties/${P}/tenancies/${T}`), {
      ...tenancyData({ partyIds: opts.tenantIsMember !== false ? [TENANT] : [] }),
      createdAt: Timestamp.now(),
    });
  });
}

async function seedInvite(id: string, data: Record<string, unknown>) {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore() as unknown as Firestore, `invitations/${id}`), {
      id,
      propertyId: P,
      propertyName: 'Sea Point flat',
      role: 'tenant',
      invitedBy: LANDLORD,
      invitedByName: 'Lerato',
      status: 'pending',
      createdAt: Timestamp.now(),
      expiresAt: Timestamp.fromMillis(Date.now() + 86_400_000),
      ...data,
    });
  });
}

async function seedInspection(id: string, data: Record<string, unknown>) {
  await env.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore() as unknown as Firestore, `properties/${P}/inspections/${id}`), { ...data, createdAt: Timestamp.now() });
  });
}

const TOKEN = 'x'.repeat(32);

function joinBatch(fs: Firestore, uid: string, token: string, role: string, opts: { tenancy?: boolean } = {}) {
  const b = writeBatch(fs);
  b.update(doc(fs, `properties/${P}`), {
    memberIds: arrayUnion(uid),
    [`members.${uid}`]: { role, displayName: 'Thandi', joinedAt: serverTimestamp(), inviteId: token },
    updatedAt: serverTimestamp(),
  });
  if (opts.tenancy) b.update(doc(fs, `properties/${P}/tenancies/${T}`), { partyIds: arrayUnion(uid), updatedAt: serverTimestamp() });
  b.update(doc(fs, `invitations/${token}`), { status: 'accepted', acceptedBy: uid, acceptedAt: serverTimestamp() });
  return b.commit();
}

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-homeledger',
    firestore: { rules: readFileSync('firebase/firestore.rules', 'utf8'), host: '127.0.0.1', port: 8080 },
    storage: { rules: readFileSync('firebase/storage.rules', 'utf8'), host: '127.0.0.1', port: 9199 },
  });
});

afterAll(async () => env?.cleanup());

beforeEach(async () => {
  await env.clearFirestore();
  await env.clearStorage();
});

describe('accounts and profiles', () => {
  it('nobody reads anything signed out', async () => {
    await seed();
    const anon = env.unauthenticatedContext().firestore() as unknown as Firestore;
    await assertFails(getDoc(doc(anon, `properties/${P}`)));
    await assertFails(getDoc(doc(anon, `invitations/${TOKEN}`)));
  });

  it('a profile is readable and writable only by its owner', async () => {
    await assertSucceeds(setDoc(doc(db(TENANT), `users/${TENANT}`), { displayName: 'Thandi', intents: ['tenant'] }));
    await assertFails(getDoc(doc(db(STRANGER), `users/${TENANT}`)));
    await assertFails(setDoc(doc(db(STRANGER), `users/${TENANT}`), { displayName: 'x', intents: [] }));
    await assertFails(setDoc(doc(db(TENANT), `users/${TENANT}`), { displayName: 'Thandi', intents: ['admin'] }));
  });
});

describe('properties', () => {
  it('a landlord creates a property as its owner', async () => {
    await assertSucceeds(setDoc(doc(db(LANDLORD), 'properties/new'), propertyData(LANDLORD, 'landlord', { [LANDLORD]: member('owner', 'Lerato') })));
  });

  it('a tenant creates their own record as tenant, with no landlord involved', async () => {
    await assertSucceeds(setDoc(doc(db(TENANT), 'properties/mine'), propertyData(TENANT, 'tenant', { [TENANT]: member('tenant', 'Thandi') })));
    await assertSucceeds(getDoc(doc(db(TENANT), 'properties/mine')));
    await assertFails(getDoc(doc(db(LANDLORD), 'properties/mine')));
  });

  it('nobody can create a record that adds other people', async () => {
    await assertFails(
      setDoc(doc(db(LANDLORD), 'properties/new'), propertyData(LANDLORD, 'landlord', { [LANDLORD]: member('owner', 'L'), [TENANT]: member('tenant', 'T') })),
    );
    await assertFails(setDoc(doc(db(LANDLORD), 'properties/new'), propertyData(TENANT, 'landlord', { [TENANT]: member('owner', 'T') })));
    await assertFails(setDoc(doc(db(LANDLORD), 'properties/new'), propertyData(LANDLORD, 'landlord', { [LANDLORD]: member('tenant', 'L') })));
    await assertFails(setDoc(doc(db(LANDLORD), 'properties/new'), { ...propertyData(LANDLORD, 'landlord', { [LANDLORD]: member('owner', 'L') }), createdAt: Timestamp.fromMillis(0) }));
  });

  it('members read the property; strangers do not; members are listed only by their own query', async () => {
    await seed();
    await assertSucceeds(getDoc(doc(db(TENANT), `properties/${P}`)));
    await assertFails(getDoc(doc(db(STRANGER), `properties/${P}`)));
    await assertSucceeds(getDocs(query(collection(db(TENANT), 'properties'), where('memberIds', 'array-contains', TENANT))));
    await assertFails(getDocs(collection(db(TENANT), 'properties')));
  });

  it('private ownership and finance details are for the owner’s team only', async () => {
    await seed();
    await assertSucceeds(getDoc(doc(db(LANDLORD), `properties/${P}/private/details`)));
    await assertSucceeds(getDoc(doc(db(MANAGER), `properties/${P}/private/details`)));
    await assertFails(getDoc(doc(db(TENANT), `properties/${P}/private/details`)));
    await assertFails(getDoc(doc(db(CONTRACTOR), `properties/${P}/private/details`)));
    await assertFails(setDoc(doc(db(TENANT), `properties/${P}/private/details`), { purchasePrice: 1 }));
  });

  it('the team edits details; tenants cannot; nobody edits membership directly', async () => {
    await seed();
    await assertSucceeds(updateDoc(doc(db(MANAGER), `properties/${P}`), { notes: 'Gate code changed' }));
    await assertFails(updateDoc(doc(db(TENANT), `properties/${P}`), { notes: 'x' }));
    await assertFails(updateDoc(doc(db(MANAGER), `properties/${P}`), { [`members.${MANAGER}.role`]: 'owner' }));
    await assertFails(updateDoc(doc(db(MANAGER), `properties/${P}`), { archived: true }));
    await assertFails(deleteDoc(doc(db(LANDLORD), `properties/${P}`)));
  });

  it('a member can leave and the owner can remove a member, but not themselves', async () => {
    await seed();
    await assertSucceeds(
      updateDoc(doc(db(CONTRACTOR), `properties/${P}`), {
        memberIds: [LANDLORD, MANAGER, TENANT],
        [`members.${CONTRACTOR}`]: deleteField(),
      }),
    );
    await assertSucceeds(
      updateDoc(doc(db(LANDLORD), `properties/${P}`), { memberIds: [LANDLORD, TENANT], [`members.${MANAGER}`]: deleteField() }),
    );
    await assertFails(updateDoc(doc(db(LANDLORD), `properties/${P}`), { memberIds: [TENANT], [`members.${LANDLORD}`]: deleteField() }));
    await assertFails(updateDoc(doc(db(TENANT), `properties/${P}`), { memberIds: [LANDLORD], [`members.${LANDLORD}`]: deleteField(), [`members.${TENANT}`]: deleteField() }));
  });
});

describe('tenancies', () => {
  it('parties and the team read the tenancy; other members do not', async () => {
    await seed();
    await assertSucceeds(getDoc(doc(db(TENANT), `properties/${P}/tenancies/${T}`)));
    await assertSucceeds(getDoc(doc(db(MANAGER), `properties/${P}/tenancies/${T}`)));
    await assertFails(getDoc(doc(db(CONTRACTOR), `properties/${P}/tenancies/${T}`)));
    await assertSucceeds(getDocs(query(collectionGroup(db(TENANT), 'tenancies'), where('partyIds', 'array-contains', TENANT))));
  });

  it('only the team creates and edits tenancies, and cannot add parties directly', async () => {
    await seed();
    await assertSucceeds(setDoc(doc(db(LANDLORD), `properties/${P}/tenancies/t2`), tenancyData()));
    await assertFails(setDoc(doc(db(LANDLORD), `properties/${P}/tenancies/t3`), tenancyData({ partyIds: [STRANGER] })));
    await assertFails(setDoc(doc(db(TENANT), `properties/${P}/tenancies/t4`), tenancyData({ createdBy: TENANT })));
    await assertFails(updateDoc(doc(db(TENANT), `properties/${P}/tenancies/${T}`), { monthlyRent: 1 }));
    await assertSucceeds(updateDoc(doc(db(MANAGER), `properties/${P}/tenancies/${T}`), { monthlyRent: 1_300_000 }));
    await assertFails(updateDoc(doc(db(MANAGER), `properties/${P}/tenancies/${T}`), { partyIds: [TENANT, STRANGER] }));
  });
});

describe('invitations', () => {
  it('the team invites with allowed roles only', async () => {
    await seed();
    const inv = (id: string, role: string, extra: Record<string, unknown> = {}) => ({
      id,
      propertyId: P,
      propertyName: 'Sea Point flat',
      role,
      invitedBy: LANDLORD,
      invitedByName: 'Lerato',
      status: 'pending',
      createdAt: serverTimestamp(),
      expiresAt: Timestamp.fromMillis(Date.now() + 7 * 86_400_000),
      tenancyId: T,
      ...extra,
    });
    const id = (c: string) => c.repeat(32);
    await assertSucceeds(setDoc(doc(db(LANDLORD), `invitations/${id('a')}`), inv(id('a'), 'tenant', { email: 'new@example.com' })));
    await assertFails(setDoc(doc(db(LANDLORD), `invitations/${id('b')}`), inv(id('b'), 'owner')));
    await assertFails(setDoc(doc(db(LANDLORD), `invitations/${id('c')}`), inv(id('c'), 'landlord'))); // landlord role is for tenant records
    await assertFails(setDoc(doc(db(TENANT), `invitations/${id('d')}`), inv(id('d'), 'tenant', { invitedBy: TENANT })));
    await assertFails(setDoc(doc(db(LANDLORD), `invitations/short`), inv('short', 'tenant')));
    await assertFails(setDoc(doc(db(LANDLORD), `invitations/${id('e')}`), inv(id('e'), 'tenant', { expiresAt: Timestamp.fromMillis(Date.now() + 90 * 86_400_000) })));
    await assertFails(setDoc(doc(db(LANDLORD), `invitations/${id('f')}`), inv(id('f'), 'tenant', { email: 'Mixed@Example.com' })));
  });

  it('a tenant record can invite its landlord', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore() as unknown as Firestore, 'properties/mine'), { ...propertyData(TENANT, 'tenant', { [TENANT]: member('tenant', 'Thandi') }), createdAt: Timestamp.now() });
    });
    const id = 'l'.repeat(32);
    await assertSucceeds(
      setDoc(doc(db(TENANT), `invitations/${id}`), {
        id,
        propertyId: 'mine',
        propertyName: 'My flat',
        role: 'landlord',
        invitedBy: TENANT,
        invitedByName: 'Thandi',
        status: 'pending',
        createdAt: serverTimestamp(),
        expiresAt: Timestamp.fromMillis(Date.now() + 86_400_000),
      }),
    );
  });

  it('invitations open by link but cannot be listed by others', async () => {
    await seed();
    await seedInvite(TOKEN, {});
    await assertSucceeds(getDoc(doc(db(STRANGER), `invitations/${TOKEN}`)));
    await assertFails(getDocs(collection(db(STRANGER), 'invitations')));
    await assertSucceeds(getDocs(query(collection(db(LANDLORD), 'invitations'), where('invitedBy', '==', LANDLORD))));
  });

  it('accepting joins the property and tenancy with the invited role, once', async () => {
    await seed({ tenantIsMember: false });
    await seedInvite(TOKEN, { tenancyId: T });
    await assertSucceeds(joinBatch(db(TENANT), TENANT, TOKEN, 'tenant', { tenancy: true }));
    await assertSucceeds(getDoc(doc(db(TENANT), `properties/${P}/tenancies/${T}`)));
    // a second person cannot reuse the accepted link
    await assertFails(joinBatch(db(STRANGER), STRANGER, TOKEN, 'tenant'));
  });

  it('a joiner cannot pick a different role, skip the invitation, or use an expired one', async () => {
    await seed({ tenantIsMember: false });
    await seedInvite(TOKEN, {});
    await assertFails(joinBatch(db(TENANT), TENANT, TOKEN, 'owner'));
    await assertFails(
      updateDoc(doc(db(TENANT), `properties/${P}`), { memberIds: arrayUnion(TENANT), [`members.${TENANT}`]: { role: 'tenant', displayName: 'T', joinedAt: serverTimestamp(), inviteId: TOKEN } }),
    );
    const expired = 'e'.repeat(32);
    await seedInvite(expired, { expiresAt: Timestamp.fromMillis(Date.now() - 1000) });
    await assertFails(joinBatch(db(TENANT), TENANT, expired, 'tenant'));
  });

  it('an email-restricted invitation needs that verified email', async () => {
    await seed({ tenantIsMember: false });
    await seedInvite(TOKEN, { email: 'thandi@example.com' });
    await assertFails(joinBatch(db(TENANT, 'other@example.com'), TENANT, TOKEN, 'tenant'));
    await assertFails(joinBatch(db(TENANT, 'thandi@example.com', false), TENANT, TOKEN, 'tenant'));
    await assertSucceeds(joinBatch(db(TENANT, 'Thandi@Example.com', true), TENANT, TOKEN, 'tenant'));
  });

  it('a tenancy invitation for another tenancy does not grant this one', async () => {
    await seed({ tenantIsMember: false });
    await seedInvite(TOKEN, { tenancyId: 'other' });
    await assertFails(joinBatch(db(TENANT), TENANT, TOKEN, 'tenant', { tenancy: true }));
  });

  it('the sender can revoke', async () => {
    await seed();
    await seedInvite(TOKEN, {});
    await assertFails(updateDoc(doc(db(STRANGER), `invitations/${TOKEN}`), { status: 'revoked', revokedAt: serverTimestamp() }));
    await assertSucceeds(updateDoc(doc(db(LANDLORD), `invitations/${TOKEN}`), { status: 'revoked', revokedAt: serverTimestamp() }));
  });
});

describe('inspections', () => {
  const insp = (fs: Firestore, id: string) => doc(fs, `properties/${P}/inspections/${id}`);

  it('a tenant’s inspection is private until they share it; the landlord can then read but not edit', async () => {
    await seed();
    await assertSucceeds(setDoc(insp(db(TENANT), 'ti'), inspectionData(TENANT, 'tenant', false)));
    await assertFails(getDoc(insp(db(LANDLORD), 'ti')));
    await assertSucceeds(updateDoc(insp(db(TENANT), 'ti'), { teamVisible: true }));
    await assertSucceeds(getDoc(insp(db(LANDLORD), 'ti')));
    await assertFails(updateDoc(insp(db(LANDLORD), 'ti'), { 'rooms.r1.items.i1.condition': 'good' }));
    await assertFails(updateDoc(insp(db(TENANT), 'ti'), { teamVisible: false })); // sharing never narrows
  });

  it('the team’s inspections are visible to the team and to participants only', async () => {
    await seed();
    await assertSucceeds(setDoc(insp(db(LANDLORD), 'li'), inspectionData(LANDLORD, 'owner', true)));
    await assertSucceeds(getDoc(insp(db(MANAGER), 'li')));
    await assertSucceeds(updateDoc(insp(db(MANAGER), 'li'), { 'rooms.r1.items.i1.condition': 'good' })); // team edits team drafts
    await assertFails(getDoc(insp(db(TENANT), 'li')));
    await assertSucceeds(updateDoc(insp(db(LANDLORD), 'li'), { participantIds: arrayUnion(TENANT) }));
    await assertSucceeds(getDoc(insp(db(TENANT), 'li')));
    await assertFails(updateDoc(insp(db(TENANT), 'li'), { 'rooms.r1.items.i1.condition': 'defective' }));
    await assertFails(updateDoc(insp(db(LANDLORD), 'li'), { participantIds: arrayUnion(STRANGER) })); // only members
  });

  it('creation rules: real role, server time, no team inspections hidden from the team, no contractors', async () => {
    await seed();
    await assertFails(setDoc(insp(db(TENANT), 'x1'), inspectionData(TENANT, 'owner', false)));
    await assertFails(setDoc(insp(db(TENANT), 'x2'), inspectionData(TENANT, 'tenant', true)));
    await assertFails(setDoc(insp(db(LANDLORD), 'x3'), inspectionData(LANDLORD, 'owner', true, { teamVisible: false })));
    await assertFails(setDoc(insp(db(LANDLORD), 'x4'), inspectionData(LANDLORD, 'owner', true, { createdAt: Timestamp.fromMillis(0) })));
    await assertFails(setDoc(insp(db(CONTRACTOR), 'x5'), inspectionData(CONTRACTOR, 'contractor', false)));
    await assertFails(setDoc(insp(db(STRANGER), 'x6'), inspectionData(STRANGER, 'tenant', false)));
    await assertFails(setDoc(insp(db(LANDLORD), 'x7'), inspectionData(LANDLORD, 'owner', true, { status: 'completed' })));
  });

  it('completing needs the server time, a hash and the audit event; afterwards the checklist is frozen', async () => {
    await seed();
    await seedInspection('c1', inspectionData(LANDLORD, 'owner', true, { participantIds: [LANDLORD, TENANT] }));
    const fs = db(LANDLORD);
    // without the audit event
    await assertFails(updateDoc(insp(fs, 'c1'), { status: 'completed', completedBy: LANDLORD, completedAt: serverTimestamp(), contentHash: HASH }));
    const complete = (at: unknown) => {
      const b = writeBatch(fs);
      b.update(insp(fs, 'c1'), { status: 'completed', completedBy: LANDLORD, completedAt: at, contentHash: HASH });
      b.set(doc(fs, `properties/${P}/audit/complete_c1`), { action: 'inspection.completed', kind: 'create', actorUid: LANDLORD, actorName: 'L', at: serverTimestamp(), summary: 'Completed', target: { type: 'inspection', id: 'c1' } });
      return b.commit();
    };
    await assertFails(complete(Timestamp.fromMillis(0)));
    await assertSucceeds(complete(serverTimestamp()));
    await assertFails(updateDoc(insp(fs, 'c1'), { 'rooms.r1.items.i1.condition': 'good' }));
    await assertFails(updateDoc(insp(fs, 'c1'), { contentHash: 'b'.repeat(64) }));
    await assertFails(updateDoc(insp(fs, 'c1'), { status: 'draft' }));
    await assertSucceeds(updateDoc(insp(fs, 'c1'), { participantIds: arrayUnion(MANAGER) }));
    await assertSucceeds(updateDoc(insp(fs, 'c1'), { status: 'void', voidReason: 'Wrong property' }));
  });

  it('the audit event for completion cannot be pre-created to block it', async () => {
    await seed();
    await seedInspection('c2', inspectionData(LANDLORD, 'owner', true));
    await assertFails(
      setDoc(doc(db(TENANT), `properties/${P}/audit/complete_c2`), { action: 'inspection.completed', kind: 'create', actorUid: TENANT, actorName: 'T', at: serverTimestamp(), summary: 'x', target: { type: 'inspection', id: 'c2' } }),
    );
  });

  it('a person keeps access to inspections they took part in after leaving the property', async () => {
    await seed();
    await seedInspection('h1', inspectionData(TENANT, 'tenant', false));
    await updateDoc(doc(db(TENANT), `properties/${P}`), { memberIds: [LANDLORD, MANAGER, CONTRACTOR], [`members.${TENANT}`]: deleteField() });
    await assertFails(getDoc(doc(db(TENANT), `properties/${P}`)));
    await assertSucceeds(getDoc(insp(db(TENANT), 'h1')));
    await assertSucceeds(getDocs(query(collectionGroup(db(TENANT), 'inspections'), where('participantIds', 'array-contains', TENANT))));
  });
});

describe('evidence, signatures and audit', () => {
  const evPath = (iid: string, eid: string) => `properties/${P}/inspections/${iid}/evidence/${eid}`;
  const evidence = (iid: string, eid: string, by: string, extra: Record<string, unknown> = {}) => ({
    id: eid,
    ref: 'EV-AAAA-BBBB',
    roomId: 'r1',
    itemId: 'i1',
    kind: 'photo',
    storagePath: `properties/${P}/inspections/${iid}/${eid}/original-tap.jpg`,
    originalFilename: 'tap.jpg',
    contentType: 'image/jpeg',
    size: 1234,
    sha256: HASH,
    claimedCapture: { addedOnDeviceAt: new Date().toISOString() },
    metadata: {},
    addendum: false,
    caption: '',
    uploadedBy: by,
    uploadedByName: by,
    uploadedAt: serverTimestamp(),
    ...extra,
  });

  it('editors add evidence with server time; nobody edits or deletes it', async () => {
    await seed();
    await seedInspection('e1', inspectionData(TENANT, 'tenant', false));
    await assertSucceeds(setDoc(doc(db(TENANT), evPath('e1', 'ev1')), evidence('e1', 'ev1', TENANT)));
    await assertFails(setDoc(doc(db(TENANT), evPath('e1', 'ev2')), evidence('e1', 'ev2', TENANT, { uploadedAt: Timestamp.fromMillis(0) })));
    await assertFails(setDoc(doc(db(TENANT), evPath('e1', 'ev3')), evidence('e1', 'ev3', TENANT, { storagePath: 'elsewhere/x.jpg' })));
    await assertFails(updateDoc(doc(db(TENANT), evPath('e1', 'ev1')), { caption: 'changed' }));
    await assertFails(deleteDoc(doc(db(TENANT), evPath('e1', 'ev1'))));
    await assertFails(setDoc(doc(db(LANDLORD), evPath('e1', 'ev4')), evidence('e1', 'ev4', LANDLORD)));
    await assertFails(getDoc(doc(db(LANDLORD), evPath('e1', 'ev1'))));
  });

  it('after completion, participants can only add evidence marked as an addendum', async () => {
    await seed();
    await seedInspection('e2', inspectionData(LANDLORD, 'owner', true, { status: 'completed', contentHash: HASH, participantIds: [LANDLORD, TENANT] }));
    await assertFails(setDoc(doc(db(TENANT), evPath('e2', 'a1')), evidence('e2', 'a1', TENANT)));
    await assertSucceeds(setDoc(doc(db(TENANT), evPath('e2', 'a2')), evidence('e2', 'a2', TENANT, { addendum: true })));
  });

  it('each participant signs once, for themselves, against the completed content', async () => {
    await seed();
    await seedInspection('s1', inspectionData(LANDLORD, 'owner', true, { status: 'completed', contentHash: HASH, participantIds: [LANDLORD, TENANT] }));
    const sign = (fs: Firestore, uid: string, signer: string, extra: Record<string, unknown> = {}, withAudit = true) => {
      const b = writeBatch(fs);
      b.set(doc(fs, `properties/${P}/inspections/s1/signatures/${signer}`), {
        uid: signer,
        name: 'Thandi',
        role: 'tenant',
        acknowledgedReceipt: true,
        agreement: 'disagree',
        comment: 'The oven was already scratched.',
        disputedItemIds: ['i1'],
        signatureImage: 'data:image/png;base64,iVBORw0KGgo=',
        contentHash: HASH,
        signedAt: serverTimestamp(),
        ...extra,
      });
      if (withAudit)
        b.set(doc(fs, `properties/${P}/audit/sign_s1_${uid}`), { action: 'inspection.signed', kind: 'disagreement', actorUid: uid, actorName: 'T', at: serverTimestamp(), summary: 'Signed', target: { type: 'inspection', id: 's1' } });
      return b.commit();
    };
    await assertFails(sign(db(TENANT), TENANT, TENANT, {}, false));
    await assertFails(sign(db(TENANT), TENANT, TENANT, { contentHash: 'b'.repeat(64) }));
    await assertFails(sign(db(TENANT), TENANT, TENANT, { role: 'owner' }));
    await assertFails(sign(db(TENANT), TENANT, LANDLORD));
    await assertSucceeds(sign(db(TENANT), TENANT, TENANT));
    await assertFails(sign(db(TENANT), TENANT, TENANT, { agreement: 'agree' })); // no second signature, no edits
    await assertFails(deleteDoc(doc(db(TENANT), `properties/${P}/inspections/s1/signatures/${TENANT}`)));
    // a manager on the team may sign a team-visible inspection on the owner's behalf; a contractor may not
    await assertSucceeds(sign(db(MANAGER), MANAGER, MANAGER, { role: 'manager' }));
    await assertFails(sign(db(CONTRACTOR), CONTRACTOR, CONTRACTOR, { role: 'contractor' }));
  });

  it('audit events are append-only and use server time', async () => {
    await seed();
    const ev = { action: 'property.updated', kind: 'edit', actorUid: MANAGER, actorName: 'Mo', at: serverTimestamp(), summary: 'Edited', target: { type: 'property', id: P } };
    await assertSucceeds(setDoc(doc(db(MANAGER), `properties/${P}/audit/a1`), ev));
    await assertFails(setDoc(doc(db(MANAGER), `properties/${P}/audit/a2`), { ...ev, at: Timestamp.fromMillis(0) }));
    await assertFails(setDoc(doc(db(MANAGER), `properties/${P}/audit/a3`), { ...ev, actorUid: LANDLORD }));
    await assertFails(updateDoc(doc(db(MANAGER), `properties/${P}/audit/a1`), { summary: 'rewritten' }));
    await assertFails(deleteDoc(doc(db(LANDLORD), `properties/${P}/audit/a1`)));
    await assertFails(getDoc(doc(db(TENANT), `properties/${P}/audit/a1`)));
    await assertSucceeds(getDoc(doc(db(LANDLORD), `properties/${P}/audit/a1`)));
  });
});

describe('storage', () => {
  const file = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);
  const meta = (by: string) => ({ contentType: 'image/jpeg', customMetadata: { uploadedBy: by, sha256: HASH } });
  const path = (iid: string) => `properties/${P}/inspections/${iid}/ev1/original-tap.jpg`;

  it('editors upload evidence once; others cannot read or overwrite it', async () => {
    await seed();
    await seedInspection('f1', inspectionData(TENANT, 'tenant', false));
    const tenantStorage = auth(TENANT).storage();
    await assertSucceeds(uploadBytes(ref(tenantStorage, path('f1')), file, meta(TENANT)));
    await assertSucceeds(getBytes(ref(tenantStorage, path('f1'))));
    await assertFails(getBytes(ref(auth(LANDLORD).storage(), path('f1'))));
    await assertFails(uploadBytes(ref(tenantStorage, path('f1')), file, meta(TENANT)));
    await assertFails(uploadBytes(ref(auth(LANDLORD).storage(), `properties/${P}/inspections/f1/ev2/x.jpg`), file, meta(LANDLORD)));
    await assertFails(uploadBytes(ref(tenantStorage, `properties/${P}/inspections/f1/ev3/x.jpg`), file, meta(LANDLORD)));
    await assertFails(uploadBytes(ref(tenantStorage, `properties/${P}/inspections/f1/ev4/x.pdf`), file, { ...meta(TENANT), contentType: 'application/pdf' }));
  });

  it('shared inspections’ files are readable by the team', async () => {
    await seed();
    await seedInspection('f2', inspectionData(TENANT, 'tenant', false, { teamVisible: true }));
    await assertSucceeds(uploadBytes(ref(auth(TENANT).storage(), path('f2')), file, meta(TENANT)));
    await assertSucceeds(getBytes(ref(auth(MANAGER).storage(), path('f2'))));
    await assertFails(getBytes(ref(auth(CONTRACTOR).storage(), path('f2'))));
  });

  it('everything else is closed', async () => {
    await assertFails(uploadBytes(ref(auth(TENANT).storage(), 'anything.jpg'), file, meta(TENANT)));
  });
});

// Sanity check that the suite really talks to the emulator.
it('emulator is reachable', () => expect(env).toBeDefined());
