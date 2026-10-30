# HomeLedger — notes for Claude

Read `PROGRESS.md` first: status, decisions and the next phase plan. Update it at the end of each phase.

- React 19 / Vite 8 / TypeScript 6 / Tailwind 4 / Firebase JS SDK 12 / react-router 8 (hash router).
- Run `npm run check` before committing; run `npm run test:rules` after any rules change and `npm run test:e2e` after UI flow changes.
- Domain logic stays pure in `src/domain/*` with tests; screens stay thin. Money is integer minor units; calendar dates are `YYYY-MM-DD` strings.
- Every permission lives in `firebase/*.rules` (the authority) and is mirrored in `src/domain/roles.ts`. Add a rules test for every rule change.
- Evidence, signatures and audit events are append-only. Never add update/delete paths for them.
- Never present unverified times as verified, unchecked items as good, or emails as sent.
- Brand strings come from `src/config/brand.ts`; colours are CSS tokens in `src/index.css` (use `*-soft` / `*-ink` pairs for text on tints).
- React Compiler lint rules apply: no setState directly in effects, no impure calls (Date.now) during render.
- Cloud sandbox quirk: firebase-tools ignores NO_PROXY, so the Storage emulator's calls to the Firestore emulator hit the agent proxy. Locally patch `node_modules/firebase-tools/lib/apiv2.js` to skip the proxy for 127.0.0.1 (see PROGRESS.md); not needed on normal machines or CI. Never unset HTTPS_PROXY.
- Native apps (Capacitor): after web changes run `npm run build && npx cap sync`. Platform differences go through `src/lib/platform.ts` and `src/lib/files.ts`; never use `location.href` for links people share. Server functions live in `functions/` (own package; built by its predeploy).
- Ask before paid services, deploys, billing or store submissions. Never claim device testing that wasn't done.
