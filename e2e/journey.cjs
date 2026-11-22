/*
 * Browser walkthrough of the full two-day story, signing in as each player
 * through the account pane, exactly as a reviewer would.
 *   npm run dev            (or: npm run build && npm run preview -- --port 5173)
 *   BASE_URL=http://localhost:5173 npm run e2e
 * Needs the `playwright` package.
 */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const BASE = process.env.BASE_URL || 'http://localhost:5173';
const OUT = path.join(__dirname, 'screenshots');
fs.mkdirSync(OUT, { recursive: true });
const PINS = { Gunjan: '1111', Riya: '2222', Ananya: '3333', Shruti: '4444', Dev: '5555' };
const errors = [];
let n = 0;

async function shot(page, name) {
  n += 1;
  await page.locator('.phone').screenshot({ path: path.join(OUT, `${String(n).padStart(2, '0')}-${name}.png`) });
}
async function see(page, text, timeout = 6000) {
  await page.getByText(text, { exact: false }).first().waitFor({ state: 'visible', timeout });
}
async function tap(page, name, opts = {}) {
  await page.getByRole('button', { name, exact: !!opts.exact }).first().click();
}

/** The only way to change player: the account pane. */
async function as(page, who) {
  if (await page.locator('.acct-trigger .tb-name', { hasText: who }).count()) return;
  await page.locator('.acct-trigger').click();
  const row = page.locator('.acct', { hasText: who }).first();
  await row.click();
  const pin = page.locator('.pin input');
  if (await pin.isVisible().catch(() => false)) {
    await pin.fill(PINS[who]);
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  }
  await page.locator('.scrim').waitFor({ state: 'detached' });
  await page.locator('.acct-trigger', { hasText: who }).waitFor();
}
async function home(page) {
  await page.locator('.bottom-nav').getByRole('button', { name: 'Home' }).click();
}
async function pending(page, label) {
  await home(page);
  await page.locator('.todo-row', { hasText: label }).first().click();
}
async function playTurn(page, who) {
  await as(page, who);
  await pending(page, 'Your turn');
  await tap(page, 'Roll', { exact: true });
  const move = page.getByRole('button', { name: /^Move \d$/ });
  if (await move.isVisible().catch(() => false)) await move.click();
  await page.waitForTimeout(450);
}
async function noClip(page, label) {
  const bad = await page.evaluate(() => {
    const out = [];
    const w = document.documentElement.clientWidth;
    if (document.documentElement.scrollWidth > w + 1) out.push('horizontal scroll');
    document.querySelectorAll('.phone button').forEach((b) => {
      const r = b.getBoundingClientRect();
      if (r.width && (r.left < -1 || r.right > w + 1)) out.push(`clipped: ${b.textContent.trim()}`);
    });
    return out;
  });
  if (bad.length) throw new Error(`${label}: ${bad.join(', ')}`);
}

