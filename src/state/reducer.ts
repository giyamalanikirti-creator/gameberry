/**
 * The one reducer. Every state change goes through it, and the actor always
 * comes from the session context, never from the action payload.
 */
import { fixtureDice, randomDice } from '../engine/dice';
import { FIXTURES, FixtureName, guidedFixtureFor } from '../engine/fixtures';
import { createGame, moveToken, rollDie } from '../engine/rules';
import { DAY, INVITE_TTL, PLAY_NOW_WINDOW, SERIES_TTL, WINDOW_LENGTH, analyticsDate, endOfTomorrow, localDateKey, tomorrowIn, zonedTimeToUtc } from '../domain/time';
import { applyPublicStep, PUBLIC_SCRIPT, PUBLIC_START } from '../engine/publicMatch';
import { applyOpening } from './seed';
import { inviteLine, smartTimeLabel } from '../smart/smartFixture';
import type {
  Booking,
  ClubFixture,
  Invite,
  PlayerId,
  Round,
  Series,
  Settings,
  Side,
  Source,
  State,
  TeamSeat,
  TimeWindow,
  Route,
} from '../domain/types';
import {
  balance,
  bookingConfirmedBy,
  canHostGrudgeNight,
  isBlockedPair,
  isParticipant,
  isTerminal,
  liveFixtureForRound,
  liveSeats,
  openRound,
  rosterComplete,
  rosterOrInvited,
  roleOf,
  seatFor,
  seatIsStale,
  seriesRounds,
  seriesScore,
  seriesStatus,
  sharedClubId,
  termsHash,
  theSeries,
  windowOpen,
} from './selectors';

export interface Ctx {
  at: number;
  /** The signed-in player. Every consent-bearing action uses this, nothing else. */
  actor: PlayerId | null;
  source: 'product' | 'demo';
}

export type Action =
  | { type: 'LOG'; name: string; seriesId?: string; roundId?: string; detail?: Record<string, string | number | boolean | null> }
  | { type: 'SIGNED_IN' }
  | { type: 'PUBLIC_QUICK' }
  | { type: 'PUBLIC_MATCHED' }
  | { type: 'PUBLIC_ROLL' }
  | { type: 'PUBLIC_MOVE' }
  | { type: 'PUBLIC_OPPONENT' }
  | { type: 'PUBLIC_FAST_FORWARD' }
  | { type: 'SET_REMINDERS'; on: boolean }
  | { type: 'SEND_CHALLENGE'; format: 'singles' | 'doubles'; timing: 'now' | 'scheduled'; slots?: TimeWindow[] }
  | { type: 'RESPOND_CHALLENGE'; inviteId: string; accept: boolean; slotIndex?: number; customSlot?: TimeWindow }
  | { type: 'INVITE_PARTNER'; roundId: string; toPlayerId: PlayerId }
  | { type: 'RESPOND_PARTNER'; inviteId: string; accept: boolean }
  | { type: 'REPLACE_PARTNER'; seatId: string }
  | { type: 'RENEW_TERMS'; roundId: string }
  | { type: 'CANCEL_ROUND'; roundId: string }
  | { type: 'READY'; roundId: string }
  | { type: 'START_ROUND'; roundId: string }
  | { type: 'ROLL'; roundId: string }
  | { type: 'MOVE'; roundId: string }
  | { type: 'VOID_ROUND'; roundId: string }
  | { type: 'SAVE_SEAT'; roundId: string }
  | { type: 'HOST_GRUDGE_NIGHT'; seriesId: string; slots: TimeWindow[] }
  | { type: 'CHOOSE_SLOT'; bookingId: string; slotIndex: number }
  | { type: 'CONFIRM_BOOKING'; bookingId: string }
  | { type: 'PLAY_NOW_INSTEAD'; roundId: string }
  | { type: 'PROPOSE_SINGLES'; roundId: string }
  | { type: 'ACCEPT_SINGLES'; roundId: string }
  | { type: 'PREDICT'; fixtureId: string; side: Side }
  | { type: 'WITHDRAW_LISTING'; fixtureId: string }
  | { type: 'LEAVE_SERIES'; seriesId: string }
  | { type: 'REBOOK'; roundId: string }
  | { type: 'SET_MUTE'; seriesId: string; muted: boolean }
  | { type: 'BLOCK'; playerId: PlayerId; blocked: boolean }
  | { type: 'READ_NOTIFICATION'; id: string }
  // Demo drawer only
  | { type: 'DEMO_SETTINGS'; patch: Partial<Settings> }
  | { type: 'DEMO_AUTO_CONFIRM' }
  | { type: 'DEMO_AUTO_STEP'; roundId: string; sessionPlayer: PlayerId | null }
  | { type: 'DEMO_NOTE'; name: string; detail?: Record<string, string | number | boolean | null> }
  | { type: 'TICK' };

export interface Result {
  state: State;
  accepted: boolean;
  reason?: string;
  /** Id of a created or returned record, e.g. a duplicate invite. */
  ref?: string;
}

const NOTIFY_BUDGET = 2;

// ---------------------------------------------------------------------------
// Draft helpers (mutate a clone)
// ---------------------------------------------------------------------------

function nextId(d: State, prefix: string): string {
  d.seq += 1;
  return `${prefix}-${d.seq}`;
}

function track(d: State, name: string, at: number, source: Source, opts: { playerId?: PlayerId | null; seriesId?: string | null; roundId?: string | null; detail?: Record<string, string | number | boolean | null> } = {}): void {
  const playerId = opts.playerId ?? null;
  d.analytics.push({
    id: nextId(d, 'ev'),
    name,
    at,
    playerId,
    role: playerId ? roleOf(d, playerId) : null,
    seriesId: opts.seriesId ?? null,
    roundId: opts.roundId ?? null,
    source,
    detail: opts.detail ?? {},
  });
}

function ledger(d: State, playerId: PlayerId, roundId: string | null, kind: 'entry' | 'payout' | 'refund' | 'bonus', amount: number, key: string, at: number): boolean {
  if (d.wallet.some((e) => e.idempotencyKey === key)) return false;
  const after = balance(d, playerId) + amount;
  d.wallet.push({ id: nextId(d, 'w'), playerId, roundId, kind, amount, balanceAfter: after, idempotencyKey: key, createdAt: at });
  return true;
}

const REMINDER_KINDS = new Set(['table_open', 'window_open']);

/**
 * Local notification adapter. Mutes and reminders-off drop the alert (the card
 * stays). Past two alerts a day, the alert waits in the inbox, delivered tomorrow.
 */
function notify(d: State, to: PlayerId, kind: string, title: string, route: Route, at: number, source: Source, seriesId: string | null, body: string | null = null): void {
  const p = d.players[to];
  let reason: string | null = null;
  if (seriesId && p.mutedSeriesIds.includes(seriesId)) reason = 'muted';
  else if (p.remindersOff && REMINDER_KINDS.has(kind)) reason = 'reminders_off';
  if (reason) {
    track(d, 'notification_suppressed', at, source, { playerId: to, seriesId, detail: { kind, reason } });
    return;
  }
  const day = localDateKey(at, p.timezone);
  const today = d.notifications.filter((n) => n.to === to && n.deferredTo === null && localDateKey(n.createdAt, p.timezone) === day).length;
  let deferredTo: number | null = null;
  if (today >= NOTIFY_BUDGET) {
    const [y, m, dd] = tomorrowIn(at, p.timezone);
    deferredTo = zonedTimeToUtc(y, m, dd, 9, 0, p.timezone);
    track(d, 'notification_deferred', at, source, { playerId: to, seriesId, detail: { kind, reason: 'daily_cap' } });
  }
  d.notifications.push({ id: nextId(d, 'n'), to, kind, title, route, createdAt: at, readAt: null, deferredTo, body });
}

