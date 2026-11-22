/**
 * Domain reducer. Owns every transition, actor permission, clock check and
 * score update. Rejected actions return the (time-reconciled) state unchanged
 * and log nothing.
 */
import { endgameStart, moveToken, rollDie } from '../board/engine';
import { freshDice, guidedDice } from '../board/dice';
import type { ReplayEvent } from '../board/replay';
import { track } from './analytics';
import { deliverReminder, isPairBlocked } from './notifications';
import { opponent } from './players';
import {
  activeChallenge,
  activeReadiness,
  allowsReinvite,
  isTerminal,
  isTied,
  latestChallengeFor,
  windowOpen,
} from './selectors';
import { INVITE_TTL, PLAY_NOW_WINDOW, PROPOSAL_TTL, READY_TTL, WINDOW_LENGTH, DAY } from './time';
import type {
  Challenge,
  ChallengeKind,
  ChallengeStatus,
  DiceMode,
  DomainState,
  Match,
  PlayerId,
  TimeWindow,
} from './types';

type Actor = { actor: PlayerId };
type WithChallenge = Actor & { challengeId: string };

export type Action = { at: number } & (
  | ({ type: 'offerShown'; matchId: string; offer: 'badla' | 'decider' | 'another' } & Actor)
  | ({ type: 'replayViewed'; matchId: string; mode: 'animated' | 'static' } & Actor)
  | ({ type: 'sendChallenge'; matchId: string } & Actor)
  | ({ type: 'withdraw' } & WithChallenge)
  | ({ type: 'playNow' } & WithChallenge)
  | ({ type: 'proposeTime'; window: TimeWindow } & WithChallenge)
  | ({ type: 'pass' } & WithChallenge)
  | ({ type: 'confirmTime' } & WithChallenge)
  | ({ type: 'declineTime' } & WithChallenge)
  | ({ type: 'cancel' } & WithChallenge)
  | ({ type: 'ready' } & WithChallenge)
  | ({ type: 'dismissJoin' } & WithChallenge)
  | ({ type: 'openNotification'; notificationId: string } & Actor)
  | ({ type: 'appOpened' } & Actor)
  | ({ type: 'setMute'; muted: boolean } & Actor)
  | ({ type: 'setBlock'; blocked: boolean } & Actor)
  | ({ type: 'roll'; matchId: string; expectRollCount: number; source?: 'player' | 'demo-opponent' } & Actor)
  | ({ type: 'move'; matchId: string; tokenIndex: number; expectRollCount: number; source?: 'player' | 'demo-opponent' } & Actor)
  | ({ type: 'leaveMatch'; matchId: string } & Actor)
  | { type: 'setDiceMode'; mode: DiceMode; seed: number }
  | { type: 'demoNote'; name: string; detail?: Record<string, string | number | boolean | null> }
  | { type: 'tick' }
);

export interface ReduceResult {
  state: DomainState;
  accepted: boolean;
  reason?: string;
}

const PAIR: PlayerId[] = ['kirti', 'ahmed'];

function isPlayer(id: unknown): id is PlayerId {
  return id === 'kirti' || id === 'ahmed';
}

function close(c: Challenge, status: ChallengeStatus, at: number): void {
  c.status = status;
  c.closedAt = at;
  c.readiness = {};
}

// ---------------------------------------------------------------------------
// Time reconciliation
// ---------------------------------------------------------------------------

