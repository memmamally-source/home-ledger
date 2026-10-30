import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { setGlobalOptions } from 'firebase-functions/v2';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { deleteAccountData } from './deleteAccount.js';

initializeApp();
// Run next to the data (Johannesburg).
setGlobalOptions({ region: 'africa-south1', maxInstances: 5 });

const RECENT_SIGN_IN_SECONDS = 15 * 60;

/** Deletes the caller's account and data. Requires a recent sign-in, like Firebase's own account deletion. */
export const deleteAccount = onCall({ timeoutSeconds: 300, memory: '512MiB' }, async (req) => {
  if (!req.auth) throw new HttpsError('unauthenticated', 'Sign in first.');
  const authTime = Number(req.auth.token.auth_time ?? 0);
  if (Date.now() / 1000 - authTime > RECENT_SIGN_IN_SECONDS) throw new HttpsError('failed-precondition', 'requires-recent-login');
  const report = await deleteAccountData({ db: getFirestore(), storage: getStorage().bucket(), auth: getAuth() }, req.auth.uid);
  return { ok: true, report };
});
