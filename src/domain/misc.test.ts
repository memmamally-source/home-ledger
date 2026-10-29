import { describe, expect, it } from 'vitest';
import { captureGap, safeFileName, timeStatements, validateEvidenceFile } from './evidence';
import { canonicalJson, sha256Hex } from './hash';
import { newEvidenceRef, newId } from './ids';
import { inviteLink, inviteProblem } from './invitation';
import { validateProperty } from './property';
import { capabilitiesFor } from './roles';

describe('roles', () => {
  it('only the owner’s team sees finances; contractors cannot inspect', () => {
    expect(capabilitiesFor('owner', true)).toMatchObject({ finance: true, delete: true });
    expect(capabilitiesFor('manager', false)).toMatchObject({ manage: true, finance: true, delete: false });
    expect(capabilitiesFor('tenant', false)).toMatchObject({ view: true, manage: false, finance: false, inspect: true });
    expect(capabilitiesFor('landlord', false)).toMatchObject({ finance: false, manage: false });
    expect(capabilitiesFor('contractor', false)).toMatchObject({ inspect: false, finance: false });
    expect(capabilitiesFor(undefined, false).view).toBe(false);
  });
  it('a tenant who created their own record controls it fully', () => {
    expect(capabilitiesFor('tenant', true)).toMatchObject({ manage: true, finance: true });
  });
});

describe('hash', () => {
  it('matches the known SHA-256 of "abc"', async () => {
    expect(await sha256Hex('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  });
  it('canonical JSON sorts keys and drops undefined', () => {
    expect(canonicalJson({ b: 1, a: { d: undefined, c: [2, { z: 1, y: 2 }] } })).toBe('{"a":{"c":[2,{"y":2,"z":1}]},"b":1}');
  });
});

describe('ids', () => {
  it('are field-path safe and evidence refs are readable', () => {
    expect(newId()).toMatch(/^[0-9a-z]{16}$/);
    expect(newEvidenceRef()).toMatch(/^EV-[0-9A-Z]{4}-[0-9A-Z]{4}$/);
  });
});

describe('evidence', () => {
  it('puts the verified server time first and labels the rest unverified', () => {
    const s = timeStatements({ exifTakenAt: new Date('2025-01-01'), addedOnDeviceAt: new Date('2025-01-02'), uploadedAt: new Date('2025-01-03') });
    expect(s[0]).toMatchObject({ verified: true });
    expect(s.slice(1).every((x) => !x.verified)).toBe(true);
  });
  it('flags old photos and impossible clocks, not same-day uploads', () => {
    expect(captureGap({ exifTakenAt: new Date('2025-01-01T10:00:00Z'), addedOnDeviceAt: new Date(), uploadedAt: new Date('2025-01-01T12:00:00Z') })).toBeNull();
    expect(captureGap({ exifTakenAt: new Date('2024-01-01T10:00:00Z'), addedOnDeviceAt: new Date(), uploadedAt: new Date('2025-01-01T12:00:00Z') })!.message).toMatch(/366 days/);
    expect(captureGap({ exifTakenAt: new Date('2025-02-01T10:00:00Z'), addedOnDeviceAt: new Date(), uploadedAt: new Date('2025-01-01T12:00:00Z') })!.message).toMatch(/wrong/);
  });
  it('validates files and cleans names', () => {
    expect(validateEvidenceFile({ type: 'image/jpeg', size: 1000 })).toBeNull();
    expect(validateEvidenceFile({ type: 'application/pdf', size: 1000 })).toMatch(/Only photos/);
    expect(validateEvidenceFile({ type: 'image/jpeg', size: 60 * 1024 * 1024 })).toMatch(/50 MB/);
    expect(safeFileName('Kitchen tap (leak) é.jpg')).toBe('Kitchen_tap_leak_e_.jpg');
  });
});

describe('invitations', () => {
  const inv = { status: 'pending' as const, expiresAt: new Date('2030-01-01'), invitedBy: 'landlord', email: 'tenant@example.com' };
  const user = { uid: 'tenant', email: 'Tenant@Example.com', emailVerified: true };
  it('accepts the invited, verified email', () => expect(inviteProblem(inv, user, { now: new Date('2029-01-01') })).toBeNull());
  it('rejects other cases', () => {
    const now = new Date('2029-01-01');
    expect(inviteProblem(inv, { ...user, email: 'x@example.com' }, { now })).toBe('wrong_email');
    expect(inviteProblem(inv, { ...user, emailVerified: false }, { now })).toBe('unverified_email');
    expect(inviteProblem(inv, user, { now: new Date('2031-01-01') })).toBe('expired');
    expect(inviteProblem({ ...inv, status: 'revoked' }, user, { now })).toBe('revoked');
    expect(inviteProblem(inv, { ...user, uid: 'landlord' }, { now })).toBe('own_invite');
    expect(inviteProblem({ ...inv, email: undefined }, user, { now, alreadyMember: true })).toBe('already_member');
  });
  it('builds hash-router links', () => {
    expect(inviteLink('https://x.github.io/homeledger/', 'abc')).toBe('https://x.github.io/homeledger/#/invite/abc');
    expect(inviteLink('https://x.github.io/homeledger/#/properties', 'abc')).toBe('https://x.github.io/homeledger/#/invite/abc');
  });
});

describe('validateProperty', () => {
  it('requires name, type, street and city', () => {
    expect(validateProperty({ name: '', address: {} }).errors).toHaveProperty('name');
    expect(validateProperty({ name: 'Flat', type: 'apartment', address: { line1: '1 Main Rd', city: 'Cape Town' } }).ok).toBe(true);
  });
});

describe('pdfSafe', async () => {
  const { pdfSafe } = await import('@/lib/pdf/inspectionReport');
  it('maps typographic characters to Latin-1', () => {
    expect(pdfSafe('Tenant’s “tap” – leaks… R 100')).toBe('Tenant\'s "tap" - leaks... R 100');
    expect(pdfSafe('Émile 🙂')).toBe('Émile ?');
  });
});

describe('camera times', async () => {
  const { exifToIso } = await import('@/lib/media');
  const { fmtClaimed } = await import('@/lib/format');
  const { getMarket } = await import('@/config/markets');
  it('keeps EXIF times as camera-clock time unless an offset was recorded', () => {
    expect(exifToIso('2025:01:15 09:30:00')).toBe('2025-01-15T09:30:00');
    expect(exifToIso('2025:01:15 09:30:00', '+02:00')).toBe('2025-01-15T09:30:00+02:00');
    expect(exifToIso('garbage')).toBeUndefined();
  });
  it('shows a zone-less time exactly as recorded, labelled', () => {
    expect(fmtClaimed('2025-01-15T09:30:00', getMarket('ZA'))).toMatch(/15 Jan 2025, 09:30 \(camera clock, time zone unknown\)/);
  });
});