/** Apply every expiry that is due at `at`. Returns the same object if nothing changed. */
export function reconcile(state: DomainState, at: number): DomainState {
  let draft: DomainState | null = null;
  const edit = () => (draft ??= structuredClone(state));

  for (const id of state.challengeOrder) {
    const c0 = state.challenges[id];
    if (isTerminal(c0.status) || c0.status === 'playing') continue;

    if (c0.status === 'pending' && at >= c0.expiresAt) {
      const d = edit();
      close(d.challenges[id], 'expired', at);
      track(d, { name: 'challenge_expired', at, actor: 'system', source: 'system', challengeId: id, detail: { stage: 'pending' } });
      continue;
    }
    if (c0.status === 'proposed' && c0.proposalExpiresAt !== null && at >= c0.proposalExpiresAt) {
      const d = edit();
      close(d.challenges[id], 'expired', at);
      d.challenges[id].window = null;
      track(d, { name: 'challenge_expired', at, actor: 'system', source: 'system', challengeId: id, detail: { stage: 'proposed' } });
      continue;
    }
    if ((c0.status === 'scheduled' || c0.status === 'waiting') && c0.window) {
      if (at >= c0.window.end) {
        const d = edit();
        const c = d.challenges[id];
        const missed = c.everReady.length > 0;
        close(c, missed ? 'missed' : 'expired', at);
        track(d, {
          name: missed ? 'challenge_missed' : 'challenge_expired',
          at,
          actor: 'system',
          source: 'system',
          challengeId: id,
          detail: { stage: 'window', ready: c0.everReady.join(',') || null },
        });
        continue;
      }
      const lapsed = PAIR.filter((p) => c0.readiness[p] && !activeReadiness(c0, p, at));
      if (lapsed.length) {
        const d = edit();
        const c = d.challenges[id];
        lapsed.forEach((p) => delete c.readiness[p]);
        if (!PAIR.some((p) => activeReadiness(c, p, at))) c.status = 'scheduled';
        track(d, { name: 'readiness_lapsed', at, actor: 'system', source: 'system', challengeId: id, detail: { players: lapsed.join(',') } });
      }
    }
  }
  return draft ?? state;
}

// ---------------------------------------------------------------------------
// Helpers that mutate a draft
// ---------------------------------------------------------------------------

function createMatch(d: DomainState, c: Challenge, at: number): Match {
  const number = Object.keys(d.matches).length + 1;
  const id = `match-${number}`;
  const dice = d.nextDice.mode === 'fresh' ? freshDice(d.nextDice.seed) : guidedDice();
  const match: Match = {
    id,
    kind: 'rematch',
    number,
    challengeId: c.id,
    seats: { red: 'kirti', yellow: 'ahmed' },
    status: 'playing',
    createdAt: at,
    completedAt: null,
    winner: null,
    game: endgameStart(dice),
    keyEvent: null,
  };
  d.matches[id] = match;
  c.status = 'playing';
  c.matchId = id;
  c.readiness = {};
  track(d, { name: 'both_joined', at, actor: 'system', source: 'system', challengeId: c.id, matchId: id, detail: { dice: d.nextDice.mode } });
  return match;
}

function completeMatch(d: DomainState, match: Match, winner: PlayerId, at: number): void {
  if (match.status !== 'playing') return;
  match.status = 'completed';
  match.completedAt = at;
  match.winner = winner;
  const last = match.game?.lastMove;
  if (last) {
    const actor = match.seats[last.color];
    const keyEvent: ReplayEvent = {
      id: `evt-${match.id}-finish`,
      matchId: match.id,
      kind: 'finish',
      actor,
      color: last.color,
      tokenIndex: last.tokenIndex,
      roll: last.roll,
      before: last.before,
      path: last.path,
      capture: null,
      after: last.after,
    };
    match.keyEvent = keyEvent;
  }
  // Idempotent: a match ID can only ever contribute one result.
  if (!d.results.some((r) => r.matchId === match.id)) {
    d.results.push({ matchId: match.id, winner, completedAt: at });
  }
  if (match.challengeId) {
    const c = d.challenges[match.challengeId];
    if (c) {
      c.status = 'completed';
      c.closedAt = at;
    }
  }
  track(d, { name: 'match_completed', at, actor: 'system', source: 'system', matchId: match.id, challengeId: match.challengeId ?? undefined, detail: { winner } });
}

function markReady(d: DomainState, c: Challenge, actor: PlayerId, at: number): 'joined' | 'waiting' {
  const other = opponent(actor);
  if (activeReadiness(c, other, at)) {
    createMatch(d, c, at);
    return 'joined';
  }
  const until = Math.min(at + READY_TTL, c.window!.end);
  c.readiness[actor] = { since: at, until };
  if (!c.everReady.includes(actor)) c.everReady.push(actor);
  c.status = 'waiting';
  deliverReminder(d, c, actor, other, at, until);
  return 'waiting';
}

// ---------------------------------------------------------------------------
// Reducer
// ---------------------------------------------------------------------------