async function story(browser, viewport, tag) {
  const page = await browser.newPage({ viewport, deviceScaleFactor: 2 });
  page.on('console', (m) => m.type() === 'error' && errors.push(`${tag}: ${m.text()}`));
  page.on('pageerror', (e) => errors.push(`${tag}: ${e.message}`));
  page.on('request', (r) => { if (!r.url().startsWith(BASE) && !r.url().startsWith('data:')) errors.push(`${tag}: network call to ${r.url()}`); });
  await page.goto(BASE);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await see(page, 'Signed out');
  await see(page, 'Sun 22 Nov, 8:14 pm IST');

  // Day 1 — screen 1: Riya's opening result
  await as(page, 'Riya');
  await tap(page, /Take Badla/);
  await see(page, 'Gunjan caught you one square from home.', 8000);
  await shot(page, `${tag}-01-opening`);
  await noClip(page, 'opening');
  await tap(page, 'Take Badla', { exact: true });
  // Screen 2: challenge sheet
  await see(page, 'Badla Doubles · You pay 100 · Win 200 back');
  await shot(page, `${tag}-02-challenge`);
  await tap(page, /Send to Gunjan/);
  await see(page, 'This invitation is for Gunjan');
  await see(page, 'Waiting for Gunjan to accept');

  // Screen 3: Gunjan receives it in her own session
  await as(page, 'Gunjan');
  await pending(page, 'Badla challenge');
  await see(page, 'Riya wants Badla.');
  await shot(page, `${tag}-03-received`);
  await tap(page, /Accept · 100 gold/);
  // Screen 4: seat board
  await see(page, '2 of 4 seats filled');
  await tap(page, 'Invite a partner');
  await tap(page, 'Invite Shruti');
  await as(page, 'Riya');
  await home(page);
  await tap(page, 'Open round');
  await tap(page, 'Invite a partner');
  await tap(page, 'Invite Ananya');
  await shot(page, `${tag}-04-seats`);

  // Screen 5: partner invitations, each in their own session
  await as(page, 'Ananya');
  await pending(page, 'Partner invitation');
  await see(page, 'Riya is down 0-1 to Gunjan. Join her side?');
  await see(page, 'Entry');
  await shot(page, `${tag}-05-partner`);
  await tap(page, /Join Riya's side/);
  await as(page, 'Shruti');
  await pending(page, 'Partner invitation');
  await see(page, 'Gunjan is 1-0 up on Riya');
  await tap(page, /Join Gunjan's side/);

  // Screen 6: waiting table, Ready per seat
  await see(page, 'Waiting table');
  await see(page, /left/);
  await tap(page, /Ready · 100 gold/);
  await shot(page, `${tag}-06-table`);
  for (const who of ['Ananya', 'Gunjan', 'Riya']) {
    await as(page, who);
    await pending(page, 'Ready up');
    await tap(page, /Ready · 100 gold/);
  }

  // Screen 7: the Doubles endgame, each seat on its own turn
  await see(page, 'Quick endgame · demo variant');
  await shot(page, `${tag}-07-endgame`);
  await noClip(page, 'endgame');
  await playTurn(page, 'Riya');
  await playTurn(page, 'Gunjan');
  await as(page, 'Ananya');
  await pending(page, 'Your turn');
  await see(page, 'you need exactly 2');
  await tap(page, 'Roll', { exact: true });
  await tap(page, /^Move 2$/);
  await see(page, 'Riya & Ananya win');

  // Screen 8: personal receipts
  await tap(page, 'See your result');
  await see(page, /You helped Riya take it to 1.1/);
  await shot(page, `${tag}-08-assist`);
  await tap(page, 'Save my seat for the decider');
  await as(page, 'Shruti');
  await pending(page, 'Result receipt');
  await see(page, 'One each. Defend the series with Gunjan?');

  // Screen 9: book the decider
  await as(page, 'Riya');
  await pending(page, 'Result receipt');
  await tap(page, 'Host Grudge Night');
  await tap(page, /Offer this slot/);
  await see(page, 'Waiting for Gunjan to choose a slot');
  await as(page, 'Gunjan');
  await home(page);
  await page.locator('.todo-row').first().click();
  await tap(page, /Choose · confirm 100 gold/);
  await see(page, '2 of 4 confirmed');
  await shot(page, `${tag}-09-booking`);
  for (const who of ['Ananya', 'Shruti']) {
    await as(page, who);
    await pending(page, 'Confirm booking');
    await tap(page, /Confirm · 100 gold entry/);
  }
  await see(page, '4 of 4 confirmed');

  // Screens 10–11: club fixture, Dev picks
  await as(page, 'Dev');
  await see(page, 'Gunjan & Shruti');
  await see(page, 'Pick a side');
  await shot(page, `${tag}-10-fixture`);
  await page.locator('.fixture .seg button', { hasText: 'Riya & Ananya' }).first().click();
  await see(page, 'Your pick is in. Result tomorrow.');
  await page.reload(); // the pick persists
  await see(page, 'Your pick is in. Result tomorrow.');

  // Screen 12: match day
  await page.getByRole('button', { name: 'Demo controls' }).click();
  await tap(page, "Jump to tomorrow's slot");
  await page.keyboard.press('Escape');
  await see(page, 'Mon 23 Nov, 9:00 pm IST');
  await see(page, 'Predictions locked');
  for (const who of ['Riya', 'Gunjan', 'Ananya', 'Shruti']) {
    await as(page, who);
    await pending(page, 'Ready up');
    await tap(page, /Ready · 100 gold/);
  }
  for (const who of ['Riya', 'Gunjan', 'Ananya', 'Shruti']) await playTurn(page, who);
  await see(page, 'Gunjan & Shruti win');
  await tap(page, 'See your result');
  await see(page, /Gunjan & Shruti win the series 2.1/);
  await as(page, 'Dev');
  await page.locator('.bottom-nav').getByRole('button', { name: 'Club' }).click();
  await see(page, 'Gunjan & Shruti win the series');
  await see(page, 'You picked Riya & Ananya. Not this time.');
  await shot(page, `${tag}-12-club-result`);

  // Ledger: the checkpoint balances, total 5,000
  await page.getByRole('button', { name: 'Demo controls' }).click();
  const ledger = await page.locator('.ledger').innerText();
  for (const v of ['Gunjan\t1,100', 'Riya\t900', 'Ananya\t1,000', 'Shruti\t1,000', 'Dev\t1,000', 'Total\t5,000']) {
    if (!ledger.includes(v)) throw new Error(`ledger missing ${v}:\n${ledger}`);
  }
  await page.keyboard.press('Escape');
  await page.screenshot({ path: path.join(OUT, `${tag}-full.png`), fullPage: false });
  await page.close();
}

async function wrongSession(browser) {
  const page = await browser.newPage({ viewport: { width: 360, height: 740 } });
  page.on('console', (m) => m.type() === 'error' && errors.push(`wrong-session: ${m.text()}`));
  await page.goto(BASE);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByRole('button', { name: 'Demo controls' }).click();
  await page.locator('.drawer select').nth(1).selectOption('5');
  await page.keyboard.press('Escape');
  await as(page, 'Riya');
  // Deep link to Ananya's invitation from Riya's session: read-only
  const id = await page.evaluate(() => Object.values(JSON.parse(localStorage.getItem('badla.v1')).state.invites).find((i) => i.toPlayerId === 'ananya').id);
  await page.evaluate((x) => { window.location.hash = `#/invite/${x}`; }, id);
  await see(page, 'This invitation is for Ananya');
  if (await page.getByRole('button', { name: /Join Riya's side/ }).count()) throw new Error('wrong session could accept');
  await noClip(page, '360 invite');
  await page.close();
}

(async () => {
  const browser = await chromium.launch();
  try {
    await story(browser, { width: 390, height: 844 }, 'mobile');
    await story(browser, { width: 1360, height: 960 }, 'desktop');
    await wrongSession(browser);
  } finally {
    await browser.close();
  }
  if (errors.length) { console.error(errors.join('\n')); process.exit(1); }
  console.log(`All journeys passed. Screenshots in ${OUT}`);
})().catch((e) => { console.error(e); process.exit(1); });
