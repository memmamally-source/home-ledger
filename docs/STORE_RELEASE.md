# Releasing HomeLedger to the App Store and Google Play

Everything that can live in the code is done: native iOS and Android projects (`ios/`, `android/`), icons, splash
screens, permission texts, the iOS privacy manifest, in-app account deletion, privacy/support/deletion pages, and
build pipelines on GitHub (`.github/workflows/ios.yml`, `android.yml`). The steps below need your accounts.

| | |
|---|---|
| App ID / bundle ID | `com.memmamally.homeledger` (permanent after the first upload) |
| Version | 1.0.0 (set `APP_VERSION` in both workflows); build numbers come from the workflow run |
| Devices | iPhone (iPad later), all Android phones and tablets |
| Privacy policy | https://memmamally-source.github.io/home-ledger/privacy.html |
| Support | https://memmamally-source.github.io/home-ledger/support.html |
| Account deletion (web) | https://memmamally-source.github.io/home-ledger/delete-account.html |
| Listing text and form answers | `docs/store/LISTING.md` |

## 0. Before either store (Terminal on your Mac)

```bash
cd ~/home-ledger && git pull
# Account deletion runs as a server function: both stores require it to really work.
npx firebase-tools@15 deploy --only functions --project homeledger-test
```
The first deploy switches on a few Google Cloud services and takes 3–5 minutes. Then in **Google Cloud Shell**
(https://shell.cloud.google.com/?project=homeledger-test) let the apps load photos:
```bash
printf '[{"origin":["https://memmamally-source.github.io","capacitor://localhost","https://localhost"],"method":["GET","HEAD"],"maxAgeSeconds":3600}]' > cors.json
gcloud storage buckets update gs://homeledger-test.firebasestorage.app --cors-file=cors.json
```

Create a **review account** for Apple and Google (they must be able to sign in): sign up in the app as
`review.homeledger@gmail.com` (or similar), add a sample property, tenancy and a completed inspection with photos.

## 1. Apple App Store (you already have a developer account and App Store Connect key)

1. **Register the app ID:** https://developer.apple.com/account/resources/identifiers/add/bundleId → App IDs → App →
   Description `HomeLedger`, Bundle ID **Explicit** `com.memmamally.homeledger` → Continue → Register.
2. **Create the app:** https://appstoreconnect.apple.com/apps → **+** → New App → iOS, Name `HomeLedger`
   (if taken, try `HomeLedger: Rental Records`), primary language English (U.K.), bundle ID from step 1,
   SKU `homeledger-ios`, Full access.
3. **Add the four secrets** (same values as Oursome / Crossword Hub) at
   https://github.com/memmamally-source/home-ledger/settings/secrets/actions → New repository secret:
   `APPSTORE_KEY_ID`, `APPSTORE_ISSUER_ID`, `APPSTORE_KEY` (the whole text of the .p8 file), `APPLE_TEAM_ID`.
4. **Build and upload:** https://github.com/memmamally-source/home-ledger/actions/workflows/ios.yml → Run workflow.
   About 15 minutes later the build appears in App Store Connect → TestFlight.
5. **Test on your iPhone** with TestFlight (internal testing needs no review).
6. **Fill in the listing** from `docs/store/LISTING.md`: description, keywords, URLs, App Privacy answers, age rating,
   and App Review notes with the review account. Upload screenshots from `docs/store/screenshots/ios-6.9/`.
7. Choose the build → **Add for Review** → Submit.

## 2. Google Play

1. **Developer account:** https://play.google.com/console (US$25 once). New *personal* accounts must run a
   **closed test with at least 12 testers for 14 days** before they can publish to production; organisation
   accounts (needs a D-U-N-S number) are exempt.
2. **Create your upload key** (Terminal on your Mac; choose your own password and keep it safe):
   ```bash
   cd ~ && openssl req -x509 -newkey rsa:4096 -sha256 -days 10000 -nodes \
     -keyout hl-upload-key.pem -out hl-upload-cert.pem -subj "/CN=HomeLedger upload key"
   openssl pkcs12 -export -inkey hl-upload-key.pem -in hl-upload-cert.pem -name upload -out homeledger-upload.p12
   base64 -i homeledger-upload.p12 | pbcopy
   ```
   The last line copies the key as text. Add two secrets at
   https://github.com/memmamally-source/home-ledger/settings/secrets/actions: `ANDROID_KEYSTORE_BASE64` (paste) and
   `ANDROID_KEYSTORE_PASSWORD` (the password you typed). Back up `homeledger-upload.p12` and the password somewhere
   safe (for example a password manager), then delete the two `.pem` files.
3. **Build:** https://github.com/memmamally-source/home-ledger/actions/workflows/android.yml → Run workflow → when it
   finishes, download the `…release-aab` artifact (a zip containing `app-release.aab`).
4. **Create the app** in Play Console → Create app → `HomeLedger`, App, Free. Let Google manage the app signing key
   (Play App Signing) when asked.
5. **Testing → Internal testing** → Create release → upload the `.aab` → add yourself as a tester → install from the
   link on your Android phone.
6. **App content** (Policy → App content): privacy policy URL, app access (review account), ads: none, content
   rating questionnaire, target audience 18+, data safety (answers in `LISTING.md`), account deletion URL.
7. **Store listing:** text from `LISTING.md`, icon `assets/brand/app-icon-512` (512×512), feature graphic
   `docs/store/feature-graphic.png`, phone screenshots from `docs/store/screenshots/android/`.
8. Closed testing (12+ testers, 14 days) → apply for production → release.

## What's still limited in version 1.0

- **Sign-in in the apps is email and password only.** Google sign-in needs a native plugin; adding it obliges
  Sign in with Apple too (Apple guideline 4.8). The website keeps Google sign-in.
- **Invitation links open the website.** In the app people use “Join with a link”. Opening links straight in the app
  (universal links / app links) needs a small domain setup later.
- **No push notifications or emails yet.**
- The privacy policy is a careful draft, not legal advice: have it reviewed, and add the responsible party’s full
  details (POPIA) before public launch.
