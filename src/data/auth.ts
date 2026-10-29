import {
  GoogleAuthProvider,
  OAuthProvider,
  createUserWithEmailAndPassword,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut as fbSignOut,
  updateProfile as fbUpdateProfile,
} from 'firebase/auth';
import { getAuthInstance } from '@/lib/firebase';
import { ensureProfile } from './users';

export async function signUpWithEmail(name: string, email: string, password: string) {
  const cred = await createUserWithEmailAndPassword(getAuthInstance(), email.trim(), password);
  await fbUpdateProfile(cred.user, { displayName: name.trim() });
  await ensureProfile(cred.user.uid, { displayName: name.trim(), email: cred.user.email ?? email });
  // Verification lets the person accept email-restricted invitations. Failure here is not fatal.
  await sendEmailVerification(cred.user).catch(() => undefined);
  return cred.user;
}

export function signInWithEmail(email: string, password: string) {
  return signInWithEmailAndPassword(getAuthInstance(), email.trim(), password);
}

export function signInWithGoogle() {
  return signInWithPopup(getAuthInstance(), new GoogleAuthProvider());
}

export function signInWithApple() {
  const p = new OAuthProvider('apple.com');
  p.addScope('email');
  p.addScope('name');
  return signInWithPopup(getAuthInstance(), p);
}

export function resetPassword(email: string) {
  return sendPasswordResetEmail(getAuthInstance(), email.trim());
}

export function resendVerification() {
  const u = getAuthInstance().currentUser;
  return u ? sendEmailVerification(u) : Promise.resolve();
}

export function signOut() {
  return fbSignOut(getAuthInstance());
}
