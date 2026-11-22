// Run against the Vite development or preview server with Playwright installed.
const assert = require('node:assert/strict');
const { chromium } = require('playwright');

const address = new URL(process.env.BASE_URL || 'http://127.0.0.1:5173');
address.searchParams.set('series', '1');
const url = address.href;
const executablePath = process.env.CHROMIUM_PATH;
const viewport = { width: 360, height: 800 };

async function noClipping(page) {
  const clipped = await page.evaluate(() => {
    const width = document.documentElement.clientWidth;
    if (document.documentElement.scrollWidth > width) return ['horizontal overflow'];
    return [...document.querySelectorAll('button')].flatMap(button => {
      const rect = button.getBoundingClientRect();
      return rect.width && (rect.left < 0 || rect.right > width) ? [button.textContent.trim()] : [];
    });
  });
  assert.deepEqual(clipped, []);
}

const click = (page, name) => page.getByRole('button', { name, exact: typeof name === 'string' }).click();
const visible = (page, text) => page.getByText(text, { exact: true }).first().waitFor({ state: 'visible' });
const demo = page => click(page, /^Demo controls/);
const snapshot = page => page.evaluate(() => JSON.parse(localStorage.getItem('badla-series-demo')).session);

async function viewAs(page, name) {
  await demo(page);
  await click(page, name);
}

async function ready(page, nameAfter) {
  await click(page, 'Ready · 100 gold entry');
  if (nameAfter) await click(page, `Continue as ${nameAfter}`);
}

async function turn(page, actor, steps, { reload = false, keyboard = false } = {}) {
  const announcement = page.locator('[aria-live="polite"][aria-atomic="true"]').getByText(`${actor}’s turn`, { exact: true });
  await announcement.waitFor({ state: 'visible' });
  await noClipping(page);
  const die = page.getByRole('button', { name: 'Roll dice' });
  if (keyboard) {
    await die.focus();
    await page.keyboard.press('Shift+Tab');
    await page.keyboard.press('Tab');
    assert.equal(await die.evaluate(node => node.matches(':focus-visible')), true);
    await page.keyboard.press('Enter');
  } else {
    await die.click();
  }
  if (reload) {
    await page.reload();
    assert.equal((await snapshot(page)).viewer, actor.toLowerCase());
    await visible(page, `Rolled ${steps}`);
  }
  const token = page.getByRole('button', { name: `Move ${actor}'s token ${steps} ${steps === 1 ? 'step' : 'steps'}`, exact: true });
  if (keyboard) {
    await token.focus();
    await page.keyboard.press('Space');
  } else {
    await token.click();
  }
}

