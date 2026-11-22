import { describe, expect, it } from 'vitest';
import { applyStory } from '../src/demo/story';
import { reduce } from '../src/state/reducer';
import { createSeedState } from '../src/state/seed';
import { goldInPlay, totalGold } from '../src/state/selectors';
import { balances, expectConserved, latestRound, ok, playOut, story, STEPS, T0 } from './helpers';

describe('balance checkpoints (the regression test)', () => {
  it('seeded and opening result applied: 1,100 / 900 / 1,000 / 1,000 / 1,000', () => {
    const s = createSeedState();
    expect(balances(s)).toEqual({ gunjan: 1100, riya: 900, ananya: 1000, shruti: 1000, dev: 1000 });
    expectConserved(s);
  });

  it('after the guided Doubles comeback: 1,000 / 1,000 / 1,100 / 900 / 1,000', () => {
    const s = story(16);
    expect(latestRound(s).status).toBe('settled');
    expect(balances(s)).toEqual({ gunjan: 1000, riya: 1000, ananya: 1100, shruti: 900, dev: 1000 });
    expectConserved(s);
  });

  it('after the guided decider: 1,100 / 900 / 1,000 / 1,000 / 1,000', () => {
    const s = story(STEPS);
    expect(balances(s)).toEqual({ gunjan: 1100, riya: 900, ananya: 1000, shruti: 1000, dev: 1000 });
    expectConserved(s);
  });
});

describe('conservation and the ledger', () => {
  it('balances + gold in play is 5,000 after every single action; balances alone whenever no round is live (bonus off)', () => {
    for (let n = 1; n <= STEPS; n++) {
      const s = applyStory(createSeedState(), n, 'product').state;
      expect(Object.values(balances(s)).reduce((a, b) => a + b, 0) + goldInPlay(s)).toBe(5000);
      if (!Object.values(s.rounds).some((r) => r.status === 'active')) expect(totalGold(s)).toBe(5000);
    }
  });

  it('balance is derived from entries; every balanceAfter matches the running sum', () => {
    const s = story(STEPS);
    const run: Record<string, number> = {};
    for (const e of s.wallet) {
      run[e.playerId] = (run[e.playerId] ?? 0) + e.amount;
      expect(e.balanceAfter).toBe(run[e.playerId]);
    }
    expect(new Set(s.wallet.map((e) => e.idempotencyKey)).size).toBe(s.wallet.length);
  });

  it('published price: doubles 100 a seat → 200 gross per winner; singles 200 → 400', () => {
    const s = story(16);
    const r = latestRound(s);
    const payouts = s.wallet.filter((e) => e.roundId === r.id && e.kind === 'payout').map((e) => e.amount);
    expect(r.entryGold).toBe(100);
    expect(payouts).toEqual([200, 200]);

    let t = createSeedState();
    t = ok(t, 'riya', { type: 'SEND_CHALLENGE', format: 'singles', timing: 'now' }, T0);
    expect(latestRound(t).entryGold).toBe(200);
  });

  it('sweep bonus: off by default; when on, a 2-0 pays 100 split 50/50 and is the only faucet', () => {
    let s = createSeedState();
    expect(s.settings.sweepBonus).toBe(false);
    s = reduce(s, { type: 'DEMO_SETTINGS', patch: { sweepBonus: true, nextFixture: 'sweep-gunjan' } }, { at: T0, actor: null, source: 'demo' }).state;
    s = applyStory(s, 10, 'product').state;
    s = playOut(s, T0 + 20 * 60_000);
    expect(latestRound(s).outcome).toEqual({ winnerSide: 'B' });
    expect(balances(s)).toEqual({ gunjan: 1250, riya: 800, ananya: 900, shruti: 1150, dev: 1000 });
    expect(totalGold(s)).toBe(5100);
    expect(s.wallet.filter((e) => e.kind === 'bonus').map((e) => e.amount)).toEqual([50, 50]);
  });

  it('sweep bonus toggled mid-series is rejected', () => {
    const s = story(1);
    const r = reduce(s, { type: 'DEMO_SETTINGS', patch: { sweepBonus: true } }, { at: T0, actor: null, source: 'demo' });
    expect(r.accepted).toBe(false);
    expect(r.reason).toMatch(/locked/);
  });
});
