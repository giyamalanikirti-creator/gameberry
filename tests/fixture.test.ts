import { describe, expect, it } from 'vitest';
import { DECIDER_SLOT } from '../src/demo/story';
import { reduce } from '../src/state/reducer';
import { bookingCount, liveFixtureForRound, predictionTotals, predictionOf } from '../src/state/selectors';
import { MINUTE } from '../src/domain/time';
import { latestRound, no, ok, story, STEPS, T0 } from './helpers';

const at = (n: number) => T0 + n * MINUTE;

describe('Grudge Night: booking, publication, predictions', () => {
  it('confirmations count up and the fixture appears only after the fourth', () => {
    let s = story(19);
    const b = s.bookings[latestRound(s).bookingId!];
    expect(bookingCount(s, b)).toEqual({ done: 2, need: 4 });
    expect(Object.keys(s.fixtures)).toHaveLength(0);
    s = story(20);
    expect(bookingCount(s, s.bookings[b.id])).toEqual({ done: 3, need: 4 });
    expect(Object.keys(s.fixtures)).toHaveLength(0);
    s = story(21);
    expect(Object.values(s.fixtures)).toHaveLength(1);
    const f = Object.values(s.fixtures)[0];
    expect(f.teamLabels).toEqual({ A: 'Riya & Ananya', B: 'Gunjan & Shruti' });
    expect(f.seriesScoreAtPublish).toBe('1-1');
    expect(f.startsAt).toBe(DECIDER_SLOT.start);
  });

  it('at most one live fixture per round; repeat confirmations change nothing', () => {
    const s = story(21);
    const r = reduce(s, { type: 'CONFIRM_BOOKING', bookingId: latestRound(s).bookingId! }, { at: at(16), actor: 'shruti', source: 'product' });
    expect(r.state).toBe(s);
    expect(Object.keys(r.state.fixtures)).toHaveLength(1);
  });

  it('repeated picks by Dev update one record; updatedAt moves', () => {
    let s = story(22);
    const fx = Object.keys(s.fixtures)[0];
    const first = predictionOf(s, fx, 'dev')!;
    s = ok(s, 'dev', { type: 'PREDICT', fixtureId: fx, side: 'B' }, at(30));
    const second = predictionOf(s, fx, 'dev')!;
    expect(Object.values(s.predictions)).toHaveLength(1);
    expect(second.id).toBe(first.id);
    expect(second.pickSide).toBe('B');
    expect(second.updatedAt).toBeGreaterThan(first.updatedAt);
  });

  it('pick after the scheduled start is rejected on the clock boundary', () => {
    const s = story(21);
    const fx = Object.keys(s.fixtures)[0];
    expect(ok(s, 'dev', { type: 'PREDICT', fixtureId: fx, side: 'B' }, DECIDER_SLOT.start - 1)).toBeTruthy();
    expect(no(s, 'dev', { type: 'PREDICT', fixtureId: fx, side: 'B' }, DECIDER_SLOT.start)).toBe('Predictions are locked');
    const locked = reduce(s, { type: 'TICK' }, { at: DECIDER_SLOT.start, actor: null, source: 'product' }).state;
    expect(locked.fixtures[fx].status).toBe('locked');
  });

  it('totals stay hidden until settlement, then show counts and Dev\'s verdict', () => {
    const before = story(25);
    const fx = Object.keys(before.fixtures)[0];
    expect(predictionTotals(before, fx)).toBeNull();
    const s = story(STEPS);
    expect(s.fixtures[fx]).toMatchObject({ status: 'settled', winnerSide: 'A' });
    expect(predictionTotals(s, fx)).toEqual({ A: 1, B: 0 });
    const verdict = s.analytics.find((e) => e.name === 'prediction_verdict')!;
    expect(verdict).toMatchObject({ playerId: 'dev', detail: { correct: true } });
  });

  it('withdrawal is terminal for that listing; a stale link cannot republish', () => {
    let s = story(21);
    const fx = Object.keys(s.fixtures)[0];
    s = ok(s, 'gunjan', { type: 'WITHDRAW_LISTING', fixtureId: fx }, at(30));
    expect(s.fixtures[fx].status).toBe('withdrawn');
    expect(no(s, 'riya', { type: 'WITHDRAW_LISTING', fixtureId: fx }, at(31))).toMatch(/already closed/);
    expect(no(s, 'dev', { type: 'PREDICT', fixtureId: fx, side: 'A' }, at(31))).toBe('Predictions are locked');
    expect(liveFixtureForRound(s, latestRound(s).id)).toBeNull();
  });

  it('cancelled fixture: no prediction verdict for anyone', () => {
    let s = story(21);
    s = ok(s, 'riya', { type: 'CANCEL_ROUND', roundId: latestRound(s).id }, at(30));
    expect(Object.values(s.fixtures)[0].status).toBe('withdrawn');
    expect(s.analytics.some((e) => e.name === 'prediction_verdict')).toBe(false);
  });

  it('only a non-participating club member sees a pick control; the other captain picks the slot', () => {
    const s = story(18);
    const b = latestRound(s).bookingId!;
    expect(no(s, 'riya', { type: 'CHOOSE_SLOT', bookingId: b, slotIndex: 0 }, at(13))).toMatch(/other captain/);
    expect(no(s, 'ananya', { type: 'CHOOSE_SLOT', bookingId: b, slotIndex: 0 }, at(13))).toMatch(/other captain/);
  });
});
