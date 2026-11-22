import { analyticsDate, DAY, inWindow, PLAY_NOW_WINDOW, WINDOW_LENGTH } from '../domain/time';
import { move, roll, startEndgame } from './endgame';
import {
  balance, bonusEligible, CAPTAINS, clubPairs, currentRound, entryFor, FRIENDS, isBlocked,
  isCaptain, lastResult, offerExpires, payoutFor, rival, scores, seatFor, seriesStatus, terminal,
  type Captain, type DemoState, type Format, type Invite, type PlayerId, type Round, type TeamSeat,
} from './model';

type RoundAction =
  | { type: 'accept' | 'pass' | 'confirm' | 'ready'; revision: number }
  | { type: 'selectTime'; start: number; revision: number }
  | { type: 'invite'; player: PlayerId }
  | { type: 'cancel' | 'saveSeat' | 'void' }
  | { type: 'forfeit'; loser: Captain }
  | { type: 'roll' | 'move'; rolls: number };

export type Action = { at: number; actor: PlayerId } & (
  | (RoundAction & { roundId: string })
  | { type: 'propose'; format: Format; mode: 'now' | 'scheduled'; choices: number[]; club: boolean }
  | { type: 'pick'; fixtureId: string; side: Captain }
  | { type: 'openFixture'; fixtureId: string }
  | { type: 'readInvite'; inviteId: string }
  | { type: 'leave' | 'tick' }
  | { type: 'demo'; change: Partial<DemoState['demo']> }
  | { type: 'mute' | 'membership'; player: PlayerId }
  | { type: 'block'; player: PlayerId; other: PlayerId }
);

function event(state: DemoState, action: Action, name: string, roundId?: string, detail?: string) {
  const { at, actor } = action;
  state.events.push({ name, actor, at, day: analyticsDate(at), roundId, detail });
}

function notify(state: DemoState, round: Round, from: PlayerId, to: PlayerId, kind: Invite['kind']) {
  if (isBlocked(state, from, to) || (kind === 'check-in' && state.muted.includes(to))) return;
  const id = `${round.id}/${round.revision}/${kind}/${to}`;
  if (!state.invites.some(invite => invite.id === id)) state.invites.push({ id, roundId: round.id, from, to, kind, read: false });
}

function close(round: Round, status: 'cancelled' | 'expired' | 'voided', reason: Round['reason'], at: number) {
  round.status = status;
  round.reason = reason;
  round.endedAt = at;
}

export function reconcile(state: DemoState, at: number): DemoState {
  const live = currentRound(state);
  if (!live || live.status === 'active') return state;
  const window = live.booking.window;
  const reason = live.status === 'proposed'
    ? (at >= offerExpires(live) ? 'expired' : null)
    : window && at >= window.end ? 'missed'
    : live.status === 'filling' && at >= (window?.start ?? live.expiresAt) ? 'expired'
    : null;
  const checkIn = live.status === 'confirmed' && window && inWindow(window, at);
  if (!reason && !checkIn) return state;
  const next = structuredClone(state);
  const round = currentRound(next)!;
  if (reason) close(round, 'expired', reason, at);
  else openCheckIn(next, round);
  return next;
}

function openCheckIn(state: DemoState, round: Round) {
  round.status = 'check-in';
  for (const seat of round.seats) {
    const from = seat.player === round.proposer ? rival(round.proposer) : round.proposer;
    notify(state, round, from, seat.player, 'check-in');
  }
}

function completeTerms(state: DemoState, round: Round, action: Action) {
  const captainsConfirmAtCheckIn = round.format === 'doubles' && round.booking.mode === 'now';
  const required = round.seats.filter(seat => !captainsConfirmAtCheckIn || !isCaptain(seat.player));
  if (round.seats.length !== (round.format === 'singles' ? 2 : 4) ||
      required.some(seat => seat.consent !== round.revision)) return;
  if (round.booking.club && !round.seats.every(seat => state.club.members.includes(seat.player))) return;
  if (round.booking.mode === 'now') {
    round.booking.window = { start: action.at, end: action.at + PLAY_NOW_WINDOW };
    openCheckIn(state, round);
    return;
  }
  round.status = 'confirmed';
  if (round.booking.club) {
    state.fixtures.push({ id: `fixture-${round.id}`, clubId: state.club.id, roundId: round.id });
  }
  event(state, action, 'booking_confirmed', round.id, round.booking.club ? 'club' : round.format);
}

