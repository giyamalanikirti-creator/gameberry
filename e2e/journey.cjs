/*
 * Browser walkthrough of the definition-of-done journeys.
 * Run against a dev or preview server:
 *   npm run dev            (or: npm run build && npm run preview -- --port 5173)
 *   BASE_URL=http://localhost:5173 npm run e2e
 * Requires the `playwright` package (preinstalled in many CI images; otherwise `npm i -D playwright`).
 */
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const BASE = process.env.BASE_URL || 'http://localhost:5173';
const OUT = path.join(__dirname, 'screenshots');
fs.mkdirSync(OUT, { recursive: true });

const errors = [];
let shot = 0;

async function snap(page, name) {
  shot += 1;
  await page.screenshot({ path: path.join(OUT, `${String(shot).padStart(2, '0')}-${name}.png`), fullPage: true });
}

async function expectText(page, text, timeout = 5000) {
  await page.getByText(text, { exact: false }).first().waitFor({ state: 'visible', timeout });
}

async function guide(page, label) {
  await page.locator('.guide').getByRole('button', { name: label }).click();
}

async function fresh(page) {
  await page.goto(BASE);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await expectText(page, 'Ahmed wins.');
}

async function noClippedActions(page, label) {
  const clipped = await page.evaluate(() => {
    const w = document.documentElement.clientWidth;
    const bad = [];
    if (document.documentElement.scrollWidth > w + 1) bad.push(`page scrolls horizontally (${document.documentElement.scrollWidth} > ${w})`);
    document.querySelectorAll('button').forEach((b) => {
      const r = b.getBoundingClientRect();
      if (r.width && (r.left < -1 || r.right > w + 1)) bad.push(`button "${b.textContent.trim()}" clipped`);
    });
    return bad;
  });
  if (clipped.length) throw new Error(`${label}: ${clipped.join('; ')}`);
}

async function playMatch(page) {
  // Kirti rolls and moves; the demo opponent plays Ahmed through the same rules.
  for (let i = 0; i < 30; i++) {
    if (await page.getByRole('heading', { name: /wins?\./ }).count()) return;
    const roll = page.getByRole('button', { name: 'Roll', exact: true });
    const move = page.getByRole('button', { name: /^Move \d$/ });
    if (await move.count()) await move.click();
    else if ((await roll.count()) && (await roll.isEnabled())) await roll.click();
    await page.waitForTimeout(450);
  }
  throw new Error('match did not finish');
}

async function guidedJourney(browser, viewport, tag) {
  const page = await browser.newPage({ viewport, deviceScaleFactor: 2 });
  page.on('console', (m) => m.type() === 'error' && errors.push(`${tag}: ${m.text()}`));
  page.on('pageerror', (e) => errors.push(`${tag}: ${e.message}`));
  await fresh(page);

  // 1. Original result and capture replay
  await expectText(page, 'Ahmed caught your last token just before safety.');
  await expectText(page, 'Ahmed 1');
  await noClippedActions(page, `${tag} result`);
  await snap(page, `${tag}-result`);
  await page.getByRole('button', { name: /Watch the capture/ }).click();
  await page.waitForTimeout(1900);
  await snap(page, `${tag}-replay-mid`);
  await page.waitForTimeout(1700);
  await page.getByRole('button', { name: /Replay/ }).waitFor();

  // 2. Ask for Badla → pending lobby card
  await page.getByRole('button', { name: 'Ask for Badla' }).click();
  await expectText(page, 'You challenged Ahmed.');
  await expectText(page, 'Waiting for Ahmed');
  await snap(page, `${tag}-kirti-lobby-pending`);

  // 3. Ahmed's invitation, same capture from his side
  await guide(page, "Try Ahmed's view");
  await expectText(page, 'Kirti wants a rematch');
  await expectText(page, "You caught Kirti's last token just before safety.");
  await snap(page, `${tag}-ahmed-invite`);
  await page.getByRole('button', { name: 'Tomorrow evening' }).click();
  await expectText(page, 'Mon 23 Nov, 19:00–19:30');
  await expectText(page, 'Kirti sees Mon 23 Nov, 19:30–20:00');
  await snap(page, `${tag}-ahmed-propose`);
  await page.getByRole('button', { name: 'Suggest this time' }).click();
  await expectText(page, 'You suggested a time');

  // 4. Kirti confirms
  await guide(page, "Back to Kirti's view");
  await expectText(page, 'Ahmed suggested a time');
  await expectText(page, 'Mon 23 Nov, 19:30–20:00');
  await expectText(page, '19:00–19:30 for Ahmed');
  await snap(page, `${tag}-kirti-confirm`);
  await page.getByRole('button', { name: 'Confirm time' }).click();
  await expectText(page, 'Scheduled');

  // Reload mid-journey: state survives
  await page.reload();
  await expectText(page, 'Agreed by both of you');

  // 5. Next day
  await guide(page, 'Advance to agreed time');
  await expectText(page, 'window is open');
  await guide(page, "Try Ahmed's view");
  await page.getByRole('button', { name: "I'm ready" }).click();
  await expectText(page, 'Waiting for Kirti');
  await snap(page, `${tag}-ahmed-ready`);

  // 6. Kirti gets exactly one reminder
  await guide(page, "Back to Kirti's view");
  await expectText(page, 'Ahmed is ready for your Badla match.');
  await snap(page, `${tag}-kirti-reminder`);
  await page.locator('.push-body').click();
  await expectText(page, 'Ahmed is at the table');
  await page.getByRole('button', { name: 'Join match' }).click();

  // 7. Rematch, played through the engine
  await expectText(page, 'Your turn. Roll the die.');
  await noClippedActions(page, `${tag} match`);
  await snap(page, `${tag}-match-start`);
  await page.getByRole('button', { name: 'Roll', exact: true }).click();
  await expectText(page, 'You rolled 2');
  await page.reload(); // rolled-but-unspent die resumes
  await expectText(page, 'You rolled 2');
  await playMatch(page);

  // 8. One each
  await expectText(page, 'You win.');
  await expectText(page, 'One each. Play the decider?');
  await expectText(page, 'Kirti brought her last token home first.'.replace('Kirti brought her', 'You brought your'));
  await noClippedActions(page, `${tag} rivalry`);
  await snap(page, `${tag}-one-each`);

  // 9. Decider requires Ahmed's acceptance
  await page.getByRole('button', { name: 'Play the decider' }).click();
  await expectText(page, 'You asked Ahmed for the decider.');
  await guide(page, "Try Ahmed's view");
  await expectText(page, 'Kirti wants the decider');
  await page.getByRole('button', { name: 'Play now' }).click();
  await guide(page, "Back to Kirti's view");
  await page.locator('.push-body').click();
  await page.getByRole('button', { name: 'Join match' }).click();
  await expectText(page, 'Match 3');
  await snap(page, `${tag}-decider-started`);
  await page.close();
}

