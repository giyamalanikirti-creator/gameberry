const assert = require('node:assert/strict');
const { chromium } = require('playwright');

const BASE = process.env.BASE_URL || 'http://127.0.0.1:5173';
const app = page => page.locator('.rv-phone');
const button = (context, name) => context.getByRole('button', { name, exact: typeof name === 'string' });
const snapshot = page => page.evaluate(() => JSON.parse(localStorage.getItem('badla-rivalry-v1')));
const visible = (context, text) => context.getByText(text, { exact: typeof text === 'string' }).first().waitFor({ state: 'visible' });

async function panel(page) {
  await button(app(page), /^Demo controls, viewing as/).click();
  return page.getByRole('dialog', { name: 'Demo controls', exact: true });
}

async function switchTo(page, name) {
  await button(await panel(page), `View as ${name}`).click();
  await button(app(page), `Demo controls, viewing as ${name}`).waitFor();
}

async function checkWidth(page) {
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), true);
}

async function walk(page) {
  await page.goto(BASE);
  await checkWidth(page);
  await button(app(page), /Riya India · Player profile/).click();
  await visible(page.getByRole('dialog', { name: 'Player profile' }), 'India · RY-1042');
  await page.keyboard.press('Escape');
  await button(app(page), 'Play 1v1').click();
  await button(app(page), 'Roll dice').click();
  await visible(app(page), 'Rolled 2');
  await page.reload();
  assert.equal((await snapshot(page)).state.matches[0].board.die, 2);
  await button(app(page), 'Move token 4').click();
  await switchTo(page, 'Gunjan');
  await button(app(page), 'Roll dice').click();
  await button(app(page), 'Move token 4').click();
  let kaat = page.getByRole('dialog', { name: 'Kaat replay' });
  await visible(kaat, 'You sent Riya back 41 squares');
  await page.keyboard.press('Escape');
  await switchTo(page, 'Riya');
  await button(app(page), 'Replay Kaat').click();
  kaat = page.getByRole('dialog', { name: 'Kaat replay' });
  await visible(kaat, 'Gunjan sent you back 41 squares');
  await page.keyboard.press('Escape');
  await button(app(page), 'Finish remaining demo turns').click();
  await button(app(page), 'View result').click();
  await app(page).getByRole('heading', { name: 'Gunjan wins' }).waitFor();
  await button(app(page), 'Ask for Badla').click();
  await switchTo(page, 'Gunjan');
  await app(page).getByRole('heading', { name: 'Riya wants Badla' }).waitFor();
  await button(app(page), 'Play now').waitFor();
  await button(app(page), 'Pass').waitFor();
  await button(app(page), /^Kal Milte Hain/).click();
  assert.equal((await snapshot(page)).state.cards[0].status, 'proposed');
  await switchTo(page, 'Riya');
  await button(app(page), 'Confirm appointment').click();
  await button(await panel(page), 'Skip to tomorrow').click();
  const lock = page.getByRole('dialog', { name: 'Lock screen' });
  assert.equal((await snapshot(page)).state.activities.filter(item => item.incremental).length, 0);
  await button(lock, 'Your Badla with Gunjan is open').click();
  assert.equal((await snapshot(page)).state.activities.filter(item => item.incremental && item.person === 'riya').length, 1);
  await button(app(page), 'I’m ready').click();
  await switchTo(page, 'Gunjan');
  assert.equal((await snapshot(page)).state.cards[0].ready.length, 1);
  await button(app(page), 'I’m ready').click();
  await switchTo(page, 'Riya');
  await button(app(page), 'Roll dice').click();
  await button(app(page), 'Move token 4').click();
  await button(app(page), 'View result').click();
  await visible(app(page), 'Riya 1–1 Gunjan');
  await button(app(page), 'Rematch?').click();
  await button(app(page), 'Play the decider?').waitFor();
  await button(app(page), 'View rivalry ledger').click();
  await visible(app(page), 'Acquaintance');
  await visible(app(page), '1 settled Badlas');
  await button(app(page), 'Replay last Kaat').waitFor();
  await visible(page, 'Incremental active day · created by Badla');
  await visible(page, '+10.2%');
  await visible(page, '+153K daily users');
  await button(page.getByRole('complementary'), 'Low').click();
  await visible(page, '+5.1%');
  await button(page.getByRole('complementary'), 'High').click();
  await visible(page, '+16.9%');
  await checkWidth(page);
}

async function desktop(page) {
  await page.goto(BASE);
  const bounds = await app(page).boundingBox();
  const pm = await page.getByRole('complementary').boundingBox();
  assert.ok(bounds.x + bounds.width < pm.x);
  await button(app(page), 'Rivals').click();
  await button(app(page), /Shruti Nemesis/).click();
  await button(app(page), 'Join weekly Derby').click();
  await button(app(page), /^Next Derby/).waitFor();
  await button(app(page), 'Rivalry board theme').click();
  await checkWidth(page);
}

(async () => {
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH, args: ['--no-sandbox'] });
  try {
    for (const [test, width] of [[walk, 360], [desktop, 1280]]) {
      const page = await browser.newPage({ viewport: { width, height: 844 }, reducedMotion: 'reduce' });
      page.setDefaultTimeout(6500);
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      try {
        await test(page);
        assert.deepEqual(errors, []);
        console.log(`Passed ${test.name} at ${width} px`);
      } finally { await page.close(); }
    }
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