function markReady(state: DemoState, round: Round, seat: TeamSeat, action: Action) {
  const window = round.booking.window;
  const entry = entryFor(round.format);
  const confirmsHere = round.format === 'doubles' && round.booking.mode === 'now' && isCaptain(seat.player);
  if (round.status !== 'check-in' || !window || !inWindow(window, action.at) ||
      seat.ready || (!confirmsHere && seat.consent !== round.revision) || balance(state, seat.player) < entry) return false;
  seat.consent = round.revision;
  seat.ready = true;
  if (analyticsDate(action.at) !== analyticsDate(round.expiresAt - DAY)) {
    event(state, action, 'next_day_check_in', round.id);
  }
  for (const item of round.seats) if (balance(state, item.player) < entry) item.ready = false;
  if (round.seats.length !== (round.format === 'singles' ? 2 : 4) ||
      round.seats.some(item => !item.ready || item.consent !== round.revision) ||
      (round.booking.club && !round.seats.every(item => state.club.members.includes(item.player)))) return true;

  round.game = startEndgame(round.seats, round.format, round.number === 3, state.demo.seed);
  round.status = 'active';
  for (const item of round.seats) {
    state.wallet.push({ roundId: round.id, player: item.player, gold: -entry, kind: 'entry', at: action.at });
  }
  return true;
}

function settle(state: DemoState, round: Round, action: Action, winner: Captain) {
  round.status = 'settled';
  round.winner = winner;
  round.endedAt = action.at;
  const sweep = round.number === 2 && scores(state)[winner] === 2 && state.series?.bonus;
  for (const seat of round.seats.filter(seat => seat.side === winner)) {
    state.wallet.push({ roundId: round.id, player: seat.player, gold: payoutFor(round.format), kind: 'pot', at: action.at });
    if (sweep && bonusEligible(state, seat.player, action.at)) {
      state.wallet.push({ roundId: round.id, player: seat.player, gold: round.format === 'doubles' ? 50 : 100, kind: 'bonus', at: action.at });
    }
  }
  if (round.number === 2 && winner === 'riya' && round.format === 'doubles') {
    const partner = round.seats.find(seat => seat.side === winner && seat.player !== winner)!;
    state.assists.push({ roundId: round.id, player: partner.player, captain: winner, saved: false });
  }
  if (action.type !== 'forfeit') event(state, action, 'round_completed', round.id, winner);
}

function resetTerms(round: Round) {
  round.revision++;
  round.status = 'filling';
  for (const seat of round.seats) {
    seat.consent = null;
    seat.ready = false;
  }
  if (round.booking.mode === 'now') round.booking.window = null;
}

const newSeat = (side: Captain, player: PlayerId): TeamSeat => ({ side, player, consent: null, ready: false });

function propose(state: DemoState, action: Extract<Action, { type: 'propose' }>) {
  const { actor, at, format, mode, club } = action;
  const status = seriesStatus(state);
  if (!isCaptain(actor) || currentRound(state) || !['open', 'tied'].includes(status) || isBlocked(state, actor, rival(actor))) return false;
  const choices = [...new Set(action.choices)].sort((a, b) => a - b);
  if (choices.some(slot => !Number.isFinite(slot) || slot <= at || slot > at + DAY) ||
      (mode === 'scheduled' ? choices.length < 1 || choices.length > (club ? 2 : 1) : choices.length !== 0)) return false;
  if (club && (format !== 'doubles' || mode !== 'scheduled' || !clubPairs(state))) return false;
  const previous = lastResult(state);
  const attempt = state.rounds.at(-1);
  const seats = CAPTAINS.map(side => newSeat(side, side));
  if (status === 'tied' && format === 'doubles' && previous?.format === 'doubles') {
    for (const seat of previous.seats.slice(2)) {
      if (attempt?.number === 3 && attempt.declined.includes(seat.player)) continue;
      if (isBlocked(state, seat.side, seat.player)) {
        if (club) return false;
      } else seats.push(newSeat(seat.side, seat.player));
    }
  }
  const round: Round = {
    id: `round-${state.nextRound++}`, number: status === 'tied' ? 3 : 2,
    proposer: actor, status: 'proposed', format, seats, revision: 1, declined: [],
    booking: { mode, choices, club, window: null },
    expiresAt: at + DAY, game: null, winner: null, reason: null, endedAt: null,
  };
  state.series ??= { id: 'badla-series', openingId: state.opening.id, bonus: state.demo.bonus, left: false };
  if (!club && format === 'singles') seatFor(round, actor)!.consent = round.revision;
  state.rounds.push(round);
  notify(state, round, actor, rival(actor), 'captain');
  event(state, action, 'invite_sent', round.id, actor === state.opening.winner ? 'opening_winner' : 'opening_challenger');
  return true;
}

