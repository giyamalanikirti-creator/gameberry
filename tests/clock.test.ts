import { describe, expect, it } from 'vitest';
import { DECIDER_SLOT } from '../src/demo/story';
import { reduce } from '../src/state/reducer';
import { createSeedState } from '../src/state/seed';
import { balance, totalGold } from '../src/state/selectors';
import { DAY, HOUR, MINUTE, formatClock, formatSlot } from '../src/domain/time';
import { latestRound, no, ok, story, T0 } from './helpers';

const tick = (s: ReturnType<typeof story>, at: number) => reduce(s, { type: 'TICK' }, { at, actor: null, source: 'product' }).state;

describe('simulated clock', () => {
  it('formats the seeded evening in IST', () => {
    expect(formatClock(T0, 'Asia/Kolkata')).toBe('Sun 22 Nov, 8:14 pm IST');
    expect(formatSlot(DECIDER_SLOT, T0, 'Asia/Kolkata')).toBe('Tomorrow 9:00–9:30 pm');
  });

  it('window boundaries are start-inclusive, end-exclusive', () => {
    const s = story(21);
    const r = latestRound(s);
    expect(no(s, 'riya', { type: 'READY', roundId: r.id }, DECIDER_SLOT.start - 1)).toMatch(/Check-in is not open/);
    expect(ok(s, 'riya', { type: 'READY', roundId: r.id }, DECIDER_SLOT.start)).toBeTruthy();
    expect(ok(s, 'riya', { type: 'READY', roundId: r.id }, DECIDER_SLOT.end - 1)).toBeTruthy();
    expect(no(s, 'riya', { type: 'READY', roundId: r.id }, DECIDER_SLOT.end)).toBeTruthy();
  });

  it('time can never settle a round or move gold', () => {
    const mid = story(12); // decider-less Doubles round, mid-play
    const later = [HOUR, DAY, 9 * DAY].map((dt) => tick(mid, T0 + dt));
    for (const s of later) {
      expect(latestRound(s).status).toBe('active');
      expect(latestRound(s).outcome).toBeNull();
      expect(s.wallet).toEqual(mid.wallet);
    }
    const seeded = createSeedState();
    const s = tick(seeded, T0 + 30 * DAY);
    expect(s.wallet).toEqual(seeded.wallet);
    expect(totalGold(s)).toBe(5000);
  });

  it('skipping to tomorrow opens check-in and locks predictions, but pays nobody', () => {
    const s = story(21);
    const t = tick(s, DECIDER_SLOT.start + MINUTE);
    expect(latestRound(t).status).toBe('checkin');
    expect(Object.values(t.fixtures)[0].status).toBe('locked');
    for (const p of ['gunjan', 'riya', 'ananya', 'shruti', 'dev'] as const) expect(balance(t, p)).toBe(balance(s, p));
  });

  it('an unanswered challenge expires after 24 hours with no debit', () => {
    const s = ok(createSeedState(), 'riya', { type: 'SEND_CHALLENGE', format: 'singles', timing: 'now' }, T0);
    expect(latestRound(tick(s, T0 + DAY - 1)).status).toBe('proposed');
    const t = tick(s, T0 + DAY);
    expect(latestRound(t).status).toBe('expired');
    expect(Object.values(t.invites)[0].status).toBe('expired');
  });

  it('Play now opens a five-minute check-in when the roster completes', () => {
    const s = story(6);
    const r = latestRound(s);
    expect(r.status).toBe('checkin');
    expect(r.window!.end - r.window!.start).toBe(5 * MINUTE);
  });

  it('at most two Badla notifications per player per day', () => {
    const s = story(20);
    const byDay = new Map<string, number>();
    for (const n of s.notifications) byDay.set(n.to, (byDay.get(n.to) ?? 0) + 1);
    for (const v of byDay.values()) expect(v).toBeLessThanOrEqual(2);
    expect(s.analytics.some((e) => e.name === 'notification_suppressed')).toBe(true);
  });
});
