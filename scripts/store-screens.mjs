// Store screenshots: fills the app (on the emulators) with realistic sample data, captures phone screens, then
// frames each with a headline. Output: docs/store/screenshots/{ios-6.9,android}/ and docs/store/feature-graphic.png.
//   npm run store:screens
import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync } from 'node:fs';
import { chromium } from 'playwright';

const PORT = 5183;
const BASE = `http://127.0.0.1:${PORT}/`;
const RAW = 'test-results/store-raw';
const OUT = 'docs/store/screenshots';
for (const d of [RAW, `${OUT}/ios-6.9`, `${OUT}/android`]) mkdirSync(d, { recursive: true });

const server = spawn('node_modules/.bin/vite', ['--port', String(PORT), '--strictPort', '--host', '127.0.0.1'], { env: { ...process.env, VITE_USE_EMULATORS: 'true' }, stdio: ['ignore', 'pipe', 'pipe'] });
await new Promise((r) => server.stdout.on('data', (d) => String(d).includes('Local') && r()));
const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 430, height: 932 }, deviceScaleFactor: 3, hasTouch: true });
const page = await ctx.newPage();
page.setDefaultTimeout(20_000);
const raw = async (name) => {
  await page.waitForTimeout(700);
  await page.screenshot({ path: `${RAW}/${name}.png` });
};