function name(d: State, p: PlayerId | null): string {
  return p ? d.players[p].name : 'someone';
}

function makeSeat(d: State, r: Round, side: Side, role: 'captain' | 'partner', playerId: PlayerId | null, status: TeamSeat['status']): TeamSeat {
  const seat: TeamSeat = { id: nextId(d, 'seat'), roundId: r.id, playerId, side, seatRole: role, inviteId: null, status, readyAt: null, termsHash: null, lastPlayerId: null };
  d.seats[seat.id] = seat;
  r.seatIds.push(seat.id);
  return seat;
}

/** One player consents to the current terms: seat accepted, plus a booking confirmation if a slot is chosen. */
function consent(d: State, r: Round, p: PlayerId, at: number, source: 'product' | 'demo'): void {
  const seat = seatFor(d, r, p);
  const hash = termsHash(d, r);
  if (seat && ['invited', 'accepted', 'ready'].includes(seat.status)) {
    if (seat.status === 'invited') seat.status = 'accepted';
    seat.termsHash = hash;
  }
  if (r.bookingId) {
    const b = d.bookings[r.bookingId];
    if (b.status === 'chosen' || b.status === 'confirmed') {
      b.confirmations = b.confirmations.filter((c) => c.playerId !== p);
      b.confirmations.push({ playerId: p, confirmedAt: at, termsHash: hash, source });
    }
  }
}

function newRound(d: State, series: Series, fields: Partial<Round> & Pick<Round, 'format' | 'timing'>, at: number, by: PlayerId): Round {
  const settled = seriesRounds(d, series).filter((x) => x.status === 'settled').length;
  const sc = seriesScore(d, series.id);
  const r: Round = {
    id: nextId(d, 'round'),
    seriesId: series.id,
    index: settled + 1,
    entryGold: fields.format === 'doubles' ? 100 : 200,
    status: 'proposed',
    seatIds: [],
    window: null,
    bookingId: null,
    clubVisible: false,
    isDecider: sc.A === 1 && sc.B === 1,
    game: null,
    outcome: null,
    settledAt: null,
    voidedAt: null,
    createdAt: at,
    createdBy: by,
    fixtureName: null,
    blockedStart: null,
    singlesSwitch: null,
    rebookedFromId: null,
    rebookedToId: null,
    humanStarted: false,
    closedReason: null,
    rosterVersion: 0,
    ...fields,
  };
  d.rounds[r.id] = r;
  series.roundIds.push(r.id);
  return r;
}

function validSlots(d: State, slots: TimeWindow[] | undefined, at: number, tz: string): string | null {
  if (!slots || slots.length < 1 || slots.length > 2) return 'offer one or two slots';
  const latest = endOfTomorrow(at, tz) + DAY; // today, tomorrow or the day after
  for (const w of slots) {
    if (w.end - w.start !== WINDOW_LENGTH) return 'slots are 30 minutes';
    if (w.start <= at) return 'slots must be in the future';
    if (w.start >= latest) return 'slots must start by the end of the day after tomorrow';
  }
  void d;
  return null;
}

function withdrawFixture(d: State, r: Round, at: number, source: Source, reason: string): void {
  const f = liveFixtureForRound(d, r.id);
  if (!f) return;
  f.status = 'withdrawn';
  f.closedReason = reason;
  track(d, 'fixture_withdrawn', at, source, { seriesId: r.seriesId, roundId: r.id, detail: { reason } });
  for (const p of rosterOrInvited(d, r)) notify(d, p, 'fixture_withdrawn', `Grudge Night listing withdrawn · ${reason}`, { name: 'round', id: r.id }, at, source, r.seriesId);
}

function closeOpenInvites(d: State, roundId: string, status: Invite['status'], at: number): void {
  for (const i of Object.values(d.invites)) if (i.roundId === roundId && i.status === 'open') { i.status = status; i.respondedAt = at; }
}

/** Move a round forward when its roster and consents allow. */
function advance(d: State, r: Round, at: number, source: Source): void {
  if (r.status !== 'filling') return;
  if (!rosterComplete(d, r) || liveSeats(d, r).some((x) => seatIsStale(d, r, x))) return;
  if (r.timing === 'now') {
    r.status = 'checkin';
    r.window = { start: at, end: at + PLAY_NOW_WINDOW };
    for (const p of rosterOrInvited(d, r)) notify(d, p, 'table_open', 'Your Badla table is open for 5 minutes', { name: 'round', id: r.id }, at, source, r.seriesId);
    track(d, 'checkin_opened', at, source, { seriesId: r.seriesId, roundId: r.id, detail: { timing: 'now' } });
    return;
  }
  const b = r.bookingId ? d.bookings[r.bookingId] : null;
  if (!b || b.chosenSlot === null || b.status === 'withdrawn') return;
  const roster = rosterOrInvited(d, r);
  if (!roster.every((p) => bookingConfirmedBy(d, b, p))) return;
  b.status = 'confirmed';
  r.status = 'confirmed';
  r.window = { ...b.proposedSlots[b.chosenSlot] };
  track(d, 'round_confirmed', at, source, { seriesId: r.seriesId, roundId: r.id });
  if (r.clubVisible && !liveFixtureForRound(d, r.id)) publishFixture(d, r, at, source);
}

function publishFixture(d: State, r: Round, at: number, source: Source): void {
  const series = d.series[r.seriesId!];
  const seats = liveSeats(d, r);
  const label = (side: Side) => {
    const cap = series.sides[side];
    const partner = seats.find((x) => x.side === side && x.seatRole === 'partner')?.playerId;
    return partner ? `${name(d, cap)} & ${name(d, partner)}` : name(d, cap);
  };
  const sc = seriesScore(d, series.id);
  const clubId = sharedClubId(d, rosterOrInvited(d, r))!;
  const f: ClubFixture = {
    id: nextId(d, 'fx'),
    clubId,
    roundId: r.id,
    teamLabels: { A: label('A'), B: label('B') },
    seriesScoreAtPublish: `${sc.B}-${sc.A}`,
    startsAt: r.window!.start,
    status: 'listed',
    publishedAt: at,
    winnerSide: null,
    closedReason: null,
  };
  d.fixtures[f.id] = f;
  track(d, 'fixture_published', at, source, { seriesId: r.seriesId, roundId: r.id, detail: { fixtureId: f.id } });
  for (const m of d.clubs[clubId].memberIds) {
    if (isParticipant(d, r.id, m)) continue;
    notify(d, m, 'fixture_published', `Grudge Night · ${f.teamLabels.B} vs ${f.teamLabels.A}`, { name: 'fixture', id: f.id }, at, source, null);
  }
}

