/**
 * The guided path: public match → Badla singles booked for tomorrow →
 * 1-1 → Grudge Night with backup → Team Riya 2-1.
 * Used by tests and by the story panel's scene shortcuts.
 */
import { DEMO_START, MINUTE, tomorrowWindow } from '../domain/time';
import type { PlayerId, State, TimeWindow } from '../domain/types';
import { suggestSlots } from '../smart/smartFixture';
import { Action, Ctx, reduce } from '../state/reducer';

export interface GStep {
  actor: PlayerId;
  at: (s: State) => number;
  action: (s: State) => Action;
}

const T0 = DEMO_START;
const m = (n: number) => () => T0 + n * MINUTE;
const latestRound = (s: State) => Object.values(s.rounds).filter((r) => r.seriesId && r.id !== s.opening.roundId).pop()!;
const rid = (s: State) => latestRound(s).id;
const seriesId = (s: State) => Object.keys(s.series)[0];

/** Round 2: Smart Fixture's best slot tomorrow for Riya and Gunjan. */
export function round2Slot(): TimeWindow {
  return suggestSlots(T0, ['riya', 'gunjan'])[0].slot;
}
/** Grudge Night: 21:00 the day after round 2. */
export function grudgeSlot(): TimeWindow {
  return tomorrowWindow(round2Slot().start, 'Asia/Kolkata', 21, 0);
}

const at2 = (n: number) => () => round2Slot().start + n * MINUTE;
const atG = (n: number) => () => grudgeSlot().start + n * MINUTE;
const atAfter2 = (n: number) => () => round2Slot().end + n * MINUTE;
const play = (actor: PlayerId, at: () => number): GStep[] => [
  { actor, at, action: (s) => ({ type: 'ROLL', roundId: rid(s) }) },
  { actor, at, action: (s) => ({ type: 'MOVE', roundId: rid(s) }) },
];

export const GUIDED_STEPS: GStep[] = [
  /* 0 */ { actor: 'riya', at: m(0), action: () => ({ type: 'PUBLIC_QUICK' }) },
  /* 1 */ { actor: 'riya', at: m(0), action: () => ({ type: 'PUBLIC_MATCHED' }) },
  /* 2 */ { actor: 'riya', at: m(1), action: () => ({ type: 'PUBLIC_ROLL' }) },
  /* 3 */ { actor: 'riya', at: m(1), action: () => ({ type: 'PUBLIC_MOVE' }) },
  /* 4 */ { actor: 'riya', at: m(1), action: () => ({ type: 'PUBLIC_OPPONENT' }) },
  /* 5 */ { actor: 'riya', at: m(2), action: () => ({ type: 'PUBLIC_FAST_FORWARD' }) },
  /* 6 */ { actor: 'riya', at: m(3), action: () => ({ type: 'SEND_CHALLENGE', format: 'singles', timing: 'scheduled', slots: [round2Slot()] }) },
  /* 7 */ { actor: 'gunjan', at: m(6), action: (s) => ({ type: 'RESPOND_CHALLENGE', inviteId: Object.values(s.invites).find((i) => i.toPlayerId === 'gunjan' && i.status === 'open')!.id, accept: true }) },
  /* 8 */ { actor: 'riya', at: at2(1), action: (s) => ({ type: 'READY', roundId: rid(s) }) },
  /* 9 */ { actor: 'gunjan', at: at2(2), action: (s) => ({ type: 'READY', roundId: rid(s) }) },
  /* 10–11 */ ...play('riya', at2(3)),
  /* 12 */ { actor: 'riya', at: atAfter2(1), action: (s) => ({ type: 'HOST_GRUDGE_NIGHT', seriesId: seriesId(s), slots: [grudgeSlot()] }) },
  /* 13 */ { actor: 'gunjan', at: atAfter2(3), action: (s) => ({ type: 'CHOOSE_SLOT', bookingId: latestRound(s).bookingId!, slotIndex: 0 }) },
  /* 14 */ { actor: 'riya', at: atAfter2(4), action: (s) => ({ type: 'INVITE_PARTNER', roundId: rid(s), toPlayerId: 'ananya' }) },
  /* 15 */ { actor: 'gunjan', at: atAfter2(5), action: (s) => ({ type: 'INVITE_PARTNER', roundId: rid(s), toPlayerId: 'shruti' }) },
  /* 16 */ { actor: 'ananya', at: atAfter2(7), action: (s) => ({ type: 'RESPOND_PARTNER', inviteId: Object.values(s.invites).find((i) => i.toPlayerId === 'ananya' && i.status === 'open')!.id, accept: true }) },
  /* 17 */ { actor: 'shruti', at: atAfter2(9), action: (s) => ({ type: 'RESPOND_PARTNER', inviteId: Object.values(s.invites).find((i) => i.toPlayerId === 'shruti' && i.status === 'open')!.id, accept: true }) },
  /* 18 */ { actor: 'dev', at: atAfter2(15), action: (s) => ({ type: 'PREDICT', fixtureId: Object.keys(s.fixtures)[0], side: 'A' }) },
  /* 19–22 */
  { actor: 'riya', at: atG(1), action: (s) => ({ type: 'READY', roundId: rid(s) }) },
  { actor: 'gunjan', at: atG(1), action: (s) => ({ type: 'READY', roundId: rid(s) }) },
  { actor: 'ananya', at: atG(2), action: (s) => ({ type: 'READY', roundId: rid(s) }) },
  { actor: 'shruti', at: atG(2), action: (s) => ({ type: 'READY', roundId: rid(s) }) },
  /* 23–28 */ ...play('riya', atG(3)), ...play('gunjan', atG(3)), ...play('ananya', atG(4)),
];

export function applyGuided(state: State, n: number, source: Ctx['source']): { state: State; at: number; failures: string[] } {
  let s = state;
  let at = T0;
  const failures: string[] = [];
  for (const step of GUIDED_STEPS.slice(0, n)) {
    const action = step.action(s);
    at = step.at(s);
    const r = reduce(s, action, { at, actor: step.actor, source });
    if (!r.accepted) failures.push(`${action.type}: ${r.reason}`);
    s = r.state;
  }
  return { state: s, at, failures };
}

/** Steps that finish the public match: used to reset to the Flow 1 result screen. */
export const AFTER_PUBLIC_MATCH = 6;
