# Architecture

## Stack

React 19 + TypeScript + Vite + Tailwind CSS 4 (web), Firebase Authentication, Cloud Firestore, Cloud Storage.
Hash routing so the same build works on GitHub Pages and inside Capacitor (native packaging is Phase 5).
jsPDF generates reports on the device. No paid third-party services.

```
src/
  config/      brand name, markets (country, currency, locale, time zone, terminology)
  domain/      pure, tested business logic: money, dates, roles, tenancy and rent schedules,
               inspections (templates, progress, completion, content hash), evidence timing,
               invitations, portfolio summary, accounting (chart, journal validation, statements)
  data/        Firestore repositories and live hooks; each write is paired with its audit event
  lib/         Firebase init, live-query hooks, upload queue (IndexedDB), media prep, PDF report
  ui/          design system components
  features/    screens (thin: they call domain + data)
firebase/      firestore.rules, storage.rules, indexes, rules tests
scripts/       end-to-end test (Playwright + emulators), screenshot tool, test fixture
```

## Ownership and access model

- **Roles are per property** (`properties/{id}.members[uid].role`), never global. Roles: owner, co_owner, manager,
  agent (the *team*), landlord, tenant, co_tenant, contractor, inspector.
- **Each party keeps its own records.** A landlord's property record and a tenant's own record of the same home
  are separate documents (`recordKind: landlord | tenant`). Nothing is merged because addresses match.
- **Linking is by invitation only.** `invitations/{token}` (128+ bit token, 14-day expiry, single use, optionally
  locked to a verified email). The invitee accepts by adding themselves in one atomic batch that the rules verify
  against the invitation (role, property, tenancy, expiry, email).
- **Private finance** lives in `properties/{id}/private/details`, readable only by the team.
- **Tenancies** are readable by the team and by linked parties (`partyIds`).
- **Inspections** carry `participantIds` (who can read, regardless of later membership) and `teamVisible`.
  A tenant's inspection on a landlord's property is private until they share it. Sharing only ever widens.
  People keep access to inspections they took part in after leaving a property.
- **Audit events** (`properties/{id}/audit`) are append-only with server time. Completion and signing *require*
  their audit event in the same batch (enforced with `existsAfter`).

`src/domain/roles.ts` mirrors the rules for the UI; the rules are the authority.

## Evidence integrity

- Originals are uploaded untouched; a downscaled preview is stored alongside, labelled as derived.
- Storage objects are create-only (`resource == null`): nothing overwrites or deletes an original.
- Evidence records are create-only; `uploadedAt` must equal the server's `request.time`.
- SHA-256 of the original is computed on the device before upload and stored with the record and in object metadata.
  It is labelled as device-computed. A server-side recheck needs Cloud Functions (planned).
- Capture time from EXIF, the file's modified time and the device clock are stored as *claims* and shown separately
  from the server upload time, with a warning when they are far apart.
- Completing an inspection freezes the checklist, records server time and a SHA-256 content hash over the checklist
  and evidence hashes. Signatures are one per person, write-once, tied to that hash, and separate receipt from agreement.
- Unchecked items stay `null` and are reported as “Not inspected”, never as good. Bulk marking is an explicit choice.
- Later photos on a completed inspection are allowed but flagged `addendum` and excluded from the hash.

## Offline

Firestore's persistent local cache keeps inspections editable offline; checklist edits are field-path updates
(no overwrites between devices). Photos are saved to IndexedDB with their hash and metadata, and uploaded when the
connection returns. Completion and signing require a connection so the server can time-stamp them.

## Accounting foundation (Phase 1 design, Phase 3 interface)

`src/domain/accounting` holds the model and tested logic: legal entities, a chart of accounts, balanced double-entry
journal entries in integer cents, reversals for corrections (posted entries are never edited), income statement
(NOI separated from interest), balance sheet that reports any imbalance instead of plugging it, and a direct-method
cash-flow statement that distinguishes rent received from rent billed. Bond principal reduces the liability; capital
improvements are assets. Firestore layout: `entities/{id}/accounts`, `entities/{id}/journal`, `entities/{id}/audit`.