/** One atomic start: validate everyone, then write all entry debits together. */
function startRound(d: State, r: Round, at: number, source: Source): string | null {
  if (r.status !== 'checkin') return 'round is not in check-in';
  if (!windowOpen(r, at)) return 'the window is closed';
  const seats = liveSeats(d, r);
  const need = r.format === 'doubles' ? 4 : 2;
  const block = (seat: TeamSeat | undefined, reason: string) => {
    r.blockedStart = { seatId: seat?.id ?? '', playerId: seat?.playerId ?? null, reason };
    track(d, 'round_start_blocked', at, source, { seriesId: r.seriesId, roundId: r.id, detail: { seatId: seat?.id ?? null, reason } });
    return reason;
  };
  if (seats.length !== need || seats.some((x) => !x.playerId)) return block(seats.find((x) => !x.playerId), 'A seat is empty');
  for (const x of seats) {
    if (seatIsStale(d, r, x)) return block(x, `${name(d, x.playerId)} needs to confirm the new terms`);
    if (x.status !== 'ready') return block(x, `Waiting for ${name(d, x.playerId)}`);
    if (balance(d, x.playerId!) < r.entryGold) return block(x, `${name(d, x.playerId)} needs ${r.entryGold} gold to join`);
  }
  // Every check passed: debit all seats together.
  for (const x of seats) ledger(d, x.playerId!, r.id, 'entry', -r.entryGold, `${r.id}:entry:${x.playerId}`, at);
  const series = d.series[r.seriesId!];
  const fixture: FixtureName | 'random' = d.settings.nextFixture === 'guided' ? guidedFixtureFor(r.index) : d.settings.nextFixture;
  const order: Side[] = r.format === 'doubles' ? ['A', 'B', 'A', 'B'] : ['A', 'B'];
  const roles: Array<'captain' | 'partner'> = r.format === 'doubles' ? ['captain', 'captain', 'partner', 'partner'] : ['captain', 'captain'];
  const script = fixture === 'random' ? FIXTURES[guidedFixtureFor(r.index)][r.format] : FIXTURES[fixture][r.format];
  const gameSeats = order.map((side, i) => {
    const seat = seats.find((x) => x.side === side && x.seatRole === roles[i])!;
    const pl = d.players[seat.playerId!];
    return { playerId: pl.id, color: pl.color!, side, distance: script.distances[i] };
  });
  const dice = fixture === 'random' ? randomDice((at ^ d.seq * 2654435761) | 0) : fixtureDice(fixture, script.rolls);
  r.game = createGame(r.format, gameSeats, dice);
  r.fixtureName = fixture;
  r.status = 'active';
  r.blockedStart = null;
  track(d, 'round_started', at, source, {
    seriesId: series.id,
    roundId: r.id,
    detail: { format: r.format, entries: seats.length, entryGold: r.entryGold, dice: fixture },
  });
  return null;
}

/** Idempotent by round id: a second call is a no-op. */
function settleRound(d: State, r: Round, at: number, source: Source): void {
  if (r.settledAt !== null || !r.game?.winnerSide) return;
  const winnerSide = r.game.winnerSide;
  r.outcome = { winnerSide };
  r.status = 'settled';
  r.settledAt = at;
  const seats = liveSeats(d, r);
  const winners = seats.filter((x) => x.side === winnerSide).map((x) => x.playerId!);
  const pot = r.entryGold * seats.length;
  for (const p of winners) ledger(d, p, r.id, 'payout', pot / winners.length, `${r.id}:payout:${p}`, at);
  const series = d.series[r.seriesId!];
  const sc = seriesScore(d, series.id);
  const won = sc.A >= 2 || sc.B >= 2;
  const sweep = won && (sc.A === 0 || sc.B === 0);
  if (sweep && series.sweepBonus) {
    const day = analyticsDate(at);
    for (const p of winners) {
      const already = d.wallet.some((e) => e.playerId === p && e.kind === 'bonus' && analyticsDate(e.createdAt) === day);
      if (!already) ledger(d, p, r.id, 'bonus', 100 / winners.length, `${r.id}:bonus:${p}`, at);
    }
  }
  const captainOf = (side: Side) => series.sides[side];
  for (const x of seats) {
    if (x.seatRole === 'partner' && x.side === winnerSide) {
      const id = nextId(d, 'assist');
      d.assists[id] = { id, roundId: r.id, playerId: x.playerId!, captainId: captainOf(winnerSide), seriesScoreAfter: `${sc[winnerSide]}-${sc[winnerSide === 'A' ? 'B' : 'A']}`, seatSavedForRoundId: null, savedAt: null };
      track(d, 'assist_awarded', at, source, { playerId: x.playerId, seriesId: series.id, roundId: r.id });
    }
  }
  track(d, 'round_settled', at, source, { seriesId: series.id, roundId: r.id, detail: { winnerSide, pot, score: `${sc.A}-${sc.B}` } });
  if (won) track(d, 'series_closed', at, source, { seriesId: series.id, detail: { winner: captainOf(sc.A >= 2 ? 'A' : 'B'), score: `${Math.max(sc.A, sc.B)}-${Math.min(sc.A, sc.B)}` } });
  const f = liveFixtureForRound(d, r.id);
  if (f) {
    f.status = 'settled';
    f.winnerSide = winnerSide;
    track(d, 'fixture_settled', at, source, { seriesId: series.id, roundId: r.id, detail: { fixtureId: f.id, winnerSide } });
    for (const pr of Object.values(d.predictions)) {
      if (pr.fixtureId === f.id) track(d, 'prediction_verdict', at, source, { playerId: pr.playerId, roundId: r.id, detail: { correct: pr.pickSide === winnerSide } });
    }
  }
}

function voidRound(d: State, r: Round, at: number, source: Source, reason: string): void {
  if (r.status !== 'active') return;
  r.status = 'voided';
  r.voidedAt = at;
  r.closedReason = reason;
  for (const x of liveSeats(d, r)) {
    const paid = d.wallet.some((e) => e.idempotencyKey === `${r.id}:entry:${x.playerId}`);
    if (paid) ledger(d, x.playerId!, r.id, 'refund', r.entryGold, `${r.id}:refund:${x.playerId}`, at);
  }
  const f = liveFixtureForRound(d, r.id);
  if (f) { f.status = 'voided'; f.closedReason = reason; }
  track(d, 'round_voided', at, source, { seriesId: r.seriesId, roundId: r.id, detail: { reason } });
}

function cancelRound(d: State, r: Round, at: number, source: Source, reason: string): void {
  r.status = 'cancelled';
  r.closedReason = reason;
  closeOpenInvites(d, r.id, 'withdrawn', at);
  if (r.bookingId) d.bookings[r.bookingId].status = 'withdrawn';
  withdrawFixture(d, r, at, source, reason);
  for (const x of liveSeats(d, r)) if (x.status === 'ready') x.status = 'accepted';
}

// ---------------------------------------------------------------------------
// Clock reconciliation. Time can open and close windows, expire invites,
// lock predictions and fire reminders. It can never settle a round or move gold.
// ---------------------------------------------------------------------------

