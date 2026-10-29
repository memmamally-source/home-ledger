# HomeLedger — progress

> Living record so any session can resume. Update at the end of every phase.

**Product:** landlord and tenant property management (web first, iOS/Android later via Capacitor). Initial market South Africa.
**Name:** “HomeLedger” is a working name only (not trademark-cleared). `src/config/brand.ts`.
**Repo:** `memmamally-source/home-ledger` (private), branch `main`. Kept separate from Oursome. Private repo: GitHub Pages needs a paid GitHub plan or a public repo; Actions minutes are limited.
**Backend:** no Firebase project yet; everything is built and tested against the Firebase emulators. See `docs/FIREBASE_SETUP.md`.

## Status

| Phase | Status |
| --- | --- |
| 1. Core app and inspections | ✅ Built and tested on emulators (details below). Not yet on a real Firebase project or a physical phone |
| 2. Tenant collaboration (maintenance, documents, messages, comparisons, deposits, calendar) | Not started |
| 3. Financial management (ledger UI, statements) | Domain model and logic done and tested; no UI or Firestore rules yet |
| 4. Advanced (AI extraction, contractors, assets, utilities, bank import, subscriptions) | Not started |
| 5. Production readiness (Capacitor, store prep, monitoring, perf) | Not started |

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
