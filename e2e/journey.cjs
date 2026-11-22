/*
 * Browser walkthrough of the guided demo, as a first-time reviewer would do it:
 * welcome → public match → Badla booked with Smart Fixture → lock-screen push →
 * fixture day 1-1 → Grudge Night with backup → Dev's pick → Team Riya 2-1.
 *   npm run dev   (or npm run build && npm run preview -- --port 5173)
 *   BASE_URL=http://localhost:5173 npm run e2e
 * Needs the `playwright` package.
 */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const BASE = process.env.BASE_URL || 'http://localhost:5173';
const OUT = path.join(__dirname, 'screenshots');
fs.mkdirSync(OUT, { recursive: true });
const errors = [];
let n = 0;

async function shot(page, name, whole) {
  n += 1;
  const file = path.join(OUT, `${String(n).padStart(2, '0')}-${name}.png`);
  if (whole) await page.screenshot({ path: file });
  else await page.locator('.phone').screenshot({ path: file });
}
const see = (page, text, timeout = 8000) => page.getByText(text, { exact: false }).first().waitFor({ state: 'visible', timeout });
const tap = (page, name, exact = false) => page.getByRole('button', { name, exact }).first().click();

/** Finish a sign-in card that the story handoff (or a push) opened. */
async function unlock(page, who) {
  const pin = page.locator('.pin input');
  const done = page.locator('.acct-trigger', { hasText: who });
  await Promise.race([pin.waitFor({ timeout: 4000 }), done.waitFor({ timeout: 4000 })]).catch(() => {});
  if (await pin.count()) {
    await page.locator('.signin').getByRole('button', { name: 'Fill it' }).click();
    await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  }
  await page.locator('.acct-trigger', { hasText: who }).waitFor();
}
/** The story panel's Next: hands the phone over via the account pane, never acts for anyone. */
async function next(page) {
  await page.locator('.story-next').click();
}
async function handTo(page, who) {
  if (await page.locator('.acct-trigger .tb-name', { hasText: who }).count()) return;
  await page.locator('.acct-trigger').click();
  await page.locator('.acct', { hasText: who }).first().click();
  await unlock(page, who);
}
async function pulse(page, key) {
  await page.locator(`[data-story="${key}"]`).first().click();
}
async function noClip(page, label) {
  const bad = await page.evaluate(() => {
    const out = [];
    const w = document.documentElement.clientWidth;
    if (document.documentElement.scrollWidth > w + 1) out.push('horizontal scroll');
    return out;
  });
  if (bad.length) throw new Error(`${label}: ${bad.join(', ')}`);
}

