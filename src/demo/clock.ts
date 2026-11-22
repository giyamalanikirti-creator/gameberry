import type { State } from '../domain/types';

/** Earliest future window start among open rounds (the next check-in). */
export function nextWindowStart(s: State, now: number): number | null {
  const starts = Object.values(s.rounds)
    .filter((r) => (r.status === 'confirmed' || r.status === 'checkin') && r.window && r.window.start > now)
    .map((r) => r.window!.start);
  return starts.length ? Math.min(...starts) : null;
}

/** The chosen (or first offered) decider slot. */
export function tomorrowsSlot(s: State, now: number): number | null {
  const starts = Object.values(s.bookings)
    .filter((b) => b.status !== 'withdrawn')
    .map((b) => b.proposedSlots[b.chosenSlot ?? 0]?.start)
    .filter((x): x is number => typeof x === 'number' && x > now);
  return starts.length ? Math.min(...starts) : null;
}
