// End-to-end test of the Phase 1 workflows, run against the Firebase emulators:
//   npm run test:e2e
// Starts Vite in emulator mode, then drives Chromium through: landlord sign-up, property, tenancy and
// rent schedule, invitation; tenant sign-up via the invitation, ingoing inspection with a photo, offline
// capture, completion, PDF report, signature with a dispute, sharing; landlord counter-signature.
import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { chromium } from 'playwright';

const PORT = 5179;
const BASE = `http://127.0.0.1:${PORT}/`;
const SHOTS = process.env.E2E_SHOTS ?? 'test-results/screens';
mkdirSync(SHOTS, { recursive: true });

const server = spawn('node_modules/.bin/vite', ['--port', String(PORT), '--strictPort', '--host', '127.0.0.1'], {
  env: { ...process.env, VITE_USE_EMULATORS: 'true', VITE_FIREBASE_API_KEY: '' },
  stdio: ['ignore', 'pipe', 'pipe'],
});
await new Promise((resolve, reject) => {
  const t = setTimeout(() => reject(new Error('Vite did not start')), 60_000);
  server.stdout.on('data', (d) => {
    if (String(d).includes('Local')) {
      clearTimeout(t);
      resolve();
    }
  });
});

const browser = await chromium.launch();
const errors = [];
const openPages = [];
const steps = [];
const step = async (name, fn) => {
  const t0 = Date.now();
  try {
    await fn();
    steps.push(`ok   ${name} (${Date.now() - t0} ms)`);
    console.log(`ok   ${name}`);
  } catch (e) {
    steps.push(`FAIL ${name}: ${e.message}`);
    for (const [i, p] of openPages.entries()) await p.screenshot({ path: `${SHOTS}/FAIL-${i}.png`, fullPage: true }).catch(() => undefined);
    console.log(`FAIL ${name}\n${e.stack}`);
    throw e;
  }
};

async function newPage(viewport = { width: 390, height: 844 }) {
  const context = await browser.newContext({ viewport, acceptDownloads: true, hasTouch: viewport.width < 600 });
  const page = await context.newPage();
  openPages.push(page);
  page.setDefaultTimeout(15_000);
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error' && !/Failed to load resource|ERR_INTERNET_DISCONNECTED|WebChannelConnection|Could not reach Cloud Firestore/.test(m.text())) errors.push(`console: ${m.text()}`);
  });
  return { context, page };
}

const shot = (page, name) => page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true });

async function signUp(page, name, email, intent) {
  await page.goto(`${BASE}#/signup`);
  await page.getByLabel('Your name').fill(name);
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill('correct-horse-9');
  await page.getByRole('button', { name: 'Create account' }).click();
  await page.getByRole('radio', { name: new RegExp(intent) }).click();
  await page.getByRole('button', { name: 'Continue' }).click();
}

async function signOut(page) {
  await page.goto(`${BASE}#/settings`);
  await page.getByRole('button', { name: 'Sign out' }).click();
  await page.waitForURL(/signin/);
}

let pid;
let inviteUrl;
let inspectionUrl;

