# Firebase and GitHub setup (owner tasks)

The app runs fully on the local Firebase emulators today. To run it for real you need a Firebase project.
Nothing below has been done yet; each step needs your accounts.

## ⚠️ Cost decision first: Cloud Storage needs the Blaze plan

Firebase now requires the pay-as-you-go **Blaze** plan to use Cloud Storage (where inspection photos live).
Blaze includes no-cost usage quotas, so light testing typically costs little or nothing, but it needs a
billing account and charges beyond the quotas. Check current pricing on firebase.google.com/pricing, and
**set a budget alert** in Google Cloud Billing before uploading anything.

Firestore and Authentication work on the free Spark plan. Without Storage, everything except photo
evidence works. Cloud Functions (planned for account deletion, email and server-side hash checks) also
need Blaze.

**Decision needed from you:** upgrade the project to Blaze (recommended for testing inspections), or start on
Spark without photo uploads.

## 1. Create the project

1. console.firebase.google.com → Add project → e.g. `homeledger-test`. Google Analytics: off (not needed).
2. **Choose locations deliberately; they can’t be changed later.** For South African users and POPIA, consider a
   Johannesburg region (`africa-south1`) for Firestore and Storage if offered, and record the choice in the
   privacy notice. Note that the Storage no-cost quota applies only to some US regions.
3. Build → Firestore Database → Create database → production mode → your location.
4. Build → Storage → Get started (asks for Blaze) → same region.
5. Build → Authentication → Get started → enable **Email/Password** and **Google**.
   Authentication → Settings → Authorised domains: add `memmamally-source.github.io` (and any custom domain).
6. Project settings → General → Your apps → add a **Web** app. Copy the config values.

## 2. Deploy the security rules and indexes

```bash
npm install
npx firebase login
npx firebase use --add          # pick the project, alias "default"
npx firebase deploy --only firestore:rules,firestore:indexes,storage
```

Run `npm run test:rules` before every rules deploy.

## 3. Allow the web app to read private files (CORS)

The app reads photos with authenticated requests (never public download links), which needs CORS on the bucket.
Edit `firebase/storage-cors.json` if your domain differs, then (Google Cloud SDK):

```bash
gcloud storage buckets update gs://YOUR_BUCKET --cors-file=firebase/storage-cors.json
```

## 4. Local development against the real project (optional)

Copy `.env.example` to `.env.local`, fill in the web config, set `VITE_USE_EMULATORS=false`, run `npm run dev`.

## 5. GitHub Pages

1. Create an empty GitHub repository (e.g. `memmamally-source/homeledger`). The Claude integration could not create
   one itself, so this is needed before the code can be pushed.
2. Settings → Pages → Source: **GitHub Actions**.
3. Settings → Secrets and variables → Actions → **Variables**: add `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`,
   `VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_STORAGE_BUCKET`, `VITE_FIREBASE_APP_ID`,
   `VITE_FIREBASE_MESSAGING_SENDER_ID`. These identify the project and are visible in any web app anyway; the
   security rules are what protect the data. No admin credentials go anywhere in the client.
4. Actions → “Deploy web app to GitHub Pages” → Run workflow.

## 6. Later

- **Apple sign-in:** needs an Apple Developer account (Services ID, key, return URL), then enable Apple in Firebase
  Authentication and build with `VITE_ENABLE_APPLE_SIGNIN=true`. Required by Apple if the iOS app offers Google sign-in.
- **App Check** (reCAPTCHA Enterprise / App Attest / Play Integrity) to limit abuse of the API from non-app clients.
- **Email delivery** (invitations, reports): needs an email provider (e.g. the Firebase “Trigger Email” extension
  with an SMTP service) and Cloud Functions. Until then the app shares links and PDFs via the device.
- **Backups:** enable Firestore point-in-time recovery and scheduled exports (Blaze).
