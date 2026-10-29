# HomeLedger (working name)

Rental property management for landlords and tenants: properties, tenancies and rent schedules, and
room-by-room inspections with timestamped photo evidence, signatures and PDF reports. Either party can use it
alone; they can link up by invitation.

“HomeLedger” is a temporary development name, not a cleared brand. Change it in `src/config/brand.ts`.

## Run it locally (no accounts needed)

Requires Node 22 and Java 21 (for the Firebase emulators).

```bash
npm install
npm run dev:emulators    # terminal 1: local Auth, Firestore and Storage
npm run dev              # terminal 2: http://localhost:5173 (uses .env.local; copy .env.example)
```

## Checks

```bash
npm run check        # typecheck, lint, unit tests
npm run test:rules   # Firestore + Storage security rules against the emulators
npm run test:e2e     # full workflows in Chromium against the emulators; screenshots in test-results/
```

## Docs

- `PROGRESS.md`: status, decisions and next steps
- `docs/ARCHITECTURE.md`: data model, permissions, evidence integrity, accounting design
- `docs/FIREBASE_SETUP.md`: what the owner needs to configure (Firebase, billing, GitHub Pages)
