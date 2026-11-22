/*
 * Clicks through the linear Badla demo: one button per screen, start to finish.
 *   npm run dev   then   npm run e2e   (BASE_URL to override; needs `playwright`)
 */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const BASE = process.env.BASE_URL || 'http://localhost:5173';
const OUT = path.join(__dirname, 'screenshots');
fs.mkdirSync(OUT, { recursive: true });
const errors = [];

async function run(browser, viewport, tag) {
  const page = await browser.newPage({ viewport, deviceScaleFactor: 2 });
  page.on('console', (m) => m.type() === 'error' && errors.push(`${tag}: ${m.text()}`));
  page.on('pageerror', (e) => errors.push(`${tag}: ${e.message}`));
  page.on('request', (r) => { if (!r.url().startsWith(BASE) && !r.url().startsWith('data:')) errors.push(`${tag}: network ${r.url()}`); });
  await page.goto(BASE);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  const total = Number((await page.locator('.lin-panel .eyebrow').innerText()).match(/of (\d+)/i)[1]);
  for (let i = 1; i <= total; i++) {
    const label = await page.locator('.lin-panel .eyebrow').innerText();
    if (!label.toLowerCase().startsWith(`step ${i} of`)) throw new Error(`${tag}: expected step ${i}, saw "${label}"`);
    await page.waitForTimeout(800); // let the handoff card clear
    await page.locator('.phone').screenshot({ path: path.join(OUT, `${tag}-${String(i).padStart(2, '0')}.png`) });
    const w = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    if (w > 1) throw new Error(`${tag}: horizontal scroll on step ${i}`);
    if (i === total) break;
    const cta = page.locator('.phone .lin-cta, .phone .push-card').first();
    await cta.click();
  }
  const text = await page.locator('.phone').innerText();
  if (!/You picked Riya & Ananya\. Riya & Ananya won\./.test(text)) throw new Error(`${tag}: final screen wrong`);
  if (tag === 'desktop') await page.screenshot({ path: path.join(OUT, 'desktop-full.png') });
  await page.close();
}

(async () => {
  const browser = await chromium.launch();
  try {
    await run(browser, { width: 1280, height: 920 }, 'desktop');
    await run(browser, { width: 390, height: 844 }, 'mobile');
  } finally { await browser.close(); }
  if (errors.length) { console.error(errors.join('\n')); process.exit(1); }
  console.log('Clicked through every step on desktop and mobile. Screenshots in', OUT);
})().catch((e) => { console.error(e); process.exit(1); });