async function addProperty(name, line1, city, type, opts = {}) {
  await page.goto(`${BASE}#/properties/new?kind=landlord`);
  await page.getByLabel('Name').first().fill(name);
  await page.getByRole('radio', { name: type, exact: true }).click();
  await page.getByLabel('Street address').fill(line1);
  await page.getByLabel('Town or city').fill(city);
  if (opts.price) await page.getByLabel('Purchase price').fill(opts.price);
  if (opts.value) await page.getByLabel('Estimated market value').fill(opts.value);
  if (opts.bond) await page.getByLabel(/Bond balance/).fill(opts.bond);
  await page.getByRole('button', { name: 'Add property' }).click();
  await page.waitForURL(/#\/properties\/[A-Za-z0-9]+$/);
  return page.url().split('/').pop();
}

async function addTenancy(pid, tenant, start, end, rent) {
  await page.goto(`${BASE}#/properties/${pid}/tenancies/new`);
  await page.getByLabel('Tenant name').fill(tenant);
  await page.getByLabel('Start date').fill(start);
  await page.getByLabel('End date').fill(end);
  await page.getByLabel('Monthly rent').fill(rent);
  await page.getByLabel('Deposit').first().fill(String(Number(rent) * 2));
  await page.getByRole('button', { name: 'Add tenancy' }).click();
  await page.getByText('Rent schedule').waitFor();
  return page.url().split('/').pop();
}

try {
  await page.goto(`${BASE}#/signup`);
  await page.getByLabel('Your name').fill('Lerato Dlamini');
  await page.getByLabel('Email').fill('lerato@example.com');
  await page.getByLabel('Password').fill('correct-horse-9');
  await page.getByRole('button', { name: 'Create account' }).click();
  await page.getByRole('radio', { name: /I am a landlord/ }).click();
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByText('Your portfolio').waitFor();

  const today = new Date();
  const iso = (d) => d.toISOString().slice(0, 10);
  const plus = (days) => iso(new Date(today.getTime() + days * 86400000));
  const p1 = await addProperty('Sea Point flat', '12 Beach Road', 'Cape Town', 'Apartment', { price: '1850000', value: '2400000', bond: '1300000' });
  const t1 = await addTenancy(p1, 'Thandi Mokoena', plus(-300), plus(65), '14500');
  const p2 = await addProperty('Observatory cottage', '4 Lower Main Road', 'Cape Town', 'House');
  await addTenancy(p2, 'Daniel Pillay', plus(-500), plus(230), '11800');
  const p3 = await addProperty('Rosebank studio', '22 Tyrwhitt Avenue', 'Johannesburg', 'Apartment');
  await addTenancy(p3, 'Aisha Khan', plus(-40), plus(325), '9200');
  await addProperty('Durbanville townhouse', '9 Wellington Road', 'Cape Town', 'Townhouse');

  await page.goto(BASE);
  await page.getByText('Your portfolio').waitFor();
  await raw('1-dashboard');

  // ingoing inspection with findings and photos
  await page.goto(`${BASE}#/properties/${p1}/inspections/new?type=ingoing&tenancy=${t1}`);
  await page.getByRole('button', { name: /Start inspection/ }).click();
  await page.waitForURL(/inspections\/[a-z0-9]+$/i);
  const inspection = page.url();
  await page.getByRole('link', { name: /Kitchen/ }).first().click();
  const mark = async (item, c) => page.getByRole('radiogroup', { name: `Condition of ${item}` }).getByRole('radio', { name: c }).click();
  for (const i of ['Cupboard doors', 'Cupboard hinges', 'Cupboard interiors', 'Drawers and runners', 'Countertops', 'Splashback and tiles']) await mark(i, 'Good');
  await mark('Sink', 'Good');
  await mark('Taps', 'Defective');
  const what = page.getByLabel('What’s wrong');
  await what.fill('Cold tap drips constantly; handle loose');
  await what.blur();
  await page.getByRole('radio', { name: 'Moderate' }).click();
  await page.getByLabel('Add photo or video').first().setInputFiles('scripts/fixtures/tap.jpg');
  await page.getByRole('button', { name: /Open evidence EV-/ }).first().waitFor({ timeout: 30_000 });
  await mark('Drainage', 'Good');
  await mark('Visible leaks under sink', 'Not tested');
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.getByRole('heading', { name: /Kitchen/ }).first().scrollIntoViewIfNeeded();
  await raw('3-room');
  await page.getByRole('button', { name: /Open evidence EV-/ }).first().click();
  await page.getByText('Uploaded (server time)').waitFor();
  await raw('4-evidence');
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Mark remaining…' }).click();
  await page.getByRole('button', { name: 'I checked them: all good' }).click();
  for (const room of ['Entrance', 'Living room']) {
    await page.goto(inspection);
    await page.getByRole('link', { name: new RegExp(room) }).first().click();
    await page.getByRole('button', { name: 'Mark remaining…' }).click();
    await page.getByRole('button', { name: 'I checked them: all good' }).click();
    await page.waitForTimeout(300);
  }
  await page.goto(inspection);
  await page.getByText(/items checked/).waitFor();
  await raw('2-inspection');

  await page.goto(`${BASE}#/properties/${p1}/tenancies/${t1}`);
  await page.getByText('Rent schedule').waitFor();
  await raw('5-rent');

  await page.goto(`${inspection}/review`);
  await page.getByRole('checkbox').first().check();
  await page.getByRole('button', { name: 'Complete inspection' }).click();
  await page.waitForURL(/report$/);
  await page.getByText('Content hash').waitFor();
  await raw('6-report');
} finally {
  await ctx.close();
}

// ---- frame the screens ----
const SHOTS = [
  ['1-dashboard', 'Your whole portfolio', 'at a glance'],
  ['2-inspection', 'Inspect every room,', 'step by step'],
  ['3-room', 'Every item marked.', 'Nothing assumed.'],
  ['4-evidence', 'Photo evidence with', 'server timestamps'],
  ['5-rent', 'Rent schedules', 'calculated for you'],
  ['6-report', 'Locked reports both', 'sides can sign'],
];
const font = readFileSync('node_modules/@fontsource-variable/fraunces/files/fraunces-latin-wght-normal.woff2').toString('base64');
const frame = (img, a, b, w, h) => `<!doctype html><html><head><style>
@font-face{font-family:F;src:url(data:font/woff2;base64,${font})}
html,body{margin:0;width:${w}px;height:${h}px;background:#faf7ef;overflow:hidden}
.wrap{display:flex;flex-direction:column;align-items:center;height:100%}
h1{font:600 ${Math.round(w * 0.072)}px/1.12 F,Georgia,serif;color:#111;text-align:center;margin:${Math.round(h * 0.06)}px 0 0;letter-spacing:-.01em}
h1 span{color:#1f4d3a}
.phone{margin-top:${Math.round(h * 0.045)}px;width:${Math.round(w * 0.8)}px;border-radius:${Math.round(w * 0.075)}px;border:${Math.round(w * 0.016)}px solid #111;overflow:hidden;box-shadow:0 30px 80px rgba(31,77,58,.25);background:#fff}
.phone img{display:block;width:100%}
</style></head><body><div class="wrap"><h1>${a}<br><span>${b}</span></h1><div class="phone"><img src="data:image/png;base64,${img}"></div></div></body></html>`;

const fp = await browser.newPage();
for (const [name, a, b] of SHOTS) {
  const img = readFileSync(`${RAW}/${name}.png`).toString('base64');
  for (const [dir, w, h] of [['ios-6.9', 1320, 2868], ['android', 1080, 1920]]) {
    await fp.setViewportSize({ width: w, height: h });
    await fp.setContent(frame(img, a, b, w, h));
    await fp.waitForTimeout(150);
    await fp.screenshot({ path: `${OUT}/${dir}/${name}.png` });
  }
}
// Google Play feature graphic 1024x500
const mark = readFileSync('assets/brand/logo-mark.svg').toString('base64');
await fp.setViewportSize({ width: 1024, height: 500 });
await fp.setContent(`<!doctype html><html><head><style>@font-face{font-family:F;src:url(data:font/woff2;base64,${font})}
body{margin:0;width:1024px;height:500px;background:#1f4d3a;display:flex;align-items:center;gap:44px;padding:0 80px;box-sizing:border-box;font-family:F,serif;color:#fbf8f1}
img{width:170px;height:170px;border-radius:40px;box-shadow:0 0 0 6px #fbf8f1}h1{font-size:72px;margin:0;font-weight:600}h1 span{color:#b9d9c6}p{font-size:30px;margin:10px 0 0;opacity:.9}</style></head>
<body><img src="data:image/svg+xml;base64,${mark}"><div><h1>Home<span>Ledger</span></h1><p>Rental inspections and records,<br>organised and documented.</p></div></body></html>`);
await fp.waitForTimeout(200);
await fp.screenshot({ path: 'docs/store/feature-graphic.png' });
await browser.close();
server.kill();
console.log('Store screenshots written to docs/store/');
process.exit(0);
