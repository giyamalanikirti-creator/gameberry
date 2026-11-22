import { describe, expect, it } from 'vitest';
import { cardScore, inviteLine, OPENING_CHATS, pReturn, scoreSlot, suggestSlots, usualHour } from '../src/smart/smartFixture';
import { tomorrowWindow } from '../src/domain/time';
import { T0 } from './helpers';

describe('Smart Fixture (deterministic mock)', () => {
  it('shows the Badla card only after a hot capture (closeness + heat ≥ 0.6)', () => {
    expect(cardScore(1, OPENING_CHATS).show).toBe(true);
    expect(cardScore(1, OPENING_CHATS).score).toBeCloseTo(0.8);
    expect(cardScore(12, 0).show).toBe(false);
  });

  it('scores slots with the spec formula and is reproducible', () => {
    const a = suggestSlots(T0, ['riya', 'gunjan']);
    const b = suggestSlots(T0, ['riya', 'gunjan']);
    expect(a).toEqual(b);
    // Both seeded profiles peak at 20:00, so the best slot tomorrow is 20:15.
    expect(usualHour(['riya', 'gunjan'])).toBe(20);
    expect(new Date(a[0].slot.start).toISOString()).toBe('2026-11-23T14:45:00.000Z');
    const w = tomorrowWindow(T0, 'Asia/Kolkata', 20, 15);
    const s = scoreSlot(w, ['riya', 'gunjan']);
    expect(s.pShow).toBeCloseTo(0.9 * 0.85);
    expect(s.incr).toBeCloseTo(((1 - 0.35) + (1 - 0.55)) / 2);
  });

  it('knows tomorrow (Monday) is a day Riya usually skips', () => {
    expect(pReturn('riya', T0 + 24 * 3600_000)).toBe(0.35);
  });

  it('fills the invite line from match facts', () => {
    expect(inviteLine({ from: 'Riya', to: 'Gunjan', squaresFromHome: 1, timeLabel: 'Tomorrow 20:15', score: '1-0' }))
      .toBe('Riya wants Badla. You sent her home 1 square from the finish. Tomorrow 20:15?');
  });
});