function acceptOffer(state: DemoState, round: Round, action: Extract<Action, { roundId: string }>) {
  if (action.actor !== rival(round.proposer) || isBlocked(state, action.actor, round.proposer)) return false;
  if (action.type === 'pass') {
    close(round, 'cancelled', 'passed', action.at);
    return true;
  }
  if (round.booking.club ? action.type !== 'selectTime' : action.type !== 'accept') return false;
  if (action.type === 'selectTime' && (!round.booking.choices.includes(action.start) || action.at >= action.start)) return false;
  const start = action.type === 'selectTime' ? action.start : round.booking.choices[0];
  if (start !== undefined) round.booking.window = { start, end: start + WINDOW_LENGTH };
  if (round.format === 'singles') seatFor(round, action.actor)!.consent = round.revision;
  round.status = 'filling';
  for (const seat of round.seats.slice(2)) notify(state, round, seat.side, seat.player, 'partner');
  completeTerms(state, round, action);
  return true;
}

function invitePartner(state: DemoState, round: Round, action: Extract<RoundAction, { type: 'invite' }> & Action) {
  const { actor, player } = action;
  if (!isCaptain(actor) || round.status !== 'filling' || round.format !== 'doubles' || round.booking.club ||
      !FRIENDS.some(friend => friend === player) || seatFor(round, player) || isBlocked(state, actor, player) ||
      round.seats.some(seat => seat.side === actor && seat.player !== actor)) return false;
  round.seats.push(newSeat(actor, player));
  round.seats.sort((a, b) => (isCaptain(b.player) ? 1 : 0) - (isCaptain(a.player) ? 1 : 0) ||
      CAPTAINS.indexOf(a.side) - CAPTAINS.indexOf(b.side));
  round.declined = round.declined.filter(person => person !== player);
  round.revision++;
  for (const seat of round.seats) {
    if (!isCaptain(seat.player)) notify(state, round, seat.side, seat.player, 'partner');
  }
  event(state, action, 'invite_sent', round.id, 'captain_to_partner');
  return true;
}

function applyRound(state: DemoState, round: Round, action: Extract<Action, { roundId: string }>) {
  const { actor, at } = action;
  const seat = seatFor(round, actor);
  if (action.type === 'saveSeat') {
    const assist = state.assists.find(item => item.player === actor && item.roundId === round.id);
    if (!assist || assist.saved || seriesStatus(state) !== 'tied') return false;
    assist.saved = true;
    event(state, action, 'seat_interest', round.id);
    return true;
  }
  if ('revision' in action && action.revision !== round.revision) return false;
  if (terminal(round)) return false;
  if (round.status === 'active' && round.game) {
    if (action.type === 'void') {
      close(round, 'voided', 'refunded', at);
      for (const item of round.seats) {
        state.wallet.push({ roundId: round.id, player: item.player, gold: entryFor(round.format), kind: 'refund', at });
      }
      return true;
    }
    if (action.type === 'forfeit') {
      // A table forfeit records an outcome through the same settlement path.
      round.reason = 'forfeit';
      round.game.winner = rival(action.loser);
      settle(state, round, action, round.game.winner);
      return true;
    }
    const game = action.type === 'roll' ? roll(round.game, actor, action.rolls)
      : action.type === 'move' ? move(round.game, actor, action.rolls) : round.game;
    if (game === round.game) return false;
    round.game = game;
    if (game.winner) settle(state, round, action, game.winner);
    return true;
  }
  if (action.type === 'invite') return invitePartner(state, round, action);
  if (round.status === 'proposed' && ['accept', 'pass', 'selectTime'].includes(action.type)) {
    return acceptOffer(state, round, action);
  }
  if (!seat) return false;
  if (action.type === 'cancel' || (action.type === 'pass' && !isCaptain(actor) && round.status === 'filling')) {
    if (!isCaptain(actor)) round.declined.push(actor);
    if (isCaptain(actor) || round.booking.club) close(round, 'cancelled', 'cancelled', at);
    else {
      round.seats = round.seats.filter(item => item.player !== actor);
      resetTerms(round);
      if (round.booking.window && at >= round.booking.window.start) close(round, 'cancelled', 'cancelled', at);
      else for (const remaining of round.seats) {
        if (!isCaptain(remaining.player)) notify(state, round, remaining.side, remaining.player, 'partner');
      }
    }
    return true;
  }
  if (round.status === 'filling' && (action.type === 'confirm' || (action.type === 'accept' && !isCaptain(actor)))) {
    if (seat.consent === round.revision || (round.booking.club && !state.club.members.includes(actor)) ||
        (!isCaptain(actor) && isBlocked(state, actor, seat.side))) return false;
    if (isCaptain(actor) && (round.seats.length < 4 || round.booking.mode === 'now')) return false;
    seat.consent = round.revision;
    if (!isCaptain(actor) && !state.events.some(item =>
      item.actor === actor && item.roundId === round.id && item.name === 'partner_accepted')) {
      event(state, action, 'partner_accepted', round.id);
    }
    completeTerms(state, round, action);
    return true;
  }
  return action.type === 'ready' && markReady(state, round, seat, action);
}

