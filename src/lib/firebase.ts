import { initializeApp, type FirebaseApp } from 'firebase/app';
import { browserLocalPersistence, browserPopupRedirectResolver, connectAuthEmulator, indexedDBLocalPersistence, initializeAuth, type Auth } from 'firebase/auth';
import { connectFirestoreEmulator, initializeFirestore, persistentLocalCache, persistentMultipleTabManager, type Firestore } from 'firebase/firestore';
import { connectStorageEmulator, getStorage, type FirebaseStorage } from 'firebase/storage';

const env = import.meta.env;

export const usingEmulators = env.VITE_USE_EMULATORS === 'true';
export const firebaseConfigured = usingEmulators || Boolean(env.VITE_FIREBASE_API_KEY && env.VITE_FIREBASE_PROJECT_ID);
export const appleSignInEnabled = env.VITE_ENABLE_APPLE_SIGNIN === 'true';

const config = usingEmulators
  ? { apiKey: 'demo-key', authDomain: 'demo-homeledger.firebaseapp.com', projectId: 'demo-homeledger', storageBucket: 'demo-homeledger.appspot.com', appId: 'demo' }
  : {
      apiKey: env.VITE_FIREBASE_API_KEY,
      authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
      projectId: env.VITE_FIREBASE_PROJECT_ID,
      storageBucket: env.VITE_FIREBASE_STORAGE_BUCKET,
      appId: env.VITE_FIREBASE_APP_ID,
      messagingSenderId: env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    };

let app: FirebaseApp | undefined;
let auth: Auth | undefined;
let db: Firestore | undefined;
let storage: FirebaseStorage | undefined;

function init() {
  if (app) return;
  if (!firebaseConfigured) throw new Error('Firebase is not configured. See docs/FIREBASE_SETUP.md.');
  app = initializeApp(config);
  auth = initializeAuth(app, {
    persistence: [indexedDBLocalPersistence, browserLocalPersistence],
    popupRedirectResolver: browserPopupRedirectResolver,
  });
  // The local cache keeps inspections usable offline; writes queue and sync when the connection returns.
  db = initializeFirestore(app, { localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }) });
  storage = getStorage(app);
  if (usingEmulators) {
    const host = location.hostname === 'localhost' ? '127.0.0.1' : location.hostname;
    connectAuthEmulator(auth, `http://${host}:9099`, { disableWarnings: true });
    connectFirestoreEmulator(db, host, 8080);
    connectStorageEmulator(storage, host, 9199);
  }
}

export function getAuthInstance(): Auth {
  init();
  return auth!;
}
export function getDb(): Firestore {
  init();
  return db!;
}
export function getStorageInstance(): FirebaseStorage {
  init();
  return storage!;
}