try {
  // ---------------- landlord ----------------
  const L = await newPage({ width: 1280, height: 860 });
  await step('landlord signs up and chooses the landlord role', async () => {
    await signUp(L.page, 'Lerato Dlamini', 'lerato@example.com', 'I am a landlord');
    await L.page.getByText('Add your first rental property').waitFor();
    await shot(L.page, '01-landlord-empty-home');
  });

  await step('landlord adds a property with private finance details', async () => {
    await L.page.getByRole('link', { name: 'Add a property' }).first().click();
    await L.page.getByLabel('Name').first().fill('Sea Point flat');
    await L.page.getByLabel('Street address').fill('12 Beach Road');
    await L.page.getByLabel('Town or city').fill('Cape Town');
    await L.page.getByLabel('Purchase price').fill('1500000');
    await L.page.getByLabel(/Bond balance/).fill('1 200 000');
    await L.page.getByLabel('Estimated market value').fill('1 900 000');
    await shot(L.page, '02-property-form');
    await L.page.getByRole('button', { name: 'Add property' }).click();
    await L.page.waitForURL(/#\/properties\/[a-zA-Z0-9]+$/);
    pid = L.page.url().split('/').pop();
    await L.page.getByText('Ownership and finance').waitFor();
    await L.page.getByText('R 700 000,00').first().waitFor(); // estimated equity = 1.9m - 1.2m
  });

  await step('landlord records a tenancy and sees the escalated rent schedule', async () => {
    await L.page.goto(`${BASE}#/properties/${pid}/tenancies/new`);
    await L.page.getByLabel('Tenant name').fill('Thandi Mokoena');
    await L.page.getByLabel('Start date').fill('2025-02-01');
    await L.page.getByLabel('End date').fill('2027-01-31');
    await L.page.getByLabel('Monthly rent').fill('12000');
    await L.page.getByLabel('Deposit').first().fill('24000');
    await L.page.getByRole('button', { name: 'Add tenancy' }).click();
    await L.page.getByText('Rent schedule').waitFor();
    await L.page.getByRole('button', { name: /Show all/ }).click();
    // 8% from Feb 2026: 12 000 → 12 960
    await L.page.getByText('R 12 960,00').first().waitFor();
    const rows = await L.page.locator('tbody tr').count();
    if (rows !== 24) throw new Error(`expected 24 rent periods, got ${rows}`);
    await shot(L.page, '03-tenancy-schedule');
  });

  await step('landlord creates an invitation link for the tenant', async () => {
    await L.page.goto(`${BASE}#/properties/${pid}?tab=people`);
    await L.page.getByRole('button', { name: 'Invite' }).click();
    await L.page.getByLabel('Link to tenancy').selectOption({ index: 1 });
    await L.page.getByRole('button', { name: 'Create invitation link' }).click();
    const link = L.page.locator('.font-mono').first();
    await link.waitFor();
    inviteUrl = (await link.textContent()).trim();
    if (!inviteUrl.includes('#/invite/')) throw new Error(`bad invite link ${inviteUrl}`);
    await shot(L.page, '04-invitation');
    await L.page.keyboard.press('Escape');
  });

  await step('dashboard shows portfolio figures', async () => {
    await L.page.goto(BASE);
    await L.page.getByText('Your portfolio').waitFor();
    await L.page.getByText('100%').waitFor(); // occupancy: one property with an active lease
    await shot(L.page, '05-landlord-dashboard');
  });
  await signOut(L.page);

  // ---------------- tenant ----------------
  const T = await newPage();
  await step('tenant opens the invitation, signs up, and accepts', async () => {
    await T.page.goto(inviteUrl.replace(/^https?:\/\/[^/]+\//, BASE));
    await T.page.waitForURL(/signin/);
    await T.page.getByRole('link', { name: 'Create an account' }).click();
    await T.page.getByLabel('Your name').fill('Thandi Mokoena');
    await T.page.getByLabel('Email').fill('thandi@example.com');
    await T.page.getByLabel('Password').fill('correct-horse-9');
    await T.page.getByRole('button', { name: 'Create account' }).click();
    await T.page.getByRole('radio', { name: /I am a tenant/ }).click();
    await T.page.getByRole('button', { name: 'Continue' }).click();
    await T.page.getByText('Lerato Dlamini invited you').waitFor();
    await shot(T.page, '06-accept-invite');
    await T.page.getByRole('button', { name: 'Accept invitation' }).click();
    await T.page.waitForURL(new RegExp(`#/properties/${pid}$`));
  });

  await step('tenant sees the property and tenancy but not the owner’s finances', async () => {
    await T.page.getByText('Thandi Mokoena').first().waitFor();
    if (await T.page.getByText('Ownership and finance').count()) throw new Error('tenant can see owner finance card');
    if (await T.page.getByText('R 700 000,00').count()) throw new Error('tenant can see equity');
    await shot(T.page, '07-tenant-property');
  });

  await step('tenant starts an ingoing inspection, marks items and adds a photo', async () => {
    await T.page.goto(`${BASE}#/properties/${pid}/inspections/new?type=ingoing`);
    await T.page.getByRole('button', { name: /Start inspection/ }).click();
    await T.page.waitForURL(/inspections\/[a-z0-9]+$/i);
    inspectionUrl = T.page.url();
    await shot(T.page, '08-inspection-overview');
    await T.page.getByRole('link', { name: /Entrance/ }).first().click();
    await T.page.getByRole('radiogroup', { name: 'Condition of Security gate' }).getByRole('radio', { name: 'Good' }).click();
    await T.page.getByRole('radiogroup', { name: 'Condition of Intercom' }).getByRole('radio', { name: 'Defective' }).click();
    const what = T.page.getByLabel('What’s wrong');
    await what.fill('Handset cracked, no audio from the street side');
    await what.blur();
    await T.page.getByRole('radio', { name: 'Major' }).click();
    // photo on the intercom item (the first file input inside the expanded item)
    await T.page.getByLabel('Add photo or video').first().setInputFiles('scripts/fixtures/tap.jpg');
    await T.page.getByRole('button', { name: /Open evidence EV-/ }).first().waitFor({ timeout: 30_000 });
    await shot(T.page, '09-room-checklist');
  });

  await step('evidence viewer separates server time from claimed capture time', async () => {
    await T.page.getByRole('button', { name: /Open evidence EV-/ }).first().click();
    await T.page.getByText('Uploaded (server time)').waitFor();
    await T.page.getByText('Taken (camera metadata)').waitFor();
    await T.page.getByText(/days after the claimed capture time/).waitFor(); // fixture claims Jan 2025
    await shot(T.page, '10-evidence-viewer');
    await T.page.keyboard.press('Escape');
  });

  await step('photos taken offline are kept on the device and upload on reconnect', async () => {
    await T.context.setOffline(true);
    await T.page.getByRole('radiogroup', { name: 'Condition of Doorbell' }).getByRole('radio', { name: 'Not tested' }).click();
    await T.page.getByLabel('Add photo or video').last().setInputFiles('scripts/fixtures/tap.jpg');
    await T.page.getByText('Saved offline').waitFor();
    await shot(T.page, '11-offline');
    await T.context.setOffline(false);
    await T.page.evaluate(() => window.dispatchEvent(new Event('online')));
    await T.page.waitForFunction(() => document.querySelectorAll('[aria-label^="Open evidence EV-"]').length >= 2, null, { timeout: 30_000 });
  });

  await step('remaining items can be marked only by an explicit choice', async () => {
    await T.page.getByRole('button', { name: 'Mark remaining…' }).click();
    await T.page.getByRole('button', { name: 'I checked them: all good' }).click();
    await T.page.getByText(/marked good/).waitFor();
  });

  await step('review warns about unchecked items, then completes with server time and hash', async () => {
    await T.page.goto(`${inspectionUrl}/review`);
    await T.page.getByText(/items not inspected/).waitFor();
    const complete = T.page.getByRole('button', { name: 'Complete inspection' });
    if (await complete.isEnabled()) throw new Error('completion allowed without confirming unchecked items');
    await T.page.getByRole('checkbox').first().check();
    await shot(T.page, '12-review');
    await complete.click();
    await T.page.waitForURL(/report$/);
    await T.page.getByText('Content hash').waitFor();
  });

  await step('PDF report downloads and is a real PDF with the evidence', async () => {
    const [dl] = await Promise.all([T.page.waitForEvent('download', { timeout: 60_000 }), T.page.getByRole('button', { name: 'Download PDF' }).click()]);
    const path = `${SHOTS}/report.pdf`;
    await dl.saveAs(path);
    const bytes = readFileSync(path);
    if (bytes.subarray(0, 5).toString() !== '%PDF-') throw new Error('not a PDF');
    if (bytes.length < 20_000) throw new Error(`PDF suspiciously small: ${bytes.length}`);
    await shot(T.page, '13-report');
  });

  await step('tenant signs, acknowledging receipt but disputing a finding', async () => {
    await T.page.goto(`${inspectionUrl}/sign`);
    await T.page.getByRole('checkbox').first().check();
    await T.page.getByRole('radio', { name: /I partly agree/ }).click();
    await T.page.getByRole('checkbox', { name: /Entrance: Intercom/ }).check();
    await T.page.getByLabel('Explain what you dispute').fill('The intercom was already broken when I moved in.');
    await T.page.getByLabel(/Signature area/).scrollIntoViewIfNeeded();
    const box = await T.page.getByLabel(/Signature area/).boundingBox();
    await T.page.mouse.move(box.x + 30, box.y + 100);
    await T.page.mouse.down();
    for (let k = 0; k < 12; k++) await T.page.mouse.move(box.x + 40 + k * 18, box.y + 60 + (k % 2) * 50);
    await T.page.mouse.up();
    await shot(T.page, '14-sign');
    await T.page.getByRole('button', { name: 'Sign', exact: true }).click();
    await T.page.waitForURL(/report$/);
    await T.page.getByText('Partly agrees').first().waitFor();
  });

  await step('tenant shares the completed inspection with the landlord’s team', async () => {
    await T.page.goto(inspectionUrl);
    await T.page.getByRole('button', { name: 'Sharing' }).click();
    await T.page.getByRole('switch', { name: /Share with the property owner’s team/ }).click();
    await T.page.getByRole('button', { name: 'Share', exact: true }).click();
    await T.page.getByText('Sharing updated').waitFor();
  });
  await signOut(T.page);

  // ---------------- landlord again ----------------
  await step('landlord sees the shared inspection, cannot edit it, and counter-signs', async () => {
    await L.page.goto(`${BASE}#/signin`);
    await L.page.getByLabel('Email').fill('lerato@example.com');
    await L.page.getByLabel('Password').fill('correct-horse-9');
    await L.page.getByRole('button', { name: 'Sign in' }).click();
    await L.page.getByText('Your portfolio').waitFor();
    await L.page.goto(`${BASE}#/properties/${pid}?tab=inspections`);
    await L.page.getByText('Ingoing (move-in) inspection').first().click();
    await L.page.getByText('Record integrity').waitFor();
    const inspection = L.page.url();
    await L.page.getByRole('link', { name: /Entrance/ }).first().click();
    await L.page.getByText(/findings are locked/).waitFor();
    if (await L.page.getByRole('radiogroup', { name: /Condition of/ }).count()) throw new Error('landlord can edit the tenant’s findings');
    await L.page.goto(inspection);
    await L.page.getByRole('link', { name: 'Sign' }).first().click();
    await L.page.getByRole('checkbox').first().check();
    await L.page.getByRole('radio', { name: /I agree/ }).click();
    await L.page.getByLabel(/Signature area/).scrollIntoViewIfNeeded();
    const box = await L.page.getByLabel(/Signature area/).boundingBox();
    await L.page.mouse.move(box.x + 30, box.y + 80);
    await L.page.mouse.down();
    for (let k = 0; k < 10; k++) await L.page.mouse.move(box.x + 50 + k * 25, box.y + 50 + (k % 2) * 40);
    await L.page.mouse.up();
    await L.page.getByRole('button', { name: 'Sign', exact: true }).click();
    await L.page.waitForURL(/report$/);
    await L.page.getByText('Agrees with the findings').waitFor();
    await shot(L.page, '15-report-two-signatures');
  });

  await step('the activity log records the events with server times', async () => {
    await L.page.goto(`${BASE}#/properties/${pid}?tab=activity`);
    for (const text of ['accepted an invitation', 'completed', 'acknowledged', 'uploaded EV-']) await L.page.getByText(new RegExp(text)).first().waitFor();
    await shot(L.page, '16-activity');
  });

  await step('dark mode renders', async () => {
    await L.page.goto(`${BASE}#/settings`);
    await L.page.getByRole('radio', { name: 'Dark' }).click();
    await L.page.goto(BASE);
    await L.page.getByText('Your portfolio').waitFor();
    await shot(L.page, '17-dark-dashboard');
  });

  if (errors.length) throw new Error(`Browser errors:\n${errors.join('\n')}`);
  console.log(`\nAll ${steps.length} end-to-end steps passed.`);
} catch (e) {
  console.error(`\nE2E failed: ${e.message}`);
  if (errors.length) console.error(errors.join('\n'));
  process.exitCode = 1;
} finally {
  writeFileSync(`${SHOTS}/steps.txt`, steps.join('\n') + (errors.length ? `\n\nBrowser errors:\n${errors.join('\n')}` : '') + '\n');
  await browser.close();
  server.kill();
  process.exit(process.exitCode ?? 0);
}
