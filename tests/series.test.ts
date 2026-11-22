import { describe, expect, it } from 'vitest';
import { applyStory } from '../src/demo/story';
import { reduce } from '../src/state/reducer';
import { createSeedState, OPENING_ROUND_ID } from '../src/state/seed';
import { canHostGrudgeNight, seriesScore, seriesStatus, seriesWinner } from '../src/state/selectors';
import { DAY, MINUTE } from '../src/domain/time';
import { latestRound, no, ok, openInvite, playOut, seriesId, story, STEPS, T0 } from './helpers';

describe('series spine: first to two', () => {
  it('the first invitation creates the series and carries the opening win forward exactly once', () => {
    const s = story(1);
    const id = seriesId(s);
    expect(Object.keys(s.series)).toHaveLength(1);
    expect(s.series[id].roundIds[0]).toBe(OPENING_ROUND_ID);
    expect(seriesScore(s, id)).toEqual({ A: 0, B: 1 });
    expect(seriesStatus(s, id)).toBe('open');
  });

  it('either captain can initiate: the winner sees "Go for 2-0"', () => {
    const s = ok(createSeedState(), 'gunjan', { type: 'SEND_CHALLENGE', format: 'singles', timing: 'now' }, T0);
    expect(s.series[seriesId(s)].initiatedBy).toBe('gunjan');
    expect(openInvite(s, 'riya').kind).toBe('challenge');
    // The other captain cannot open a second series or a second challenge
    expect(no(s, 'riya', { type: 'SEND_CHALLENGE', format: 'doubles', timing: 'now' }, T0 + MINUTE)).toMatch(/already challenged/);
  });

  it('1-1 after the comeback: tied, decider can be proposed', () => {
    const s = story(16);
    expect(seriesScore(s, seriesId(s))).toEqual({ A: 1, B: 1 });
    expect(seriesStatus(s, seriesId(s))).toBe('tied');
    expect(canHostGrudgeNight(s, seriesId(s))).toBe(true);
  });

  it('decider 2-1 closes the series to Gunjan', () => {
    const s = story(STEPS);
    expect(seriesScore(s, seriesId(s))).toEqual({ A: 1, B: 2 });
    expect(seriesStatus(s, seriesId(s))).toBe('won');
    expect(seriesWinner(s, seriesId(s))).toBe('B');
    expect(s.analytics.some((e) => e.name === 'series_closed')).toBe(true);
  });

  it('sweep at 2-0 (Doubles sweep) and singles sweep both close the series', () => {
    for (const format of ['doubles', 'singles'] as const) {
      let s = reduce(createSeedState(), { type: 'DEMO_SETTINGS', patch: { nextFixture: 'sweep-gunjan' } }, { at: T0, actor: null, source: 'demo' }).state;
      s = ok(s, 'riya', { type: 'SEND_CHALLENGE', format, timing: 'now' }, T0);
      s = ok(s, 'gunjan', { type: 'RESPOND_CHALLENGE', inviteId: openInvite(s, 'gunjan').id, accept: true }, T0 + MINUTE);
      if (format === 'doubles') {
        const r = latestRound(s).id;
        s = ok(s, 'riya', { type: 'INVITE_PARTNER', roundId: r, toPlayerId: 'ananya' }, T0 + MINUTE);
        s = ok(s, 'gunjan', { type: 'INVITE_PARTNER', roundId: r, toPlayerId: 'shruti' }, T0 + MINUTE);
        s = ok(s, 'ananya', { type: 'RESPOND_PARTNER', inviteId: openInvite(s, 'ananya').id, accept: true }, T0 + MINUTE);
        s = ok(s, 'shruti', { type: 'RESPOND_PARTNER', inviteId: openInvite(s, 'shruti').id, accept: true }, T0 + MINUTE);
      }
      for (const p of format === 'doubles' ? (['riya', 'gunjan', 'ananya', 'shruti'] as const) : (['riya', 'gunjan'] as const)) {
        s = ok(s, p, { type: 'READY', roundId: latestRound(s).id }, T0 + 2 * MINUTE);
      }
      s = playOut(s, T0 + 3 * MINUTE);
      expect(seriesScore(s, seriesId(s))).toEqual({ A: 0, B: 2 });
      expect(seriesStatus(s, seriesId(s))).toBe('won');
    }
  });

  it('a closed series offers no decider, no Grudge Night and no challenge', () => {
    const s = story(STEPS);
    expect(canHostGrudgeNight(s, seriesId(s))).toBe(false);
    expect(no(s, 'riya', { type: 'SEND_CHALLENGE', format: 'singles', timing: 'now' }, T0 + 2 * DAY)).toMatch(/over/);
  });

  it('singles-only history at 1-1: decider offered, Grudge Night not offered', () => {
    let s = reduce(createSeedState(), { type: 'DEMO_SETTINGS', patch: { nextFixture: 'comeback' } }, { at: T0, actor: null, source: 'demo' }).state;
    s = ok(s, 'riya', { type: 'SEND_CHALLENGE', format: 'singles', timing: 'now' }, T0);
    s = ok(s, 'gunjan', { type: 'RESPOND_CHALLENGE', inviteId: openInvite(s, 'gunjan').id, accept: true }, T0 + MINUTE);
    s = ok(s, 'riya', { type: 'READY', roundId: latestRound(s).id }, T0 + MINUTE);
    s = ok(s, 'gunjan', { type: 'READY', roundId: latestRound(s).id }, T0 + MINUTE);
    s = playOut(s, T0 + 2 * MINUTE);
    expect(seriesStatus(s, seriesId(s))).toBe('tied');
    expect(canHostGrudgeNight(s, seriesId(s))).toBe(false);
    const d = ok(s, 'gunjan', { type: 'SEND_CHALLENGE', format: 'singles', timing: 'now' }, T0 + 3 * MINUTE);
    expect(latestRound(d).isDecider).toBe(true);
    expect(latestRound(d).entryGold).toBe(200); // the stake doubles once, then stays flat
  });

  it('no shared club: Host Grudge Night is not offered, private decider still is', () => {
    let s = story(16);
    s = { ...s, clubs: { ...s.clubs, 'club-chai-dice': { ...s.clubs['club-chai-dice'], memberIds: ['gunjan', 'riya', 'ananya', 'dev'] } } };
    expect(canHostGrudgeNight(s, seriesId(s))).toBe(false);
    expect(latestRound(ok(s, 'riya', { type: 'SEND_CHALLENGE', format: 'doubles', timing: 'now' }, T0 + 20 * MINUTE)).isDecider).toBe(true);
  });

  it('series expires after 7 days with no decider; prior rounds stay settled', () => {
    const s = story(16);
    const after = reduce(s, { type: 'TICK' }, { at: T0 + 8 * DAY, actor: null, source: 'product' }).state;
    expect(seriesStatus(after, seriesId(after))).toBe('expired');
    expect(seriesScore(after, seriesId(after))).toEqual({ A: 1, B: 1 });
  });

  it('the guided story runs clean from a cold start', () => {
    expect(applyStory(createSeedState(), STEPS, 'product').failures).toEqual([]);
  });
});
