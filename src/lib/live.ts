import { onSnapshot, type DocumentReference, type Query } from 'firebase/firestore';
import { useEffect, useState } from 'react';

export interface Live<T> {
  data: T;
  loading: boolean;
  error: Error | null;
  /** True while the data comes only from the local cache (offline or not yet confirmed). */
  fromCache: boolean;
}

interface Slot<T> {
  key: string;
  data: T;
  error: Error | null;
  fromCache: boolean;
}

/**
 * Subscribes to a Firestore document. `key` identifies the target; pass null to skip.
 * State for an old key is ignored, so switching targets never shows stale data.
 */
export function useLiveDoc<T>(key: string | null, makeRef: () => DocumentReference | null, map: (id: string, data: Record<string, unknown>) => T): Live<T | null> {
  const [slot, setSlot] = useState<Slot<T | null> | null>(null);
  useEffect(() => {
    if (!key) return;
    const ref = makeRef();
    if (!ref) return;
    return onSnapshot(
      ref,
      { includeMetadataChanges: true },
      (snap) => setSlot({ key, data: snap.exists() ? map(snap.id, snap.data()) : null, error: null, fromCache: snap.metadata.fromCache }),
      (error) => setSlot({ key, data: null, error, fromCache: false }),
    );
    // makeRef and map are recreated each render; the key captures what they depend on.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  const current = slot && slot.key === key ? slot : null;
  return { data: current?.data ?? null, loading: Boolean(key) && !current, error: current?.error ?? null, fromCache: current?.fromCache ?? false };
}

export function useLiveQuery<T>(key: string | null, makeQuery: () => Query | null, map: (id: string, data: Record<string, unknown>) => T): Live<T[]> {
  const [slot, setSlot] = useState<Slot<T[]> | null>(null);
  useEffect(() => {
    if (!key) return;
    const q = makeQuery();
    if (!q) return;
    return onSnapshot(
      q,
      { includeMetadataChanges: true },
      (snap) => setSlot({ key, data: snap.docs.map((d) => map(d.id, d.data())), error: null, fromCache: snap.metadata.fromCache }),
      (error) => setSlot({ key, data: [], error, fromCache: false }),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  const current = slot && slot.key === key ? slot : null;
  return { data: current?.data ?? [], loading: Boolean(key) && !current, error: current?.error ?? null, fromCache: current?.fromCache ?? false };
}

/** Converts Firestore timestamps (or anything with toDate) to Date. */
export function toDate(v: unknown): Date | undefined {
  if (!v) return undefined;
  if (v instanceof Date) return v;
  if (typeof v === 'object' && v !== null && 'toDate' in v && typeof (v as { toDate: unknown }).toDate === 'function') return (v as { toDate(): Date }).toDate();
  if (typeof v === 'string') {
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? undefined : d;
  }
  return undefined;
}

/** Friendly text for Firebase errors. Never shows raw codes to people. */
export function friendlyError(e: unknown): string {
  const code = typeof e === 'object' && e && 'code' in e ? String((e as { code: unknown }).code) : '';
  const map: Record<string, string> = {
    'auth/invalid-credential': 'That email and password don’t match. Try again or reset your password.',
    'auth/wrong-password': 'That email and password don’t match. Try again or reset your password.',
    'auth/user-not-found': 'That email and password don’t match. Try again or reset your password.',
    'auth/email-already-in-use': 'An account already uses this email. Sign in instead.',
    'auth/weak-password': 'Choose a password of at least 8 characters.',
    'auth/invalid-email': 'Enter a valid email address.',
    'auth/too-many-requests': 'Too many attempts. Wait a few minutes and try again.',
    'auth/popup-closed-by-user': 'The sign-in window was closed before finishing.',
    'auth/network-request-failed': 'No connection. Check your internet and try again.',
    'auth/requires-recent-login': 'For your security, sign in again and then retry.',
    'auth/operation-not-allowed': 'This sign-in method isn’t switched on for this app yet.',
    'permission-denied': 'You don’t have permission to do that.',
    'storage/unauthorized': 'You don’t have permission to do that.',
    unavailable: 'You appear to be offline. Changes will sync when you reconnect.',
    'not-found': 'This item no longer exists.',
  };
  if (map[code]) return map[code]!;
  if (code.startsWith('storage/')) return 'The file could not be uploaded. It will be retried.';
  return 'Something went wrong. Please try again.';
}