export function reconcile(prev: State, at: number): State {
  const needs =
    Object.values(prev.invites).some((i) => i.status === 'open' && at >= i.expiresAt) ||
    Object.values(prev.rounds).some((r) => (r.status === 'confirmed' && r.window && at >= r.window.start) || (r.status === 'checkin' && r.window && at >= r.window.end)) ||
    Object.values(prev.fixtures).some((f) => f.status === 'listed' && at >= f.startsAt) ||
    Object.values(prev.series).some((s) => !s.expiredAt && !s.closedAt && at >= s.expiresAt && seriesStatus(prev, s.id) !== 'won' && !openRound(prev, s));
  if (!needs) return prev;
  const d = structuredClone(prev);
  const src: Source = 'product';
  for (const i of Object.values(d.invites)) {
    if (i.status !== 'open' || at < i.expiresAt) continue;
    i.status = 'expired';
    const r = d.rounds[i.roundId];
    track(d, 'invite_expired', at, src, { roundId: r.id, seriesId: r.seriesId, detail: { kind: i.kind } });
    if (i.kind === 'challenge' && r.status === 'proposed') { r.status = 'expired'; r.closedReason = 'No answer within 24 hours'; }
    if (i.kind === 'partner' && i.seatId) {
      const seat = d.seats[i.seatId];
      if (seat.status === 'invited') { seat.lastPlayerId = seat.playerId; seat.playerId = null; seat.status = 'open'; }
    }
  }
  for (const r of Object.values(d.rounds)) {
    if (r.status === 'confirmed' && r.window && at >= r.window.start) {
      if (at >= r.window.end) {
        r.status = 'expired';
        r.closedReason = 'Window closed before anyone checked in';
        const f = liveFixtureForRound(d, r.id);
        if (f) { f.status = 'voided'; f.closedReason = 'No-show'; }
        continue;
      }
      r.status = 'checkin';
      track(d, 'checkin_opened', at, src, { seriesId: r.seriesId, roundId: r.id, detail: { timing: 'scheduled' } });
      for (const p of rosterOrInvited(d, r)) notify(d, p, 'window_open', 'Your table is ready', { name: 'round', id: r.id }, at, src, r.seriesId, 'Check in within 30 minutes. Gold moves only when every seat is ready.');
    } else if (r.status === 'checkin' && r.window && at >= r.window.end) {
      // Ready wait ends at window close. Nothing was debited, so nothing to refund.
      r.status = 'expired';
      r.closedReason = 'The window closed before every seat was ready';
      for (const x of liveSeats(d, r)) if (x.status === 'ready') x.status = 'accepted';
      const f = liveFixtureForRound(d, r.id);
      if (f) { f.status = 'voided'; f.closedReason = 'No-show'; }
      track(d, 'round_expired', at, src, { seriesId: r.seriesId, roundId: r.id });
    }
  }
  for (const f of Object.values(d.fixtures)) {
    if (f.status === 'listed' && at >= f.startsAt) {
      f.status = 'locked';
      track(d, 'predictions_locked', at, src, { roundId: f.roundId, detail: { fixtureId: f.id } });
    }
  }
  for (const s of Object.values(d.series)) {
    if (!s.expiredAt && !s.closedAt && at >= s.expiresAt && seriesStatus(d, s.id) !== 'won' && !openRound(d, s)) {
      s.expiredAt = at;
      track(d, 'series_expired', at, src, { seriesId: s.id });
    }
  }
  return d;
}

// ---------------------------------------------------------------------------
// Reducer
// ---------------------------------------------------------------------------

export function reduce(prev: State, action: Action, ctx: Ctx): Result {
  const state = reconcile(prev, ctx.at);
  if (action.type === 'TICK') return { state, accepted: state !== prev };
  const d = structuredClone(state);
  const out = apply(d, action, ctx);
  if (typeof out === 'string') return { state, accepted: false, reason: out };
  if (out && 'noop' in out) return { state, accepted: true, ref: out.ref };
  return { state: d, accepted: true, ref: out?.ref };
}

type Outcome = string | void | { ref?: string } | { noop: true; ref?: string };