async function playNowJourney(browser) {
  const page = await browser.newPage({ viewport: { width: 360, height: 740 } });
  page.on('console', (m) => m.type() === 'error' && errors.push(`playnow: ${m.text()}`));
  await fresh(page);
  await page.getByRole('button', { name: 'Ask for Badla' }).click();
  await guide(page, "Try Ahmed's view");
  await page.getByRole('button', { name: 'Play now' }).click();
  await expectText(page, 'Waiting for Kirti');
  await guide(page, "Back to Kirti's view");
  await page.locator('.push-body').click();
  await page.getByRole('button', { name: 'Join match' }).click();
  await expectText(page, 'Your turn. Roll the die.');
  await playMatch(page);
  await expectText(page, 'One each. Play the decider?');
  await page.close();
}

async function passAndWithdraw(browser) {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await fresh(page);
  await page.getByRole('button', { name: 'Ask for Badla' }).click();
  await page.getByRole('button', { name: 'Withdraw' }).click();
  await expectText(page, 'You withdrew your invitation.');
  if (await page.getByText('Waiting for Ahmed').count()) throw new Error('pending card survived withdraw');

  await fresh(page);
  await page.getByRole('button', { name: 'Ask for Badla' }).click();
  await guide(page, "Try Ahmed's view");
  await page.getByRole('button', { name: 'Pass' }).click();
  await guide(page, 'Reset demo').catch(() => {});
  await page.close();
}

async function missedAndStale(browser) {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  page.on('console', (m) => m.type() === 'error' && errors.push(`missed: ${m.text()}`));
  await fresh(page);
  await page.getByRole('button', { name: 'Ask for Badla' }).click();
  await guide(page, "Try Ahmed's view");
  await page.getByRole('button', { name: 'Tomorrow evening' }).click();
  await page.getByRole('button', { name: 'Suggest this time' }).click();
  await guide(page, "Back to Kirti's view");
  await page.getByRole('button', { name: 'Confirm time' }).click();
  await guide(page, 'Advance to agreed time');
  await guide(page, "Try Ahmed's view");
  await page.getByRole('button', { name: "I'm ready" }).click();
  await guide(page, "Back to Kirti's view");
  await expectText(page, 'Ahmed is ready for your Badla match.');
  // Let the window close with only Ahmed ready, then tap the stale reminder.
  await page.getByRole('button', { name: /Demo controls/ }).click();
  await snap(page, 'demo-controls');
  await page.getByRole('button', { name: '+1 h' }).click();
  await page.getByRole('tab', { name: /Notification inbox/ }).click();
  await page.locator('.inbox-item').first().click();
  await expectText(page, 'That table has closed');
  await expectText(page, 'You missed each other');
  await expectText(page, 'No score change');
  await snap(page, 'missed-each-other');
  if (await page.getByRole('button', { name: 'Join match' }).count()) throw new Error('stale reminder revived the table');
  await page.close();
}

async function reducedMotionAndCorruptData(browser) {
  const ctx = await browser.newContext({ viewport: { width: 360, height: 740 }, reducedMotion: 'reduce', deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  page.on('console', (m) => m.type() === 'error' && errors.push(`reduced: ${m.text()}`));
  await fresh(page);
  await expectText(page, 'Reduced motion: showing before and after frames.');
  await noClippedActions(page, 'reduced 360');
  await snap(page, 'reduced-motion-360');
  await page.evaluate(() => localStorage.setItem('badla-demo', '{"version":1,"domain":{}}'));
  await page.reload();
  await page.getByRole('alertdialog').waitFor();
  await page.getByRole('button', { name: 'Reset demo' }).click();
  await expectText(page, 'Ahmed wins.');
  await ctx.close();
}

(async () => {
  const browser = await chromium.launch();
  try {
    await guidedJourney(browser, { width: 390, height: 844 }, 'mobile');
    await guidedJourney(browser, { width: 1280, height: 860 }, 'desktop');
    await playNowJourney(browser);
    await passAndWithdraw(browser);
    await missedAndStale(browser);
    await reducedMotionAndCorruptData(browser);
  } finally {
    await browser.close();
  }
  if (errors.length) {
    console.error('Console errors:\n' + errors.join('\n'));
    process.exit(1);
  }
  console.log(`All journeys passed. Screenshots in ${OUT}`);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