async function guided(browser, viewport, tag) {
  const page = await browser.newPage({ viewport, deviceScaleFactor: 2 });
  page.on('console', (m) => m.type() === 'error' && errors.push(`${tag}: ${m.text()}`));
  page.on('pageerror', (e) => errors.push(`${tag}: ${e.message}`));
  page.on('request', (r) => { if (!r.url().startsWith(BASE) && !r.url().startsWith('data:')) errors.push(`${tag}: network call ${r.url()}`); });
  await page.goto(BASE);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  const t0 = Date.now();

  // Welcome
  await see(page, 'Badla: turn a capture into a rivalry.');
  await shot(page, `${tag}-welcome`, true);
  await tap(page, 'Start guided demo');
  await see(page, 'Now on Riya');
  await unlock(page, 'Riya');
  await see(page, 'Level 14');
  await page.locator('.player-card', { hasText: '1,000' }).waitFor();
  await shot(page, `${tag}-home`);
  await noClip(page, 'home');

  // Ch1: public match
  await pulse(page, 'quick');
  await see(page, 'Finding an opponent');
  await see(page, 'Matched with Gunjan', 6000);
  await pulse(page, 'public-roll');
  await pulse(page, 'public-move');
  await see(page, 'sent Riya home', 6000);
  await see(page, 'so close');
  await shot(page, `${tag}-capture`);
  await pulse(page, 'public-ff');
  await see(page, 'Gunjan sent you home 1 square from the finish. Take Badla?', 8000);
  await see(page, '✨ Smart Fixture');
  await shot(page, `${tag}-result`);

  // Ch2–3: Take Badla, book with Smart Fixture
  await pulse(page, 'take-badla');
  await see(page, 'You both usually play around 20:00');
  await shot(page, `${tag}-smart`);
  await page.locator('.smart-tag').click();
  await see(page, 'Tomorrow is a day Riya usually skips.');
  await pulse(page, 'send-challenge');
  await see(page, 'This invitation is for Gunjan');

  // Ch4: offline invite → lock screen push → unlock as Gunjan
  await next(page);
  await see(page, "Gunjan's phone");
  await see(page, 'You sent her home 1 square from the finish');
  await shot(page, `${tag}-lock`);
  await page.locator('.push-card').first().click();
  await unlock(page, 'Gunjan');
  await see(page, 'Riya wants Badla.');
  await pulse(page, 'accept-challenge');
  await see(page, 'Your Badla is booked');
  await shot(page, `${tag}-booked`);
  await pulse(page, 'skip-ahead');
  await see(page, 'Waiting table');

  // Ch5: fixture day
  for (const who of ['Riya', 'Gunjan']) {
    await next(page);
    await unlock(page, who);
    await pulse(page, 'ready');
  }
  await next(page);
  await unlock(page, 'Riya');
  await pulse(page, 'roll');
  await pulse(page, 'move');
  await see(page, 'Riya win');
  await tap(page, 'See your result');
  await see(page, 'Make it a Grudge Night');
  await shot(page, `${tag}-one-each`);

  // Ch6: Grudge Night with backup
  await pulse(page, 'grudge-night');
  await pulse(page, 'grudge-night'); // "Offer this slot"
  for (let i = 0; i < 8; i++) {
    const text = await page.locator('.step-text').innerText();
    if (/club card|Jump to Grudge Night/i.test(text)) break;
    await next(page);
    const who = await page.locator('.handoff p').innerText({ timeout: 2000 }).catch(() => null);
    if (who) await unlock(page, who.replace(/^Now on (\w+)'s phone$/, '$1'));
    const target = await page.locator('.story-pulse').first();
    if (await target.count()) {
      if ((await target.getAttribute('data-story')) === 'invite-partner') {
        await target.click();
        await page.locator('.pick button').first().click();
      } else await target.click();
    }
    await page.waitForTimeout(300);
  }
  // Ch7: Dev picks
  await next(page);
  await unlock(page, 'Dev');
  await see(page, 'Riya & Ananya');
  await shot(page, `${tag}-club`);
  await pulse(page, 'pick-side');
  await see(page, 'Your pick is in.');
  await next(page); // "Next day, 21:00"
  await see(page, 'Ready up', 8000).catch(() => {});
  for (let i = 0; i < 12; i++) {
    const text = await page.locator('.step-text').innerText();
    if (/Series over/.test(text)) break;
    await next(page);
    const who = await page.locator('.handoff p').innerText({ timeout: 2000 }).catch(() => null);
    if (who) await unlock(page, who.replace(/^Now on (\w+)'s phone$/, '$1'));
    const target = page.locator('.story-pulse').first();
    if (await target.count()) await target.click();
    await page.waitForTimeout(400);
  }
  await next(page);
  await see(page, /Riya wins the series 2.1/);
  await shot(page, `${tag}-series-end`);
  const show = page.locator('.story-toggle', { hasText: 'Show' });
  if (await show.isVisible()) await show.click();
  await page.locator('.story-head').getByRole('tab', { name: 'Model' }).click();
  await shot(page, `${tag}-full`, true);
  const secs = Math.round((Date.now() - t0) / 1000);
  console.log(`${tag}: guided demo reached the series result in ${secs}s of automated clicking`);
  await noClip(page, 'end');
  await page.close();
}

(async () => {
  const browser = await chromium.launch();
  try {
    await guided(browser, { width: 1360, height: 960 }, 'desktop');
    await guided(browser, { width: 390, height: 844 }, 'mobile');
  } finally {
    await browser.close();
  }
  if (errors.length) { console.error(errors.join('\n')); process.exit(1); }
  console.log(`All journeys passed. Screenshots in ${OUT}`);
})().catch((e) => { console.error(e); process.exit(1); });
