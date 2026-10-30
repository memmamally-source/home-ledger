# HomeLedger — progress

> Living record so any session can resume. Update at the end of every phase.

**Product:** landlord and tenant property management (web first, iOS/Android later via Capacitor). Initial market South Africa.
**Name:** “HomeLedger” is a working name only (not trademark-cleared). `src/config/brand.ts`.
**Repo:** `memmamally-source/home-ledger` (private), branch `main`. Kept separate from Oursome. Private repo: GitHub Pages needs a paid GitHub plan or a public repo; Actions minutes are limited.
**Backend:** Firebase project `homeledger-test` (Blaze plan, budget alert set). Firestore and Storage in `africa-south1` (Johannesburg). Email/password + Google sign-in on. Rules and indexes deployed 29 Oct 2026 by the owner (`npx firebase-tools@15 deploy --only firestore:rules,firestore:indexes,storage --project homeledger-test`). Bucket CORS set for `https://memmamally-source.github.io`.
**Live site:** https://memmamally-source.github.io/home-ledger/ (GitHub Pages, publishes on every push to `main`; Firebase web config in `.env.production`).

## Status

| Phase | Status |
| --- | --- |
| 1. Core app and inspections | ✅ Built and tested on emulators; live on the real project since 29 Oct 2026. Owner confirmed sign-up and profile saving work live. Inspections/photos on the live site and on a physical phone not yet confirmed |
| 2. Tenant collaboration (maintenance, documents, messages, comparisons, deposits, calendar) | Not started |
| 3. Financial management (ledger UI, statements) | Domain model and logic done and tested; no UI or Firestore rules yet |
| 4. Advanced (AI extraction, contractors, assets, utilities, bank import, subscriptions) | Not started |
| 5. Production readiness (Capacitor, store prep, monitoring, perf) | Store preparation in progress (30 Oct 2026): native apps, account deletion, legal pages, pipelines, listing and screenshots done; owner steps in `docs/STORE_RELEASE.md`. Monitoring and performance not started |

## Store readiness (30 Oct 2026)

