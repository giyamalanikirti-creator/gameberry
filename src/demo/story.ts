/**
 * Kirti's Doubles path as data (comeback on day 1, Grudge Night on day 2). Tests run it as product actions; the Demo
 * drawer's jump-to-scene shortcuts replay a prefix of it with source "demo".
 */
import { DEMO_START, MINUTE, tomorrowWindow } from '../domain/time';
import type { PlayerId, State } from '../domain/types';
import { Action, Ctx, reduce } from '../state/reducer';

export interface Step {
  actor: PlayerId | null;
  at: number;
  action: Action | ((s: State) => Action);
}

export const T0 = DEMO_START;
export const DECIDER_SLOT = tomorrowWindow(T0, 'Asia/Kolkata', 21, 0); // Tomorrow 9:00–9:30 pm IST

const m = (n: number) => T0 + n * MINUTE;
const latestRound = (s: State) => Object.values(s.rounds).filter((r) => r.seriesId && r.id !== s.opening.roundId).pop()!;
const inviteTo = (p: PlayerId, kind: 'challenge' | 'partner') => (s: State) =>
  Object.values(s.invites).filter((i) => i.toPlayerId === p && i.kind === kind && i.status === 'open').pop()!.id;
const booking = (s: State) => latestRound(s).bookingId!;

const play = (actor: PlayerId, at: number): Step[] => [
  { actor, at, action: (s) => ({ type: 'ROLL', roundId: latestRound(s).id }) },
  { actor, at, action: (s) => ({ type: 'MOVE', roundId: latestRound(s).id }) },
];

export interface Scene {
  id: string;
  title: string;
  /** Number of story steps applied before this scene. */
  after: number;
  /** Who the reviewer should sign in as to see it. */
  who: PlayerId;
  /** Clock to jump to, if later than the last step. */
  clock?: number;
}

export function storySteps(): Step[] {
  return [
    /* 0 */ { actor: 'riya', at: m(1), action: { type: 'SEND_CHALLENGE', format: 'doubles', timing: 'now' } },
    /* 1 */ { actor: 'gunjan', at: m(2), action: (s) => ({ type: 'RESPOND_CHALLENGE', inviteId: inviteTo('gunjan', 'challenge')(s), accept: true }) },
    /* 2 */ { actor: 'riya', at: m(3), action: (s) => ({ type: 'INVITE_PARTNER', roundId: latestRound(s).id, toPlayerId: 'ananya' }) },
    /* 3 */ { actor: 'gunjan', at: m(3), action: (s) => ({ type: 'INVITE_PARTNER', roundId: latestRound(s).id, toPlayerId: 'shruti' }) },
    /* 4 */ { actor: 'ananya', at: m(4), action: (s) => ({ type: 'RESPOND_PARTNER', inviteId: inviteTo('ananya', 'partner')(s), accept: true }) },
    /* 5 */ { actor: 'shruti', at: m(5), action: (s) => ({ type: 'RESPOND_PARTNER', inviteId: inviteTo('shruti', 'partner')(s), accept: true }) },
    /* 6 */ { actor: 'riya', at: m(6), action: (s) => ({ type: 'READY', roundId: latestRound(s).id }) },
    /* 7 */ { actor: 'gunjan', at: m(6), action: (s) => ({ type: 'READY', roundId: latestRound(s).id }) },
    /* 8 */ { actor: 'ananya', at: m(6), action: (s) => ({ type: 'READY', roundId: latestRound(s).id }) },
    /* 9 */ { actor: 'shruti', at: m(7), action: (s) => ({ type: 'READY', roundId: latestRound(s).id }) },
    /* 10–15 */ ...play('riya', m(8)), ...play('gunjan', m(8)), ...play('ananya', m(9)),
    /* 16 */ { actor: 'ananya', at: m(10), action: (s) => ({ type: 'SAVE_SEAT', roundId: latestRound(s).id }) },
    /* 17 */ { actor: 'riya', at: m(12), action: (s) => ({ type: 'HOST_GRUDGE_NIGHT', seriesId: Object.keys(s.series)[0], slots: [DECIDER_SLOT] }) },
    /* 18 */ { actor: 'gunjan', at: m(13), action: (s) => ({ type: 'CHOOSE_SLOT', bookingId: booking(s), slotIndex: 0 }) },
    /* 19 */ { actor: 'ananya', at: m(14), action: (s) => ({ type: 'CONFIRM_BOOKING', bookingId: booking(s) }) },
    /* 20 */ { actor: 'shruti', at: m(15), action: (s) => ({ type: 'CONFIRM_BOOKING', bookingId: booking(s) }) },
    /* 21 */ { actor: 'dev', at: m(18), action: (s) => ({ type: 'PREDICT', fixtureId: Object.keys(s.fixtures)[0], side: 'A' }) },
    /* 22–25 */
    { actor: 'riya', at: DECIDER_SLOT.start + MINUTE, action: (s) => ({ type: 'READY', roundId: latestRound(s).id }) },
    { actor: 'gunjan', at: DECIDER_SLOT.start + MINUTE, action: (s) => ({ type: 'READY', roundId: latestRound(s).id }) },
    { actor: 'ananya', at: DECIDER_SLOT.start + 2 * MINUTE, action: (s) => ({ type: 'READY', roundId: latestRound(s).id }) },
    { actor: 'shruti', at: DECIDER_SLOT.start + 2 * MINUTE, action: (s) => ({ type: 'READY', roundId: latestRound(s).id }) },
    /* 26–31: Riya finishes on 3, Gunjan to 2, Ananya finishes on 2 → Team Riya 2-1 */
    ...play('riya', DECIDER_SLOT.start + 3 * MINUTE),
    ...play('gunjan', DECIDER_SLOT.start + 3 * MINUTE),
    ...play('ananya', DECIDER_SLOT.start + 4 * MINUTE),
  ];
}

export const SCENES: Scene[] = [
  { id: '1', title: '1 · Opening result (Riya)', after: 0, who: 'riya' },
  { id: '1b', title: "1b · Winner's side (Gunjan)", after: 0, who: 'gunjan' },
  { id: '2', title: '2 · Challenge sheet', after: 0, who: 'riya' },
  { id: '3', title: '3 · Challenge received', after: 1, who: 'gunjan' },
  { id: '4', title: '4 · Seat board', after: 2, who: 'riya' },
  { id: '5', title: '5 · Partner invitation', after: 4, who: 'ananya' },
  { id: '6', title: '6 · Waiting table', after: 6, who: 'riya' },
  { id: '7', title: '7 · Doubles endgame', after: 10, who: 'riya' },
  { id: '8', title: '8 · Personal result', after: 16, who: 'ananya' },
  { id: '9', title: '9 · Book the decider', after: 18, who: 'riya' },
  { id: '10', title: '10 · Club fixture published', after: 21, who: 'dev' },
  { id: '11', title: '11 · Dev picks a side', after: 21, who: 'dev' },
  { id: '12', title: '12 · Match day', after: 22, who: 'riya', clock: DECIDER_SLOT.start },
];

/** Apply the first `n` story steps. Returns the state and the clock time reached. */
export function applyStory(state: State, n: number, source: Ctx['source']): { state: State; at: number; failures: string[] } {
  let s = state;
  let at = T0;
  const failures: string[] = [];
  for (const step of storySteps().slice(0, n)) {
    const action = typeof step.action === 'function' ? step.action(s) : step.action;
    const r = reduce(s, action, { at: step.at, actor: step.actor, source });
    if (!r.accepted) failures.push(`${action.type}: ${r.reason}`);
    s = r.state;
    at = step.at;
  }
  return { state: s, at, failures };
}