function apply(d: State, a: Exclude<Action, { type: 'TICK' }>, ctx: Ctx): Outcome {
  const { at, source } = ctx;
  const isDemo = a.type.startsWith('DEMO_');
  if (isDemo && source !== 'demo') return 'demo actions come from the Demo drawer only';
  if (isDemo) return applyDemo(d, a as Extract<Action, { type: `DEMO_${string}` }>, ctx);
  const me = ctx.actor;
  if (!me) return 'Sign in first';
  const player = d.players[me];

  switch (a.type) {
    case 'LOG': {
      if (a.name === 'receipt_view' && a.roundId && !d.receiptViews.includes(`${a.roundId}:${me}`)) d.receiptViews.push(`${a.roundId}:${me}`);
      track(d, a.name, at, source, { playerId: me, seriesId: a.seriesId ?? null, roundId: a.roundId ?? null, detail: a.detail });
      return;
    }
    case 'SIGNED_IN': {
      track(d, 'app_open', at, source, { playerId: me });
      return;
    }
    case 'READ_NOTIFICATION': {
      const n = d.notifications.find((x) => x.id === a.id);
      if (!n || n.to !== me) return 'not your notification';
      if (n.readAt) return { noop: true };
      n.readAt = at; // opening never consents
      track(d, 'notification_opened', at, source, { playerId: me, detail: { kind: n.kind } });
      return;
    }

    case 'PUBLIC_QUICK': {
      if (me !== 'riya') return 'In this story the public match is Riya\'s';
      if (d.opening.played) return 'The public match is already played';
      if (d.publicGame && d.publicGame.phase !== 'done') return { noop: true };
      d.publicGame = { phase: 'matchmaking', tokens: structuredClone(PUBLIC_START), turn: 'riya', die: null, index: 0, captured: false, log: [], startedAt: at };
      track(d, 'quick_match_started', at, source, { playerId: me });
      return;
    }
    case 'PUBLIC_MATCHED': {
      const g = d.publicGame;
      if (!g || g.phase !== 'matchmaking' || me !== 'riya') return 'not matchmaking';
      g.phase = 'playing';
      g.log.push('Matched with Gunjan · Quick · 100 gold');
      return;
    }
    case 'PUBLIC_ROLL':
    case 'PUBLIC_MOVE':
    case 'PUBLIC_OPPONENT': {
      const g = d.publicGame;
      if (!g || g.phase !== 'playing' || me !== 'riya') return 'No public match in progress';
      const step = PUBLIC_SCRIPT[g.index];
      if (!step) return 'The match is over';
      if (a.type === 'PUBLIC_OPPONENT' ? step.who !== 'gunjan' : step.who !== 'riya') return 'Not your turn';
      if (a.type === 'PUBLIC_ROLL') {
        if (g.die !== null) return 'Move first';
        g.die = step.roll;
        const res = applyPublicStep(g.tokens, g.index)!;
        if (!res.moved) { g.log.push(res.text); g.die = null; g.index += 1; g.turn = 'gunjan'; }
        return;
      }
      if (a.type === 'PUBLIC_MOVE' && g.die === null) return 'Roll first';
      const res = applyPublicStep(g.tokens, g.index);
      if (!res) return 'Illegal move';
      g.tokens = res.tokens;
      g.log.push(res.text);
      g.die = null;
      g.index += 1;
      if (res.captured) { g.captured = true; track(d, 'capture_seen', at, source, { playerId: me, detail: { squaresFromHome: 1 } }); }
      if (res.finished) {
        g.phase = 'done';
        applyOpening(d, at);
        track(d, 'quick_match_finished', at, source, { playerId: me, detail: { winner: 'gunjan', entry: 100 } });
        return;
      }
      g.turn = PUBLIC_SCRIPT[g.index]?.who ?? 'riya';
      return;
    }
    case 'PUBLIC_FAST_FORWARD': {
      const g = d.publicGame;
      if (!g || g.phase !== 'playing' || !g.captured || me !== 'riya') return 'Not available yet';
      while (g.index < PUBLIC_SCRIPT.length) {
        const res = applyPublicStep(g.tokens, g.index)!;
        g.tokens = res.tokens;
        g.log.push(res.text);
        g.index += 1;
        if (res.finished) break;
      }
      g.die = null;
      g.phase = 'done';
      applyOpening(d, at);
      track(d, 'quick_match_finished', at, source, { playerId: me, detail: { winner: 'gunjan', entry: 100, fastForward: true } });
      return;
    }
    case 'SET_REMINDERS': {
      if (player.remindersOff === !a.on) return { noop: true };
      player.remindersOff = !a.on;
      track(d, a.on ? 'reminders_on' : 'reminders_off', at, source, { playerId: me });
      return;
    }

    case 'SEND_CHALLENGE': {
      const op = d.opening;
      if (!op.played) return 'Play the public match first';
      if (player.accountKind !== 'full' || (me !== op.winnerId && me !== op.loserId)) return 'Only the two captains can start a Badla';
      const other = me === op.winnerId ? op.loserId : op.winnerId;
      if (isBlockedPair(d, me, other)) return 'Badla is off between you two';
      let series = theSeries(d);
      if (series) {
        const st = seriesStatus(d, series.id);
        if (st === 'won' || st === 'expired' || st === 'closed') return 'This series is over';
        const live = openRound(d, series);
        if (live) {
          const existing = Object.values(d.invites).find((i) => i.roundId === live.id && i.kind === 'challenge' && i.status === 'open');
          if (existing && existing.fromPlayerId === me) return { noop: true, ref: existing.id };
          if (existing) return `${name(d, existing.fromPlayerId)} already challenged you`;
          return 'A round is already in progress';
        }
      }
      if (a.timing === 'scheduled') {
        const bad = validSlots(d, a.slots, at, player.timezone);
        if (bad) return bad;
      }
      if (!series) {
        const id = nextId(d, 'series');
        series = {
          id,
          captainIds: [op.loserId, op.winnerId],
          sides: { A: op.loserId, B: op.winnerId },
          originMatchId: op.id,
          roundIds: [op.roundId],
          createdAt: at,
          expiresAt: at + SERIES_TTL,
          initiatedBy: me,
          sweepBonus: d.settings.sweepBonus,
          expiredAt: null,
          closedAt: null,
          closedBy: null,
        };
        d.series[id] = series;
        d.rounds[op.roundId].seriesId = id; // the opening win is carried forward exactly once
        track(d, 'series_created', at, source, { playerId: me, seriesId: id, detail: { carriedOpening: true } });
      }
      const r = newRound(d, series, { format: a.format, timing: a.timing }, at, me);
      const mySide: Side = series.sides.A === me ? 'A' : 'B';
      const theirSide: Side = mySide === 'A' ? 'B' : 'A';
      makeSeat(d, r, mySide, 'captain', me, 'accepted');
      const theirSeat = makeSeat(d, r, theirSide, 'captain', other, 'invited');
      if (a.format === 'doubles') {
        makeSeat(d, r, 'A', 'partner', null, 'open');
        makeSeat(d, r, 'B', 'partner', null, 'open');
      }
      if (a.timing === 'scheduled') {
        const b: Booking = { id: nextId(d, 'booking'), roundId: r.id, hostId: me, proposedSlots: a.slots!.map((w) => ({ ...w })), chosenSlot: null, confirmations: [], status: 'offered' };
        d.bookings[b.id] = b;
        r.bookingId = b.id;
      }
      consent(d, r, me, at, source);
      const inv: Invite = {
        id: nextId(d, 'inv'), roundId: r.id, seriesId: series.id, fromPlayerId: me, toPlayerId: other, kind: 'challenge',
        termsHash: termsHash(d, r), status: 'open', sentAt: at, respondedAt: null, expiresAt: at + INVITE_TTL, seatId: theirSeat.id,
      };
      d.invites[inv.id] = inv;
      theirSeat.inviteId = inv.id;
      track(d, 'challenge_sent', at, source, { playerId: me, seriesId: series.id, roundId: r.id, detail: { format: a.format, timing: a.timing, entry: r.entryGold, decider: r.isDecider } });
      const sc = seriesScore(d, series.id);
      const otherSide: Side = series.sides.A === other ? 'A' : 'B';
      const body = inviteLine({
        from: player.name, to: d.players[other].name, squaresFromHome: 1,
        timeLabel: a.timing === 'scheduled' ? smartTimeLabel(a.slots![0], at) : 'Now',
        score: `${sc[otherSide]}-${sc[otherSide === 'A' ? 'B' : 'A']}`,
      });
      notify(d, other, 'challenge', `${player.name} wants Badla`, { name: 'invite', id: inv.id }, at, source, series.id, body);
      return { ref: inv.id };
    }

    case 'RESPOND_CHALLENGE': {
      const inv = d.invites[a.inviteId];
      if (!inv || inv.kind !== 'challenge') return 'unknown invitation';
      if (inv.toPlayerId !== me) return `This invitation is for ${name(d, inv.toPlayerId)}`;
      if (inv.status !== 'open') return 'This invitation is no longer open';
      const r = d.rounds[inv.roundId];
      inv.respondedAt = at;
      if (!a.accept) {
        inv.status = 'declined';
        cancelRound(d, r, at, source, `${player.name} passed`);
        track(d, 'challenge_response', at, source, { playerId: me, seriesId: r.seriesId, roundId: r.id, detail: { response: 'pass' } });
        return;
      }
      let suggestedOther = false;
      if (r.bookingId) {
        const b = d.bookings[r.bookingId];
        if (a.customSlot) {
          // "Suggest another time": the challenger's acceptance goes stale and must be renewed.
          const bad = validSlots(d, [a.customSlot], at, player.timezone);
          if (bad) return bad;
          b.proposedSlots.push({ ...a.customSlot });
          b.chosenSlot = b.proposedSlots.length - 1;
          suggestedOther = true;
        } else {
          const i = a.slotIndex ?? (b.proposedSlots.length === 1 ? 0 : -1);
          if (i < 0 || i >= b.proposedSlots.length) return 'Choose a slot';
          b.chosenSlot = i;
        }
        b.status = 'chosen';
      }
      inv.status = 'accepted';
      r.status = 'filling';
      consent(d, r, me, at, source);
      // A single offered slot is the challenger's explicit consent to that slot.
      if (r.bookingId && !suggestedOther && d.bookings[r.bookingId].proposedSlots.length === 1) consent(d, r, d.bookings[r.bookingId].hostId, r.createdAt, 'product');
      if (suggestedOther) notify(d, inv.fromPlayerId, 'counter', `${player.name} suggested another time`, { name: 'round', id: r.id }, at, source, r.seriesId);
      track(d, 'challenge_response', at, source, { playerId: me, seriesId: r.seriesId, roundId: r.id, detail: { response: suggestedOther ? 'suggest_time' : 'accept', format: r.format, timing: r.timing } });
      advance(d, r, at, source);
      return;
    }

    case 'INVITE_PARTNER': {
      const r = d.rounds[a.roundId];
      if (!r || r.format !== 'doubles' || isTerminal(r) || r.status === 'active' || r.status === 'proposed') return 'Partners can be invited once the challenge is accepted';
      const series = d.series[r.seriesId!];
      const side: Side | null = series.sides.A === me ? 'A' : series.sides.B === me ? 'B' : null;
      if (!side) return 'Only a captain can invite a partner';
      const to = d.players[a.toPlayerId];
      if (!to || to.accountKind === 'clubOnly') return `${to?.name ?? 'That player'} can't take a seat`;
      if (!player.friendIds.includes(to.id)) return `${to.name} isn't on your friends list`;
      if (isBlockedPair(d, me, to.id)) return 'Badla is off with that player';
      if (r.clubVisible && !sharedClubId(d, [...series.captainIds, to.id])) return `${to.name} isn't in the club, so this can't be a Grudge Night`;
      const existing = Object.values(d.invites).find((i) => i.roundId === r.id && i.kind === 'partner' && i.toPlayerId === to.id && i.status === 'open');
      if (existing && existing.fromPlayerId === me) return { noop: true, ref: existing.id };
      if (rosterOrInvited(d, r).includes(to.id) || existing) return `${to.name} already has a seat in this round`;
      const seat = liveSeats(d, r).find((x) => x.side === side && x.seatRole === 'partner' && x.status === 'open');
      if (!seat) return 'Your partner seat is taken';
      seat.playerId = to.id;
      seat.status = 'invited';
      const inv: Invite = {
        id: nextId(d, 'inv'), roundId: r.id, seriesId: series.id, fromPlayerId: me, toPlayerId: to.id, kind: 'partner',
        termsHash: termsHash(d, r), status: 'open', sentAt: at, respondedAt: null, expiresAt: at + INVITE_TTL, seatId: seat.id,
      };
      d.invites[inv.id] = inv;
      seat.inviteId = inv.id;
      track(d, 'partner_invited', at, source, { playerId: me, seriesId: series.id, roundId: r.id, detail: { partner: to.id, side } });
      notify(d, to.id, 'partner', `${player.name} invited you to Badla Doubles`, { name: 'invite', id: inv.id }, at, source, series.id);
      return { ref: inv.id };
    }

    case 'RESPOND_PARTNER': {
      const inv = d.invites[a.inviteId];
      if (!inv || inv.kind !== 'partner') return 'unknown invitation';
      if (inv.toPlayerId !== me) return `This invitation is for ${name(d, inv.toPlayerId)}`;
      if (inv.status !== 'open') return 'This invitation is no longer open';
      const r = d.rounds[inv.roundId];
      const seat = d.seats[inv.seatId!];
      inv.respondedAt = at;
      const side = seat.side;
      if (!a.accept) {
        inv.status = 'declined';
        seat.lastPlayerId = me;
        seat.playerId = null;
        seat.status = 'open';
        seat.inviteId = null;
        track(d, 'partner_declined', at, source, { playerId: me, seriesId: r.seriesId, roundId: r.id, detail: { side } });
        return;
      }
      inv.status = 'accepted';
      consent(d, r, me, at, source);
      track(d, 'partner_accepted', at, source, { playerId: me, seriesId: r.seriesId, roundId: r.id, detail: { player: me, side, entry: r.entryGold } });
      advance(d, r, at, source);
      return;
    }

    case 'REPLACE_PARTNER': {
      const seat = d.seats[a.seatId];
      if (!seat || seat.seatRole !== 'partner') return 'unknown seat';
      const r = d.rounds[seat.roundId];
      const series = d.series[r.seriesId!];
      if (series.sides[seat.side] !== me) return 'Only that side\'s captain can replace a partner';
      if (r.status === 'active' || isTerminal(r)) return 'Partners can only change before the start';
      if (seat.status === 'open') return { noop: true };
      if (seat.inviteId && d.invites[seat.inviteId].status === 'open') { d.invites[seat.inviteId].status = 'withdrawn'; }
      seat.status = 'replaced';
      makeSeat(d, r, seat.side, 'partner', null, 'open').lastPlayerId = seat.playerId;
      // An accepted roster changed: every acceptance goes stale.
      r.rosterVersion += 1;
      if (r.status === 'checkin' || r.status === 'confirmed') { r.status = 'filling'; r.window = r.timing === 'now' ? null : r.window; }
      if (r.bookingId && d.bookings[r.bookingId].status === 'confirmed') d.bookings[r.bookingId].status = 'chosen';
      withdrawFixture(d, r, at, source, 'roster changed');
      r.clubVisible = false;
      track(d, 'partner_replaced', at, source, { playerId: me, seriesId: r.seriesId, roundId: r.id });
      return;
    }

    case 'RENEW_TERMS': {
      const r = d.rounds[a.roundId];
      if (!r || isTerminal(r) || r.status === 'active') return 'Nothing to confirm';
      const seat = seatFor(d, r, me);
      if (!seat || !seatIsStale(d, r, seat)) return 'Nothing to confirm';
      consent(d, r, me, at, source);
      track(d, 'terms_renewed', at, source, { playerId: me, seriesId: r.seriesId, roundId: r.id });
      advance(d, r, at, source);
      return;
    }

    case 'CANCEL_ROUND': {
      const r = d.rounds[a.roundId];
      if (!r || isTerminal(r)) return 'Nothing to cancel';
      if (r.status === 'active') return 'The match has started';
      const series = d.series[r.seriesId!];
      if (!series.captainIds.includes(me)) return 'Only a captain can cancel';
      cancelRound(d, r, at, source, `${player.name} cancelled`);
      track(d, 'round_cancelled', at, source, { playerId: me, seriesId: series.id, roundId: r.id });
      return;
    }

    case 'READY': {
      const r = d.rounds[a.roundId];
      if (!r || r.status !== 'checkin') return 'Check-in is not open';
      if (!windowOpen(r, at)) return 'The window is closed';
      const seat = seatFor(d, r, me);
      if (!seat) return 'You have no seat at this table';
      if (seat.status === 'ready') return 'You are already ready';
      if (seatIsStale(d, r, seat)) return 'Terms changed · Confirm again first';
      if (seat.status !== 'accepted') return 'Your seat is not confirmed';
      seat.status = 'ready';
      seat.readyAt = at;
      track(d, 'ready', at, source, { playerId: me, seriesId: r.seriesId, roundId: r.id });
      if (liveSeats(d, r).every((x) => x.status === 'ready')) startRound(d, r, at, source);
      return;
    }

    case 'START_ROUND': {
      const r = d.rounds[a.roundId];
      if (!r) return 'unknown round';
      if (!seatFor(d, r, me)) return 'You have no seat at this table';
      if (r.status === 'active') return 'Already started';
      const err = startRound(d, r, at, source);
      if (err) return { ref: err };
      return;
    }

    case 'ROLL':
    case 'MOVE': {
      const r = d.rounds[a.roundId];
      if (!r || r.status !== 'active' || !r.game) return 'No match in progress';
      const g = r.game;
      if (g.seats[g.turn].playerId !== me) return `It's ${name(d, g.seats[g.turn].playerId as PlayerId)}'s turn`;
      const next = a.type === 'ROLL' ? rollDie(g, g.turn) : moveToken(g, g.turn);
      if (!next) return a.type === 'ROLL' ? 'Move first' : 'Roll first';
      r.game = next;
      if (source === 'product') r.humanStarted = true;
      track(d, a.type === 'ROLL' ? 'roll' : 'move', at, source, { playerId: me, seriesId: r.seriesId, roundId: r.id, detail: a.type === 'ROLL' ? { value: next.die ?? next.note?.roll ?? 0 } : { to: next.seats[g.turn].pos } });
      if (next.winnerSide) settleRound(d, r, at, source);
      return;
    }

    case 'VOID_ROUND': {
      const r = d.rounds[a.roundId];
      if (!r || r.status !== 'active') return 'No match in progress';
      if (!seatFor(d, r, me)) return 'You have no seat at this table';
      voidRound(d, r, at, source, `${player.name} left the match`);
      return;
    }

    case 'SAVE_SEAT': {
      const r = d.rounds[a.roundId];
      if (!r || r.status !== 'settled') return 'unknown round';
      const seat = seatFor(d, r, me);
      if (!seat || seat.seatRole !== 'partner') return 'Only a partner can save a seat';
      const key = `${r.id}:${me}`;
      if (d.seatSaves.includes(key)) return { noop: true };
      d.seatSaves.push(key);
      const assist = Object.values(d.assists).find((x) => x.roundId === r.id && x.playerId === me);
      if (assist) { assist.seatSavedForRoundId = 'decider'; assist.savedAt = at; }
      track(d, 'seat_saved', at, source, { playerId: me, seriesId: r.seriesId, roundId: r.id });
      return;
    }

    case 'HOST_GRUDGE_NIGHT': {
      const series = d.series[a.seriesId];
      if (!series || !series.captainIds.includes(me)) return 'Only a captain can host';
      if (!canHostGrudgeNight(d, series.id)) return 'Grudge Night needs 1-1 and a club both captains share';
      const bad = validSlots(d, a.slots, at, player.timezone);
      if (bad) return bad;
      const last = seriesRounds(d, series).filter((x) => x.status === 'settled').pop()!;
      const r = newRound(d, series, { format: 'doubles', timing: 'scheduled', clubVisible: true, isDecider: true, entryGold: 100 }, at, me);
      if (last.format === 'doubles' && liveSeats(d, last).length === 4) {
        for (const x of liveSeats(d, last)) makeSeat(d, r, x.side, x.seatRole, x.playerId, 'invited');
      } else {
        // Singles history: each captain brings backup for the four-seat Grudge Night.
        makeSeat(d, r, 'A', 'captain', series.sides.A, 'invited');
        makeSeat(d, r, 'B', 'captain', series.sides.B, 'invited');
        makeSeat(d, r, 'A', 'partner', null, 'open');
        makeSeat(d, r, 'B', 'partner', null, 'open');
      }
      r.status = 'filling';
      const b: Booking = { id: nextId(d, 'booking'), roundId: r.id, hostId: me, proposedSlots: a.slots.map((w) => ({ ...w })), chosenSlot: null, confirmations: [], status: 'offered' };
      d.bookings[b.id] = b;
      r.bookingId = b.id;
      const other = series.captainIds.find((p) => p !== me)!;
      const inv: Invite = {
        id: nextId(d, 'inv'), roundId: r.id, seriesId: series.id, fromPlayerId: me, toPlayerId: other, kind: 'bookingSlot',
        termsHash: termsHash(d, r), status: 'open', sentAt: at, respondedAt: null, expiresAt: at + INVITE_TTL, seatId: null,
      };
      d.invites[inv.id] = inv;
      track(d, 'slots_offered', at, source, { playerId: me, seriesId: series.id, roundId: r.id, detail: { slots: a.slots.length, club: true } });
      notify(d, other, 'booking', `${player.name} wants to host Grudge Night · pick a slot`, { name: 'booking', id: b.id }, at, source, series.id);
      return { ref: b.id };
    }

    case 'CHOOSE_SLOT': {
      const b = d.bookings[a.bookingId];
      if (!b) return 'unknown booking';
      const r = d.rounds[b.roundId];
      const series = d.series[r.seriesId!];
      if (!series.captainIds.includes(me) || me === b.hostId) return 'The other captain chooses the slot';
      if (b.status !== 'offered') return 'A slot is already chosen';
      if (a.slotIndex < 0 || a.slotIndex >= b.proposedSlots.length) return 'Choose one of the offered slots';
      b.chosenSlot = a.slotIndex;
      b.status = 'chosen';
      const inv = Object.values(d.invites).find((i) => i.roundId === r.id && i.kind === 'bookingSlot' && i.status === 'open');
      if (inv) { inv.status = 'accepted'; inv.respondedAt = at; }
      consent(d, r, me, at, source);
      // A single offered slot is the host's explicit consent to that slot.
      if (b.proposedSlots.length === 1) consent(d, r, b.hostId, at, 'product');
      track(d, 'slot_chosen', at, source, { playerId: me, seriesId: series.id, roundId: r.id, detail: { slot: a.slotIndex } });
      advance(d, r, at, source);
      return;
    }

    case 'CONFIRM_BOOKING': {
      const b = d.bookings[a.bookingId];
      if (!b) return 'unknown booking';
      const r = d.rounds[b.roundId];
      if (!rosterOrInvited(d, r).includes(me)) return 'You have no seat in this round';
      if (b.status !== 'chosen') return b.status === 'offered' ? 'Waiting for a slot to be chosen' : 'This booking is closed';
      if (bookingConfirmedBy(d, b, me)) return { noop: true };
      consent(d, r, me, at, source);
      const count = rosterOrInvited(d, r).filter((p) => bookingConfirmedBy(d, b, p)).length;
      track(d, 'booking_confirmed', at, source, { playerId: me, seriesId: r.seriesId, roundId: r.id, detail: { confirmed: count, of: r.format === 'doubles' ? 4 : 2 } });
      advance(d, r, at, source);
      return;
    }

    case 'PLAY_NOW_INSTEAD': {
      const r = d.rounds[a.roundId];
      if (!r || isTerminal(r) || r.status === 'active' || r.status === 'checkin') return 'Not available now';
      const series = d.series[r.seriesId!];
      if (!series.captainIds.includes(me)) return 'Only a captain can change the timing';
      if (r.timing === 'now') return { noop: true };
      r.timing = 'now';
      r.window = null;
      if (r.bookingId) d.bookings[r.bookingId].status = 'withdrawn';
      r.bookingId = null;
      withdrawFixture(d, r, at, source, 'switched to Play now');
      r.clubVisible = false;
      r.status = 'filling';
      consent(d, r, me, at, source);
      track(d, 'timing_changed', at, source, { playerId: me, seriesId: series.id, roundId: r.id, detail: { timing: 'now' } });
      advance(d, r, at, source);
      return;
    }

    case 'PROPOSE_SINGLES': {
      const r = d.rounds[a.roundId];
      if (!r || r.format !== 'doubles' || isTerminal(r) || r.status === 'active') return 'Not available';
      const series = d.series[r.seriesId!];
      if (!series.captainIds.includes(me)) return 'Only a captain can propose singles';
      if (r.singlesSwitch) return { noop: true };
      r.singlesSwitch = { proposedBy: me };
      track(d, 'singles_switch_proposed', at, source, { playerId: me, seriesId: series.id, roundId: r.id });
      const other = series.captainIds.find((p) => p !== me)!;
      notify(d, other, 'singles', `${player.name} suggests switching the decider to singles`, { name: 'round', id: r.id }, at, source, series.id);
      return;
    }

    case 'ACCEPT_SINGLES': {
      const r = d.rounds[a.roundId];
      if (!r || !r.singlesSwitch || isTerminal(r) || r.status === 'active') return 'No switch to accept';
      const series = d.series[r.seriesId!];
      if (!series.captainIds.includes(me) || r.singlesSwitch.proposedBy === me) return 'The other captain accepts';
      r.format = 'singles';
      r.entryGold = 200;
      r.singlesSwitch = null;
      for (const x of liveSeats(d, r)) if (x.seatRole === 'partner') { x.status = 'dissolved'; if (x.inviteId && d.invites[x.inviteId].status === 'open') d.invites[x.inviteId].status = 'withdrawn'; }
      r.rosterVersion += 1;
      withdrawFixture(d, r, at, source, 'switched to singles');
      r.clubVisible = false;
      r.timing = 'now';
      r.window = null;
      if (r.bookingId) d.bookings[r.bookingId].status = 'withdrawn';
      r.bookingId = null;
      r.status = 'filling';
      consent(d, r, me, at, source);
      track(d, 'singles_switch_accepted', at, source, { playerId: me, seriesId: series.id, roundId: r.id, detail: { entry: 200 } });
      advance(d, r, at, source);
      return;
    }

    case 'PREDICT': {
      const f = d.fixtures[a.fixtureId];
      if (!f || !d.clubs[f.clubId].memberIds.includes(me)) return 'Not available';
      if (isParticipant(d, f.roundId, me)) return "You're playing this one";
      if (f.status !== 'listed' || at >= f.startsAt) return 'Predictions are locked';
      const existing = Object.values(d.predictions).find((p) => p.fixtureId === f.id && p.playerId === me);
      if (existing) {
        if (existing.pickSide === a.side) return { noop: true };
        existing.pickSide = a.side;
        existing.updatedAt = at;
        track(d, 'prediction_updated', at, source, { playerId: me, roundId: f.roundId, detail: { side: a.side } });
        return;
      }
      const id = nextId(d, 'pred');
      d.predictions[id] = { id, fixtureId: f.id, playerId: me, pickSide: a.side, createdAt: at, updatedAt: at };
      track(d, 'prediction_created', at, source, { playerId: me, roundId: f.roundId, detail: { side: a.side } });
      return;
    }

    case 'WITHDRAW_LISTING': {
      const f = d.fixtures[a.fixtureId];
      if (!f) return 'unknown fixture';
      const r = d.rounds[f.roundId];
      if (!d.series[r.seriesId!].captainIds.includes(me)) return 'Only a captain can withdraw the listing';
      if (f.status !== 'listed' && f.status !== 'locked') return 'This listing is already closed';
      withdrawFixture(d, r, at, source, `${player.name} withdrew the listing`);
      r.clubVisible = false;
      return;
    }

    case 'LEAVE_SERIES': {
      const series = d.series[a.seriesId];
      if (!series) return 'unknown series';
      const live = openRound(d, series);
      if (live?.status === 'active') return 'Finish or leave the match first';
      if (series.captainIds.includes(me)) {
        series.closedAt = at;
        series.closedBy = me;
        if (live) cancelRound(d, live, at, source, `${player.name} left the series`);
        track(d, 'series_left', at, source, { playerId: me, seriesId: series.id, detail: { role: 'captain' } });
        return;
      }
      const seat = live ? seatFor(d, live, me) : null;
      if (!live || !seat) return 'You have no seat in an upcoming round';
      seat.status = 'forfeited';
      if (seat.inviteId && d.invites[seat.inviteId].status === 'open') d.invites[seat.inviteId].status = 'withdrawn';
      makeSeat(d, live, seat.side, 'partner', null, 'open').lastPlayerId = me;
      live.rosterVersion += 1;
      withdrawFixture(d, live, at, source, `${player.name} dropped out`);
      live.clubVisible = false;
      if (live.bookingId) d.bookings[live.bookingId].status = 'withdrawn';
      live.bookingId = null;
      live.timing = 'now';
      live.window = null;
      live.status = 'filling';
      track(d, 'series_left', at, source, { playerId: me, seriesId: series.id, roundId: live.id, detail: { role: 'partner' } });
      return;
    }

    case 'REBOOK': {
      const r = d.rounds[a.roundId];
      if (!r || r.status !== 'expired' || !r.seriesId) return 'Only an expired round can be rebooked';
      const series = d.series[r.seriesId];
      if (!series.captainIds.includes(me)) return 'Only a captain can rebook';
      if (r.rebookedToId) return { noop: true, ref: r.rebookedToId };
      if (openRound(d, series)) return 'Another round is already open';
      const n = newRound(d, series, { format: r.format, timing: 'now', isDecider: r.isDecider, entryGold: r.entryGold, rebookedFromId: r.id }, at, me);
      for (const x of liveSeats(d, r)) if (x.playerId) makeSeat(d, n, x.side, x.seatRole, x.playerId, 'accepted');
      n.status = 'filling';
      r.rebookedToId = n.id;
      consent(d, n, me, at, source);
      track(d, 'round_rebooked', at, source, { playerId: me, seriesId: series.id, roundId: n.id, detail: { from: r.id } });
      for (const p of rosterOrInvited(d, n)) if (p !== me) notify(d, p, 'rebook', `${player.name} rebooked the round · confirm to play`, { name: 'round', id: n.id }, at, source, series.id);
      return { ref: n.id };
    }

    case 'SET_MUTE': {
      const muted = player.mutedSeriesIds.includes(a.seriesId);
      if (muted === a.muted) return { noop: true };
      player.mutedSeriesIds = a.muted ? [...player.mutedSeriesIds, a.seriesId] : player.mutedSeriesIds.filter((x) => x !== a.seriesId);
      track(d, a.muted ? 'push_muted' : 'push_unmuted', at, source, { playerId: me, seriesId: a.seriesId });
      return;
    }

    case 'BLOCK': {
      if (a.playerId === me) return 'You cannot block yourself';
      const has = player.blockedPlayerIds.includes(a.playerId);
      if (has === a.blocked) return { noop: true };
      player.blockedPlayerIds = a.blocked ? [...player.blockedPlayerIds, a.playerId] : player.blockedPlayerIds.filter((x) => x !== a.playerId);
      if (a.blocked) {
        // Blocking instantly ends every Badla link with that player.
        for (const r of Object.values(d.rounds)) {
          if (isTerminal(r) || !r.seriesId) continue;
          const roster = rosterOrInvited(d, r);
          const linked = roster.includes(me) && roster.includes(a.playerId);
          const inviteLink = Object.values(d.invites).some((i) => i.roundId === r.id && i.status === 'open' && [i.fromPlayerId, i.toPlayerId].includes(me) && [i.fromPlayerId, i.toPlayerId].includes(a.playerId));
          if (!linked && !inviteLink) continue;
          if (r.status === 'active') voidRound(d, r, at, source, 'blocked');
          else cancelRound(d, r, at, source, 'Badla links ended');
        }
      }
      track(d, a.blocked ? 'player_blocked' : 'player_unblocked', at, source, { playerId: me, detail: { other: a.playerId } });
      return;
    }
  }
}