- **Capacitor 8** wraps the same web build: `ios/` (Swift Package Manager, iPhone only for 1.0) and `android/`. App ID `com.memmamally.homeledger`, version 1.0.0; build numbers from the workflow run.
- Native adaptations: email-only sign-in in the apps (Google needs a native plugin and then Sign in with Apple, guideline 4.8), Auth without the pop-up resolver, PDFs/exports via Filesystem + share sheet (`src/lib/files.ts`), invitation links always use the public web URL (`src/lib/platform.ts`), “Join with a link” to paste invitations, safe-area padding, status bar follows theme, Android back button.
- iOS: camera/photo/microphone usage texts, `ITSAppUsesNonExemptEncryption=false`, privacy manifest `ios/App/App/PrivacyInfo.xcprivacy`. Android: `allowBackup=false`, release signing from CI secrets (PKCS#12 upload key).
- Icons and splash screens generated from `assets/` with `@capacitor/assets` (don't let it write PWA files: it breaks `public/manifest.webmanifest`).
- **Account deletion** is real: callable Cloud Function `deleteAccount` (`functions/`, region africa-south1, needs a sign-in within 15 minutes) with the policy documented in `functions/src/deleteAccount.ts` and the privacy policy; 5 tests on the emulators (run by `npm run test:rules`). Settings → Delete my account re-authenticates, requires typing DELETE, then calls it. Falls back to recording a request if the function isn't deployed. **Deployed by the owner on 30 Oct 2026** (africa-south1; container images kept 1 day).
- Public pages: `public/privacy.html` (draft: add responsible party details, legal review), `support.html`, `delete-account.html` (Google Play's web deletion URL). Linked from Settings and sign-up.
- Pipelines: `.github/workflows/ios.yml` (unsigned check on push; manual run signs and uploads to TestFlight with the owner's existing 4 App Store Connect secrets), `android.yml` (debug build on push; manual run builds a signed .aab artifact with `ANDROID_KEYSTORE_BASE64`/`ANDROID_KEYSTORE_PASSWORD`).
- Listing text, privacy-label and data-safety answers: `docs/store/LISTING.md`. Screenshots (6, framed): `docs/store/screenshots/ios-6.9` (1320×2868) and `android` (1080×1920), feature graphic `docs/store/feature-graphic.png`; regenerate with `npm run store:screens`. Screen 4 uses a placeholder test photo.
- Bucket CORS must also allow `capacitor://localhost` and `https://localhost` for photos in the apps (command in the release guide).
- Not verified: native builds have only been compiled on GitHub's runners; nothing has run on a physical device or simulator yet.

## Brand and visual design (29 Oct 2026)

- Palette: ivory backgrounds (`#faf7ef` / surfaces `#fffdf8`), black text (`#111111`), deep green accent (`#1f4d3a`). Dark mode uses green-black with ivory text. Tokens in `src/index.css`.
- Logo: a roof over an open ledger, ivory on a green tile (`src/app/Logo.tsx`). Wordmark “Home” in black, “Ledger” in green (Fraunces).
- Assets: `assets/brand/` (logo-mark.svg, logo-horizontal.png, app-icon-1024.png full-bleed for the stores), `public/icons/` (favicon, Apple touch icon, PWA icons), `public/manifest.webmanifest`. The PDF report draws the mark as vectors.
- The name is still a working name; recheck the logo if the name changes.

## Phase 1: what exists (29 Oct 2026)

- Auth: email/password, Google (popup), Apple behind `VITE_ENABLE_APPLE_SIGNIN`, password reset, email verification.
- Onboarding: “How will you use HomeLedger?” landlord / tenant / both, name, country. Changeable in Settings.
- Home: landlord portfolio (properties, occupancy, rent due monthly under current terms, leases ending in 90 days,
  escalations in 60 days, move-ins), tenant “your rented home”, drafts to continue, follow-ups from inspections.
- Properties: create/edit (7 types, address, unit, building, portfolio), private ownership/finance details (team only),
  filters (record type, occupancy, portfolio/building, search, archived), archive/restore.
- Tenancies: full lease terms, escalation (percentage compounding or fixed steps), pro-rata, deposit, utilities, parking,
  extra charges; month-by-month rent schedule (conventions shown on screen).
- Invitations: link-based, role-specific, optional verified-email lock, 14-day expiry, single use, revocable; landlord→tenant
  and tenant→landlord. Share sheet / copy link (no email service yet).
- People: roles listed, owner can remove members, members can leave.
- Inspections: 5 types; 16 room types with detailed template checklists (standard-v1); room picker by property type;
  item condition good/defective/not tested/N/A (unchecked stays unchecked); defect description, severity, comments,
  follow-up; custom rooms and items; explicit bulk marking; room notes; photos/videos per item or room, camera-first.
- Evidence: original + preview, SHA-256 on device, EXIF/device times as claims vs server upload time, gap warnings,
  IndexedDB offline queue with retry, create-only storage.
- Completion: review of unchecked items and undescribed defects, explicit confirmation, server-time completion and content hash.
- Signatures: receipt separate from agreement (agree/partly/disagree), disputed items, comments, drawn signature, write-once.
- Sharing: with the property team and/or individual members; widen-only.
- Reports: on-screen report and PDF (property, parties, integrity block, defects, room tables, photos with captions,
  signatures, disclaimer); download and native share sheet.
- Activity log (team), data export (JSON), account deletion *request* (recorded only; processing needs Cloud Functions).
- Light (default) and dark themes; responsive phone/tablet/desktop layouts.

## Tests (all passing on 29 Oct 2026)

- `npm run check`: typecheck, lint (incl. React Compiler rules), **69 unit tests** (money, dates, rent schedules,
  inspections, evidence timing, invitations, roles, portfolio, accounting statements).
- `npm run test:rules`: **34 security-rule tests** on the Firestore and Storage emulators.
- `npm run test:e2e`: **18-step end-to-end run** in Chromium against the emulators (landlord + tenant journeys,
  offline photo capture, completion, PDF, dispute signature, sharing, counter-signature, activity log, dark mode).
- Not tested: real Firebase project, real Google/Apple sign-in, physical phones, Safari/iOS, HEIC photos.

## Decisions

- Stack per the brief (React/Vite/Tailwind/Firebase); hash routing for Pages + Capacitor.
- Per-property roles; separate records per party; invitation-only linking; participants keep inspection access.
- No Cloud Functions in Phase 1 (they need Blaze): integrity enforced by rules (server time, append-only, `existsAfter`).
- Files are read with authenticated `getBlob`, never public download URLs (needs bucket CORS).
- Inspections are never deleted; they can be voided with a reason.

## Known gaps / risks

- Hashes are device-computed; a server recheck (Cloud Function) is planned.
- Account deletion is only recorded; needs a server function and a retention policy (POPIA).
- Main JS bundle ~880 kB (Firebase SDK); split in Phase 5.
- “Remove room” uses the browser confirm dialog; replace with an in-app dialog.
- Collection-group queries (`participantIds`, `partyIds`) need the field overrides in `firebase/firestore.indexes.json` deployed.
- Sandbox note: firebase-tools ignores NO_PROXY, so for local emulator runs in the cloud sandbox `node_modules/firebase-tools/lib/apiv2.js`
  was patched to skip the proxy for 127.0.0.1 (not committed; not needed elsewhere).

## Next (Phase 2)

1. Maintenance requests (“Report a problem”) with the 9-step workflow, contractor details, quotes, invoices; optional link to the ledger later.
2. Document library per property with categories, versions, expiry reminders and access control.
3. Issue-linked conversations.
4. Ingoing vs outgoing comparison screen and report.
5. Deposit reconciliation with proposed/approved/disputed deductions.
6. Tenant history view; calendar; in-app notifications (email/push after the server side exists).
