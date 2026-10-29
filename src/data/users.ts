import { doc, getDoc, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
import { getDb } from '@/lib/firebase';
import { useLiveDoc } from '@/lib/live';

export type Intent = 'landlord' | 'tenant';
export type ThemePreference = 'light' | 'dark' | 'system';

/** `users/{uid}`: private to the account holder. */
export interface UserProfile {
  uid: string;
  displayName: string;
  email: string;
  phone?: string;
  intents: Intent[];
  marketId: string;
  theme: ThemePreference;
  onboarded: boolean;
}

function mapProfile(uid: string, d: Record<string, unknown>): UserProfile {
  return {
    uid,
    displayName: String(d.displayName ?? ''),
    email: String(d.email ?? ''),
    phone: d.phone ? String(d.phone) : undefined,
    intents: Array.isArray(d.intents) ? (d.intents as Intent[]) : [],
    marketId: String(d.marketId ?? 'ZA'),
    theme: (d.theme as ThemePreference) ?? 'light',
    onboarded: Boolean(d.onboarded),
  };
}

export function useProfile(uid: string | null) {
  return useLiveDoc(uid ? `user:${uid}` : null, () => doc(getDb(), `users/${uid}`), mapProfile);
}

export async function ensureProfile(uid: string, init: { displayName: string; email: string }) {
  const ref = doc(getDb(), `users/${uid}`);
  const snap = await getDoc(ref);
  if (snap.exists()) return;
  await setDoc(ref, {
    displayName: init.displayName.slice(0, 100),
    email: init.email,
    intents: [],
    marketId: 'ZA',
    theme: 'light',
    onboarded: false,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

/**
 * Called right after email sign-up. The session may already have created a profile with a fallback
 * name, so this merges rather than skipping, making sure the name typed at sign-up is the one saved.
 */
export async function writeSignUpProfile(uid: string, init: { displayName: string; email: string }) {
  await setDoc(
    doc(getDb(), `users/${uid}`),
    { displayName: init.displayName.slice(0, 100), email: init.email, intents: [], marketId: 'ZA', theme: 'light', onboarded: false, updatedAt: serverTimestamp() },
    { merge: true },
  );
}

export async function updateProfile(uid: string, patch: Partial<Omit<UserProfile, 'uid' | 'email'>>) {
  await updateDoc(doc(getDb(), `users/${uid}`), { ...patch, updatedAt: serverTimestamp() });
}
