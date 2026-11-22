import { describe, expect, it } from 'vitest';
import { AFTER_PUBLIC_MATCH, applyGuided, GUIDED_STEPS, round2Slot } from '../src/demo/guided';
import { OPENING_CAPTURE } from '../src/engine/replay';
import { reduce } from '../src/state/reducer';
import { createFreshState } from '../src/state/seed';
import { seriesScore, seriesStatus, seriesWinner, totalGold } from '../src/state/selectors';
import { balances, latestRound, no, T0 } from './helpers';

const run = (n: number) => {
  const r = applyGuided(createFreshState(), n, 'product');
  expect(r.failures).toEqual([]);
  return r.state;
};

describe('guided path (Tanya build spec)', () => {
  it('starts as Riya with 1,000 gold, before any match', () => {
    const s = createFreshState();
    expect(balances(s)).toEqual({ gunjan: 1000, riya: 1000, ananya: 1000, shruti: 1000, dev: 1000 });
    expect(s.opening.played).toBe(false);
    expect(no(s, 'riya', { type: 'SEND_CHALLENGE', format: 'singles', timing: 'now' }, T0)).toMatch(/public match first/);
  });

  it('the public match captures the same way every time, landing on the stored snapshot', () => {
    const s = run(5);
    expect(s.publicGame!.captured).toBe(true);
    expect(s.publicGame!.tokens).toEqual(OPENING_CAPTURE.after);
  });

  it('the opening match counts as 1-0 and the receipt shows −100', () => {
    const s = run(AFTER_PUBLIC_MATCH);
    expect(s.opening.played).toBe(true);
    expect(balances(s)).toMatchObject({ gunjan: 1100, riya: 900 });
    expect(s.wallet.filter((e) => e.playerId === 'riya' && e.roundId === s.opening.roundId).map((e) => e.amount)).toEqual([-100]);
    // Playing it twice cannot settle twice
    expect(no(s, 'riya', { type: 'PUBLIC_FAST_FORWARD' }, T0 + 60_000)).toBeTruthy();
  });

  it('booked for tomorrow: confirmed after Gunjan accepts; one jump reaches check-in', () => {
    const s = run(8);
    const r = latestRound(s);
    expect(r.status).toBe('confirmed');
    expect(r.window).toEqual(round2Slot());
    const t = reduce(s, { type: 'TICK' }, { at: round2Slot().start, actor: null, source: 'product' }).state;
    expect(latestRound(t).status).toBe('checkin');
  });

  it('Riya wins round 2 (1-1), then Grudge Night with backup is booked and published', () => {
    const s = run(12);
    const id = Object.keys(s.series)[0];
    expect(seriesScore(s, id)).toEqual({ A: 1, B: 1 });
    expect(balances(s)).toMatchObject({ riya: 1100, gunjan: 900 });
    const g = run(18);
    expect(Object.values(g.fixtures)).toHaveLength(1);
    expect(Object.values(g.fixtures)[0].teamLabels).toEqual({ A: 'Riya & Ananya', B: 'Gunjan & Shruti' });
  });

  it('ends Team Riya 2-1 with Dev\'s pick right and gold conserved', () => {
    const s = run(GUIDED_STEPS.length);
    const id = Object.keys(s.series)[0];
    expect(seriesStatus(s, id)).toBe('won');
    expect(seriesWinner(s, id)).toBe('A');
    expect(seriesScore(s, id)).toEqual({ A: 2, B: 1 });
    expect(balances(s)).toEqual({ gunjan: 800, riya: 1200, ananya: 1100, shruti: 900, dev: 1000 });
    expect(totalGold(s)).toBe(5000);
    expect(s.analytics.find((e) => e.name === 'prediction_verdict')?.detail.correct).toBe(true);
  });

  it('suggesting another time makes the challenger confirm again', () => {
    let s = run(7);
    const inv = Object.values(s.invites).find((i) => i.toPlayerId === 'gunjan' && i.status === 'open')!;
    const other = { start: round2Slot().start + 3600_000, end: round2Slot().end + 3600_000 };
    s = reduce(s, { type: 'RESPOND_CHALLENGE', inviteId: inv.id, accept: true, customSlot: other }, { at: T0 + 7 * 60_000, actor: 'gunjan', source: 'product' }).state;
    const r = latestRound(s);
    expect(r.status).toBe('filling');
    expect(s.notifications.some((n) => n.to === 'riya' && n.kind === 'counter')).toBe(true);
    s = reduce(s, { type: 'RENEW_TERMS', roundId: r.id }, { at: T0 + 8 * 60_000, actor: 'riya', source: 'product' }).state;
    expect(latestRound(s).status).toBe('confirmed');
    expect(latestRound(s).window).toEqual(other);
  });
});