async function story(page) {
  await page.goto(url);
  await page.getByRole('heading', { name: 'Gunjan wins' }).waitFor();
  await click(page, '▶ Replay capture');
  await visible(page, 'The capture sends Riya’s last token back to the yard.');
  await noClipping(page);
  await viewAs(page, 'Gunjan');
  await page.getByRole('button', { name: 'Go for 2–0' }).waitFor();
  await viewAs(page, 'Riya');
  await click(page, 'Take Badla');
  await click(page, /^Bring backup/);
  await click(page, 'Send challenge');
  await click(page, 'Continue as Gunjan');
  await demo(page);
  await click(page, /^New · Invitation from Riya/);
  await click(page, 'Open table');
  assert.equal((await snapshot(page)).state.rounds[0].status, 'proposed');
  await click(page, 'Accept challenge');
  await click(page, 'Invite Shruti');
  await click(page, 'Continue as Riya');
  await click(page, 'Invite Ananya');
  await click(page, 'Continue as Ananya');
  await visible(page, 'Riya is down 0–1 to Gunjan. Join her side? Entry 100 gold. Win 200 back.');
  await click(page, 'Accept partner invite');
  await click(page, 'Continue as Shruti');
  await click(page, 'Accept partner invite');
  await noClipping(page);
  await ready(page, 'Riya');
  await ready(page, 'Gunjan');
  await click(page, 'Ready · 100 gold entry');
  await viewAs(page, 'Ananya');
  await click(page, 'Ready · 100 gold entry');
  await click(page, 'Continue as Riya');

  await turn(page, 'Riya', 2, { reload: true, keyboard: true });
  await click(page, 'Continue as Gunjan');
  await turn(page, 'Gunjan', 1);
  await click(page, 'Continue as Ananya');
  await turn(page, 'Ananya', 2);
  await visible(page, 'Ananya brought their token home.');
  await click(page, 'View result');
  await page.getByRole('heading', { name: 'You helped Riya level the series' }).waitFor();
  await visible(page, '+100 gold');
  await click(page, 'Save my seat for the decider');
  await click(page, 'Continue as Riya');
  await click(page, 'Host Grudge Night');
  await page.getByRole('checkbox', { name: /In one hour/ }).check();
  await click(page, 'Offer slots');
  await click(page, 'Continue as Gunjan');
  await click(page, /^Choose Mon 23 Nov/);
  for (const next of ['Riya', 'Ananya', 'Shruti']) {
    await click(page, 'Confirm time, entry & club visibility');
    assert.equal((await snapshot(page)).state.fixtures.length, 0);
    await click(page, `Continue as ${next}`);
  }
  await click(page, 'Confirm time, entry & club visibility');
  assert.equal((await snapshot(page)).state.fixtures.length, 1);
  await click(page, 'Continue as Dev');
  await click(page, 'Open fixture');
  await click(page, 'Riya & Ananya');
  await click(page, 'Gunjan & Shruti');
  await page.reload();
  await visible(page, 'Your pick is in. Result tomorrow.');
  assert.equal(await page.getByRole('button', { name: 'Gunjan & Shruti', exact: true }).getAttribute('aria-pressed'), 'true');
  await noClipping(page);
  const fixtureUrl = page.url();
  await viewAs(page, 'Meera');
  await page.goto(fixtureUrl);
  await page.getByRole('heading', { name: 'Fixture unavailable' }).waitFor();
  await viewAs(page, 'Dev');
  await click(page, 'Open fixture');
  await demo(page);
  await click(page, 'Advance to scheduled start');
  await page.getByRole('heading', { name: 'Picks are locked' }).waitFor();
  await viewAs(page, 'Riya');
  await click(page, 'Open your table');
  await ready(page, 'Gunjan');
  await ready(page, 'Ananya');
  await ready(page, 'Shruti');
  await ready(page, 'Riya');
  await turn(page, 'Riya', 1);
  await click(page, 'Continue as Gunjan');
  await turn(page, 'Gunjan', 2);
  await click(page, 'Continue as Ananya');
  await turn(page, 'Ananya', 1);
  await click(page, 'Continue as Shruti');
  await turn(page, 'Shruti', 2);
  await visible(page, 'Shruti brought their token home.');
  await click(page, 'View result');
  await page.getByRole('heading', { name: 'Gunjan & Shruti win' }).waitFor();
  await viewAs(page, 'Dev');
  await click(page, 'Open result');
  await visible(page, 'Gunjan & Shruti win the series 2–1.');
  await visible(page, 'You picked the winners.');
  await click(page, 'Back to club');
  await viewAs(page, 'Gunjan');
  await click(page, 'Round 3 · Gold receipt');
  await visible(page, '1,100 gold');
  await click(page, 'Back to lobby');
  await noClipping(page);
  const { state } = await snapshot(page);
  assert.deepEqual(state.rounds.map(round => round.winner), ['riya', 'gunjan']);
  assert.equal(state.predictions.length, 1);
  assert.equal(state.wallet.filter(entry => entry.kind === 'entry').length, 10);
}

async function staleNotice(page) {
  await page.goto(url);
  await click(page, 'Take Badla');
  await click(page, 'Send challenge');
  await click(page, 'Continue as Gunjan');
  await click(page, 'Pass');
  await demo(page);
  await click(page, /^New · Invitation from Riya/);
  await page.getByRole('heading', { name: 'This notification has expired' }).waitFor();
  await click(page, 'Back to lobby');
  assert.equal((await snapshot(page)).state.wallet.length, 3);
  await demo(page);
  await noClipping(page);
  await page.keyboard.press('Escape');
  assert.equal(await page.getByRole('dialog').count(), 0);
}

(async () => {
  const browser = await chromium.launch({ executablePath, args: ['--no-sandbox'] });
  try {
    for (const walkthrough of [story, staleNotice]) {
      const page = await browser.newPage({ viewport, reducedMotion: 'reduce', isMobile: true, hasTouch: true });
      const errors = [];
      page.on('pageerror', error => errors.push(error.message));
      try {
        await walkthrough(page);
        assert.deepEqual(errors, []);
        console.log(`Passed ${walkthrough.name} at 360 px`);
      } finally {
        await page.close();
      }
    }
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