export function reduce(prev: DomainState, action: Action): ReduceResult {
  const state = reconcile(prev, action.at);
  if (action.type === 'tick') return { state, accepted: state !== prev };

  const draft = structuredClone(state);
  const outcome = apply(draft, action);
  if (typeof outcome === 'string') return { state, accepted: false, reason: outcome };
  return { state: draft, accepted: true };
}

/** Mutates `d`. Returns a rejection reason, or nothing on success. */
function apply(d: DomainState, a: Exclude<Action, { type: 'tick' }>): string | void {
  const at = a.at;

  const getChallenge = (id: string) => d.challenges[id];

  switch (a.type) {
    case 'offerShown': {
      const key = `${a.matchId}:${a.actor}:${a.offer}`;
      if (d.offers.includes(key)) return 'offer already logged';
      if (!d.matches[a.matchId]) return 'unknown match';
      d.offers.push(key);
      track(d, {
        name: a.offer === 'decider' ? 'decider_offered' : 'invitation_offered',
        at,
        actor: a.actor,
        source: 'player',
        matchId: a.matchId,
        detail: { offer: a.offer },
      });
      return;
    }

    case 'replayViewed': {
      const m = d.matches[a.matchId];
      if (!m?.keyEvent) return 'no replay';
      track(d, { name: 'replay_viewed', at, actor: a.actor, source: 'replay', matchId: a.matchId, detail: { mode: a.mode, event: m.keyEvent.kind } });
      return;
    }

    case 'sendChallenge': {
      if (!isPlayer(a.actor)) return 'unknown player';
      const m = d.matches[a.matchId];
      if (!m || m.status === 'playing') return 'match not finished';
      if (isPairBlocked(d)) return 'invitations are off for this pair';
      if (activeChallenge(d)) return 'an invitation is already open';
      const prior = latestChallengeFor(d, a.matchId);
      if (prior && !allowsReinvite(prior)) return 'this match already had its invitation';
      if (!prior && m.kind === 'original' && m.winner === a.actor) return 'Badla is offered to the player who was caught';
      if (m.status === 'abandoned' && !prior) return 'match not finished';

      const kind: ChallengeKind = m.kind === 'original' ? 'badla' : isTied(d) ? 'decider' : 'another';
      d.seq += 1;
      const id = `c-${d.seq}`;
      const c: Challenge = {
        id,
        originMatchId: a.matchId,
        kind,
        challenger: a.actor,
        invitee: opponent(a.actor),
        status: 'pending',
        createdAt: at,
        expiresAt: at + INVITE_TTL,
        mode: null,
        window: null,
        proposedAt: null,
        proposalExpiresAt: null,
        readiness: {},
        everReady: [],
        remindersSent: [],
        matchId: null,
        closedAt: null,
        previousChallengeId: prior?.id ?? null,
      };
      d.challenges[id] = c;
      d.challengeOrder.push(id);
      track(d, { name: 'challenge_sent', at, actor: a.actor, source: 'player', challengeId: id, matchId: a.matchId, detail: { kind, reinvite: !!prior } });
      return;
    }

    case 'withdraw': {
      const c = getChallenge(a.challengeId);
      if (!c || c.status !== 'pending') return 'nothing to withdraw';
      if (c.challenger !== a.actor) return 'only the challenger can withdraw';
      close(c, 'withdrawn', at);
      track(d, { name: 'challenge_withdrawn', at, actor: a.actor, source: 'player', challengeId: c.id });
      return;
    }

    case 'pass': {
      const c = getChallenge(a.challengeId);
      if (!c || c.status !== 'pending') return 'invitation is not open';
      if (c.invitee !== a.actor) return 'only the invitee can respond';
      close(c, 'declined', at);
      track(d, { name: 'challenge_response', at, actor: a.actor, source: 'player', challengeId: c.id, detail: { response: 'pass', kind: c.kind } });
      return;
    }

    case 'playNow': {
      const c = getChallenge(a.challengeId);
      if (!c || c.status !== 'pending') return 'invitation is not open';
      if (c.invitee !== a.actor) return 'only the invitee can respond';
      if (isPairBlocked(d)) return 'blocked';
      c.mode = 'now';
      c.window = { start: at, end: at + PLAY_NOW_WINDOW };
      track(d, { name: 'challenge_response', at, actor: a.actor, source: 'player', challengeId: c.id, detail: { response: 'play_now', kind: c.kind } });
      if (c.kind === 'decider') track(d, { name: 'decider_accepted', at, actor: 'system', source: 'system', challengeId: c.id });
      markReady(d, c, a.actor, at);
      return;
    }

    case 'proposeTime': {
      const c = getChallenge(a.challengeId);
      if (!c || c.status !== 'pending') return 'invitation is not open';
      if (c.invitee !== a.actor) return 'only the invitee can propose a time';
      const w = a.window;
      if (w.end - w.start !== WINDOW_LENGTH) return 'window must be 30 minutes';
      if (w.start <= at || w.start > at + 2 * DAY) return 'window must be in the next two days';
      c.status = 'proposed';
      c.mode = 'scheduled';
      c.window = { ...w };
      c.proposedAt = at;
      c.proposalExpiresAt = Math.min(at + PROPOSAL_TTL, w.start);
      track(d, {
        name: 'challenge_response',
        at,
        actor: a.actor,
        source: 'player',
        challengeId: c.id,
        detail: { response: 'later', kind: c.kind, windowStart: new Date(w.start).toISOString() },
      });
      return;
    }

    case 'confirmTime': {
      const c = getChallenge(a.challengeId);
      if (!c || c.status !== 'proposed') return 'no proposal to confirm';
      if (c.challenger !== a.actor) return 'only the challenger can confirm';
      if (isPairBlocked(d)) return 'blocked';
      c.status = 'scheduled';
      track(d, { name: 'time_confirmed', at, actor: a.actor, source: 'player', challengeId: c.id, detail: { kind: c.kind } });
      if (c.kind === 'decider') track(d, { name: 'decider_accepted', at, actor: 'system', source: 'system', challengeId: c.id });
      return;
    }

    case 'declineTime': {
      const c = getChallenge(a.challengeId);
      if (!c || c.status !== 'proposed') return 'no proposal to decline';
      if (c.challenger !== a.actor) return 'only the challenger can decline the time';
      close(c, 'declined', at);
      track(d, { name: 'time_declined', at, actor: a.actor, source: 'player', challengeId: c.id });
      return;
    }

    case 'cancel': {
      const c = getChallenge(a.challengeId);
      if (!c || (c.status !== 'scheduled' && c.status !== 'waiting')) return 'nothing to cancel';
      if (c.challenger !== a.actor && c.invitee !== a.actor) return 'not in this match';
      close(c, 'cancelled', at);
      track(d, { name: 'challenge_cancelled', at, actor: a.actor, source: 'player', challengeId: c.id });
      return;
    }

    case 'ready': {
      const c = getChallenge(a.challengeId);
      if (!c || (c.status !== 'scheduled' && c.status !== 'waiting')) return 'no table to join';
      if (c.challenger !== a.actor && c.invitee !== a.actor) return 'not in this match';
      if (isPairBlocked(d)) return 'blocked';
      if (!windowOpen(c, at)) return 'outside the agreed window';
      if (activeReadiness(c, a.actor, at)) return 'already ready';
      track(d, {
        name: 'player_ready',
        at,
        actor: a.actor,
        source: 'player',
        challengeId: c.id,
        detail: { joined: activeReadiness(c, opponent(a.actor), at) },
      });
      markReady(d, c, a.actor, at);
      return;
    }

    case 'dismissJoin': {
      const c = getChallenge(a.challengeId);
      if (!c || c.status !== 'waiting' || c.mode !== 'now') return 'no open table';
      if (activeReadiness(c, a.actor, at)) return 'you are at the table';
      if (c.challenger !== a.actor && c.invitee !== a.actor) return 'not in this match';
      close(c, 'declined', at);
      track(d, { name: 'challenge_response', at, actor: a.actor, source: 'player', challengeId: c.id, detail: { response: 'not_now', kind: c.kind } });
      return;
    }

    case 'openNotification': {
      const n = d.notifications.find((x) => x.id === a.notificationId);
      if (!n || n.to !== a.actor) return 'unknown notification';
      if (n.readAt !== null) return 'already opened';
      n.readAt = at;
      const c = d.challenges[n.challengeId];
      track(d, { name: 'reminder_opened', at, actor: a.actor, source: 'player', challengeId: n.challengeId, detail: { status: c?.status ?? 'unknown' } });
      return;
    }

    case 'appOpened': {
      // Opening the app never signals availability and never notifies anyone.
      track(d, { name: 'app_opened', at, actor: a.actor, source: 'player' });
      return;
    }

    case 'setMute': {
      if (d.settings[a.actor].mutedReminders === a.muted) return 'no change';
      d.settings[a.actor].mutedReminders = a.muted;
      track(d, { name: a.muted ? 'reminders_muted' : 'reminders_unmuted', at, actor: a.actor, source: 'player' });
      return;
    }

    case 'setBlock': {
      if (d.settings[a.actor].blockedOpponent === a.blocked) return 'no change';
      d.settings[a.actor].blockedOpponent = a.blocked;
      if (a.blocked) {
        for (const id of d.challengeOrder) {
          const c = d.challenges[id];
          if (!isTerminal(c.status) && c.status !== 'playing') close(c, 'blocked', at);
        }
      }
      track(d, { name: a.blocked ? 'player_blocked' : 'player_unblocked', at, actor: a.actor, source: 'player' });
      return;
    }

    case 'roll': {
      const m = d.matches[a.matchId];
      if (!m || m.status !== 'playing' || !m.game) return 'match not in progress';
      if (m.seats[m.game.turn] !== a.actor) return 'not your turn';
      if (a.expectRollCount !== m.game.rollCount) return 'stale roll';
      const next = rollDie(m.game, m.game.turn);
      if (!next) return 'cannot roll now';
      const value = next.die ?? next.note?.roll ?? 0;
      m.game = next;
      track(d, {
        name: 'match_roll',
        at,
        actor: a.actor,
        source: a.source ?? 'player',
        matchId: m.id,
        detail: { value, passed: next.die === null },
      });
      return;
    }

    case 'move': {
      const m = d.matches[a.matchId];
      if (!m || m.status !== 'playing' || !m.game) return 'match not in progress';
      if (m.seats[m.game.turn] !== a.actor) return 'not your turn';
      if (a.expectRollCount !== m.game.rollCount) return 'stale move';
      const next = moveToken(m.game, m.game.turn, a.tokenIndex);
      if (!next) return 'illegal move';
      m.game = next;
      track(d, {
        name: 'match_move',
        at,
        actor: a.actor,
        source: a.source ?? 'player',
        matchId: m.id,
        detail: { token: a.tokenIndex, roll: next.lastMove!.roll, to: next.lastMove!.after[next.lastMove!.color][a.tokenIndex] },
      });
      if (next.winner) completeMatch(d, m, m.seats[next.winner], at);
      return;
    }

    case 'leaveMatch': {
      const m = d.matches[a.matchId];
      if (!m || m.status !== 'playing') return 'match not in progress';
      if (m.seats.red !== a.actor && m.seats.yellow !== a.actor) return 'not in this match';
      m.status = 'abandoned';
      m.completedAt = at;
      if (m.challengeId) close(d.challenges[m.challengeId], 'abandoned', at);
      track(d, { name: 'match_abandoned', at, actor: a.actor, source: 'player', matchId: m.id });
      return;
    }

    case 'setDiceMode': {
      if (Object.values(d.matches).some((m) => m.status === 'playing')) return 'dice are fixed once a match starts';
      d.nextDice = { mode: a.mode, seed: a.seed | 0 };
      track(d, { name: 'demo_dice_mode', at, actor: 'demo', source: 'demo', detail: { mode: a.mode, seed: a.seed | 0 } });
      return;
    }

    case 'demoNote': {
      track(d, { name: a.name, at, actor: 'demo', source: 'demo', detail: a.detail });
      return;
    }
  }
}

/** Convenience for tests and the store: apply a list of actions in order. */
export function reduceAll(state: DomainState, actions: Action[]): DomainState {
  return actions.reduce((s, a) => reduce(s, a).state, state);
}