export function visibleFixture(state: DemoState, fixtureId: string, player: PlayerId) {
  const fixture = state.fixtures.find(item => item.id === fixtureId);
  if (!fixture || fixture.clubId !== state.club.id || !state.club.members.includes(player)) return undefined;
  const round = state.rounds.find(item => item.id === fixture.roundId);
  return round?.booking.window ? { fixture, round, window: round.booking.window } : undefined;
}

export function canPredict(state: DemoState, fixtureId: string, actor: PlayerId, at: number) {
  const card = visibleFixture(state, fixtureId, actor);
  return !!card && card.round.status === 'confirmed' && at < card.window.start && !seatFor(card.round, actor);
}

function apply(state: DemoState, action: Action) {
  const { actor, at } = action;
  if ('roundId' in action) {
    const round = state.rounds.find(item => item.id === action.roundId);
    return !!round && applyRound(state, round, action);
  }
  switch (action.type) {
    case 'propose': return propose(state, action);
    case 'leave':
      if (!isCaptain(actor) || currentRound(state) || seriesStatus(state) !== 'tied' || !state.series) return false;
      state.series.left = true;
      return true;
    case 'pick': {
      if (!canPredict(state, action.fixtureId, actor, at)) return false;
      const previous = state.predictions.find(item => item.fixtureId === action.fixtureId && item.player === actor);
      if (previous?.side === action.side) return false;
      if (previous) previous.side = action.side;
      else {
        state.predictions.push({ fixtureId: action.fixtureId, player: actor, side: action.side });
        event(state, action, 'unique_predictor', visibleFixture(state, action.fixtureId, actor)!.round.id, action.side);
      }
      return true;
    }
    case 'openFixture': {
      const card = visibleFixture(state, action.fixtureId, actor);
      if (card?.round.status !== 'settled') return false;
      event(state, action, 'club_result_opened', card.round.id);
      return true;
    }
    case 'readInvite': {
      const invite = state.invites.find(item => item.id === action.inviteId && item.to === actor);
      if (!invite || invite.read) return false;
      invite.read = true;
      return true;
    }
    case 'demo':
      state.demo = { ...state.demo, ...action.change, bonus: state.series ? state.demo.bonus : action.change.bonus ?? state.demo.bonus };
      return true;
    case 'mute':
      state.muted = state.muted.includes(action.player) ? state.muted.filter(p => p !== action.player) : [...state.muted, action.player];
      return true;
    case 'membership': {
      const removing = state.club.members.includes(action.player);
      state.club.members = removing ? state.club.members.filter(p => p !== action.player) : [...state.club.members, action.player];
      const round = currentRound(state);
      if (removing && round?.booking.club && round.status !== 'active' && seatFor(round, action.player)) {
        close(round, 'cancelled', 'cancelled', at);
      }
      return true;
    }
    case 'block': {
      if (action.player === action.other) return false;
      const { player, other } = action;
      state.blocked = isBlocked(state, player, other)
        ? state.blocked.filter(pair => !(pair.includes(player) && pair.includes(other)))
        : [...state.blocked, [player, other]];
      const round = currentRound(state);
      if (isBlocked(state, player, other) && round && round.status !== 'active' &&
          seatFor(round, player) && seatFor(round, other)) close(round, 'cancelled', 'cancelled', at);
      return true;
    }
    case 'tick': return false;
  }
}

export function reduce(state: DemoState, action: Action): DemoState {
  const current = reconcile(state, action.at);
  if (action.type === 'tick') return current;
  const next = structuredClone(current);
  return apply(next, action) ? next : current;
}

type WithoutActor<T> = T extends Action ? Omit<T, 'actor' | 'at'> : never;
export type Command = WithoutActor<Action>;