function applyDemo(d: State, a: Extract<Action, { type: `DEMO_${string}` }>, ctx: Ctx): Outcome {
  const { at } = ctx;
  switch (a.type) {
    case 'DEMO_SETTINGS': {
      if (a.patch.sweepBonus !== undefined && a.patch.sweepBonus !== d.settings.sweepBonus && Object.keys(d.series).length > 0) {
        return 'The sweep bonus is locked once a series begins';
      }
      d.settings = { ...d.settings, ...a.patch };
      track(d, 'demo_settings', at, 'demo', { detail: Object.fromEntries(Object.entries(a.patch).map(([k, v]) => [k, v as string | boolean])) });
      return;
    }
    case 'DEMO_NOTE': {
      track(d, a.name, at, 'demo', { detail: a.detail });
      return;
    }
    case 'DEMO_AUTO_CONFIRM': {
      let n = 0;
      for (const r of Object.values(d.rounds)) {
        if (isTerminal(r) || r.status === 'active' || r.status === 'proposed') continue;
        const b = r.bookingId ? d.bookings[r.bookingId] : null;
        for (const p of rosterOrInvited(d, r)) {
          const seat = seatFor(d, r, p)!;
          const needsBooking = b && b.status === 'chosen' && !bookingConfirmedBy(d, b, p);
          if (needsBooking || seatIsStale(d, r, seat) || seat.status === 'invited') {
            if (seat.inviteId && d.invites[seat.inviteId]?.status === 'open') { d.invites[seat.inviteId].status = 'accepted'; d.invites[seat.inviteId].respondedAt = at; }
            consent(d, r, p, at, 'demo');
            n++;
          }
        }
        advance(d, r, at, 'demo');
      }
      track(d, 'demo_auto_confirm', at, 'demo', { detail: { confirmations: n } });
      return n ? undefined : { noop: true };
    }
    case 'DEMO_AUTO_STEP': {
      const r = d.rounds[a.roundId];
      if (!r || r.status !== 'active' || !r.game || !d.settings.autoPlay) return 'auto-play is off';
      if (!r.humanStarted) return 'auto-play waits for a human to start the match';
      const g = r.game;
      const seat = g.seats[g.turn];
      if (seat.playerId === a.sessionPlayer) return 'it is your turn';
      const next = g.die === null ? rollDie(g, g.turn) : moveToken(g, g.turn);
      if (!next) return 'no move';
      r.game = next;
      track(d, g.die === null ? 'roll' : 'move', at, 'demo', { playerId: seat.playerId as PlayerId, roundId: r.id, seriesId: r.seriesId, detail: { auto: true } });
      if (next.winnerSide) settleRound(d, r, at, 'demo');
      return;
    }
  }
}

/** Convenience for tests and scene scripts. */
export function run(state: State, steps: Array<[Action, Ctx]>): State {
  return steps.reduce((s, [a, c]) => reduce(s, a, c).state, state);
}

