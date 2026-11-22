/** Derived values, computed on read so they cannot drift. */
import { inWindow } from '../domain/time';
import type {
  Booking,
  ClubFixture,
  Invite,
  PlayerId,
  Round,
  Series,
  Side,
  State,
  TeamSeat,
} from '../domain/types';
import { TERMINAL_ROUND } from '../domain/types';

export function balance(s: State, p: PlayerId): number {
  return s.wallet.reduce((sum, e) => (e.playerId === p ? sum + e.amount : sum), 0);
}

export function totalGold(s: State): number {
  return s.wallet.reduce((sum, e) => sum + e.amount, 0);
}

export function seriesRounds(s: State, series: Series): Round[] {
  return series.roundIds.map((id) => s.rounds[id]).filter(Boolean);
}

export function seriesScore(s: State, seriesId: string): Record<Side, number> {
  const series = s.series[seriesId];
  const score: Record<Side, number> = { A: 0, B: 0 };
  if (!series) return score;
  for (const r of seriesRounds(s, series)) if (r.status === 'settled' && r.outcome) score[r.outcome.winnerSide] += 1;
  return score;
}

/** "1-1" from a captain's point of view, or A-B. */
export function scoreText(s: State, seriesId: string, forSide: Side = 'A'): string {
  const sc = seriesScore(s, seriesId);
  return forSide === 'A' ? `${sc.A}-${sc.B}` : `${sc.B}-${sc.A}`;
}

export type SeriesStatus = 'open' | 'tied' | 'won' | 'expired' | 'closed';

export function seriesStatus(s: State, seriesId: string): SeriesStatus {
  const series = s.series[seriesId];
  const sc = seriesScore(s, seriesId);
  if (sc.A >= 2 || sc.B >= 2) return 'won';
  if (series.closedAt) return 'closed';
  if (series.expiredAt) return 'expired';
  return sc.A === 1 && sc.B === 1 ? 'tied' : 'open';
}

export function seriesWinner(s: State, seriesId: string): Side | null {
  const sc = seriesScore(s, seriesId);
  return sc.A >= 2 ? 'A' : sc.B >= 2 ? 'B' : null;
}

/** The single series in this story (one per opening match). */
export function theSeries(s: State): Series | null {
  return Object.values(s.series).find((x) => x.originMatchId === s.opening.id) ?? null;
}

export function sideOf(series: Series, p: PlayerId): Side | null {
  return series.sides.A === p ? 'A' : series.sides.B === p ? 'B' : null;
}

export function seatsOf(s: State, r: Round): TeamSeat[] {
  return r.seatIds.map((id) => s.seats[id]);
}

/** Seats that count for the roster (not replaced/dissolved). */
export function liveSeats(s: State, r: Round): TeamSeat[] {
  return seatsOf(s, r).filter((x) => x.status !== 'replaced' && x.status !== 'dissolved');
}

export function seatFor(s: State, r: Round, p: PlayerId): TeamSeat | null {
  return liveSeats(s, r).find((x) => x.playerId === p) ?? null;
}

export function rosterIds(s: State, r: Round): PlayerId[] {
  return liveSeats(s, r).flatMap((x) => (x.playerId && x.status !== 'declined' && x.status !== 'forfeited' ? [x.playerId] : []));
}

function djb2(str: string): string {
  let h = 5381;
  for (let i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

/** Terms a player agrees to: format, entry, roster and time. Any change forces re-acceptance. */
export function termsHash(s: State, r: Round): string {
  const booking = r.bookingId ? s.bookings[r.bookingId] : null;
  const slot = booking && booking.chosenSlot !== null ? booking.proposedSlots[booking.chosenSlot].start : r.timing === 'now' ? 'now' : 'tbd';
  return djb2(`${r.format}|${r.entryGold}|v${r.rosterVersion}|${r.timing}|${slot}|${r.clubVisible}`);
}

export function seatIsStale(s: State, r: Round, seat: TeamSeat): boolean {
  return (seat.status === 'accepted' || seat.status === 'ready') && seat.termsHash !== termsHash(s, r);
}

export function rosterComplete(s: State, r: Round): boolean {
  const need = r.format === 'doubles' ? 4 : 2;
  const seats = liveSeats(s, r);
  return seats.length === need && seats.every((x) => x.playerId && (x.status === 'accepted' || x.status === 'ready'));
}

export function isTerminal(r: Round): boolean {
  return TERMINAL_ROUND.has(r.status);
}

export function currentRound(s: State, series: Series): Round | null {
  const rounds = seriesRounds(s, series).filter((r) => r.id !== s.opening.roundId);
  const open = rounds.filter((r) => !isTerminal(r));
  return open[open.length - 1] ?? rounds[rounds.length - 1] ?? null;
}

export function openRound(s: State, series: Series): Round | null {
  return seriesRounds(s, series).find((r) => !isTerminal(r)) ?? null;
}

export function windowOpen(r: Round, at: number): boolean {
  return !!r.window && inWindow(r.window, at);
}

export function lastSettledRound(s: State, series: Series): Round | null {
  const settled = seriesRounds(s, series).filter((r) => r.status === 'settled');
  return settled[settled.length - 1] ?? null;
}

/** Score 1-1, last round Doubles with both pairs, and all four share a club. */
export function canHostGrudgeNight(s: State, seriesId: string): boolean {
  const series = s.series[seriesId];
  if (!series || seriesStatus(s, seriesId) !== 'tied' || openRound(s, series)) return false;
  const last = lastSettledRound(s, series);
  if (!last || last.format !== 'doubles') return false;
  const four = rosterIds(s, last);
  if (four.length !== 4) return false;
  return Object.values(s.clubs).some((c) => four.every((p) => c.memberIds.includes(p)));
}

export function sharedClubId(s: State, players: PlayerId[]): string | null {
  return Object.values(s.clubs).find((c) => players.every((p) => c.memberIds.includes(p)))?.id ?? null;
}

export function bookingConfirmedBy(s: State, b: Booking, p: PlayerId): boolean {
  const r = s.rounds[b.roundId];
  const hash = termsHash(s, r);
  return b.confirmations.some((c) => c.playerId === p && c.termsHash === hash);
}

export function bookingCount(s: State, b: Booking): { done: number; need: number } {
  const r = s.rounds[b.roundId];
  const roster = rosterOrInvited(s, r);
  return { done: roster.filter((p) => bookingConfirmedBy(s, b, p)).length, need: r.format === 'doubles' ? 4 : 2 };
}

/** Everyone holding or invited to a seat (used for booking confirmations). */
export function rosterOrInvited(s: State, r: Round): PlayerId[] {
  return liveSeats(s, r).flatMap((x) => (x.playerId && x.status !== 'declined' && x.status !== 'forfeited' ? [x.playerId] : []));
}

export function liveFixtureForRound(s: State, roundId: string): ClubFixture | null {
  return Object.values(s.fixtures).find((f) => f.roundId === roundId && f.status !== 'withdrawn' && f.status !== 'voided') ?? null;
}

export function predictionTotals(s: State, fixtureId: string): Record<Side, number> | null {
  const f = s.fixtures[fixtureId];
  if (!f || f.status !== 'settled') return null;
  const t: Record<Side, number> = { A: 0, B: 0 };
  for (const p of Object.values(s.predictions)) if (p.fixtureId === fixtureId) t[p.pickSide] += 1;
  return t;
}

export function predictionOf(s: State, fixtureId: string, p: PlayerId) {
  return Object.values(s.predictions).find((x) => x.fixtureId === fixtureId && x.playerId === p) ?? null;
}

export function isParticipant(s: State, roundId: string, p: PlayerId): boolean {
  const r = s.rounds[roundId];
  return !!r && liveSeats(s, r).some((x) => x.playerId === p);
}

export function openInvitesTo(s: State, p: PlayerId): Invite[] {
  return Object.values(s.invites).filter((i) => i.toPlayerId === p && i.status === 'open');
}

export function receiptViewed(s: State, roundId: string, p: PlayerId): boolean {
  return s.receiptViews.includes(`${roundId}:${p}`);
}

export interface PendingItem {
  kind: 'invite' | 'stale' | 'ready' | 'turn' | 'slot' | 'booking' | 'fixture' | 'receipt';
  label: string;
  ref: string;
}

/** The account-pane badge. Computed from open items addressed to the player. */
export function pendingActions(s: State, p: PlayerId, at: number): PendingItem[] {
  const items: PendingItem[] = [];
  for (const i of openInvitesTo(s, p)) items.push({ kind: 'invite', label: i.kind === 'challenge' ? 'Badla challenge' : 'Partner invitation', ref: i.id });
  for (const r of Object.values(s.rounds)) {
    if (isTerminal(r) && r.status !== 'settled') continue;
    const seat = seatFor(s, r, p);
    if (r.status === 'settled') {
      if (seat && !receiptViewed(s, r.id, p)) items.push({ kind: 'receipt', label: 'Result receipt', ref: r.id });
      continue;
    }
    if (!seat) continue;
    if (seatIsStale(s, r, seat)) items.push({ kind: 'stale', label: 'Terms changed', ref: r.id });
    if (r.status === 'checkin' && windowOpen(r, at) && seat.status === 'accepted') items.push({ kind: 'ready', label: 'Ready up', ref: r.id });
    if (r.status === 'active' && r.game && !r.game.winnerSide && r.game.seats[r.game.turn].playerId === p) items.push({ kind: 'turn', label: 'Your turn', ref: r.id });
    if (r.bookingId) {
      const b = s.bookings[r.bookingId];
      if (b.status === 'offered' && b.hostId !== p && (s.series[r.seriesId!]?.captainIds ?? []).includes(p)) items.push({ kind: 'slot', label: 'Choose a slot', ref: b.id });
      else if (b.status === 'chosen' && !bookingConfirmedBy(s, b, p)) items.push({ kind: 'booking', label: 'Confirm booking', ref: b.id });
    }
  }
  for (const f of Object.values(s.fixtures)) {
    if (f.status !== 'listed') continue;
    const club = s.clubs[f.clubId];
    if (club.memberIds.includes(p) && !isParticipant(s, f.roundId, p) && !predictionOf(s, f.id, p)) items.push({ kind: 'fixture', label: 'Pick a side', ref: f.id });
  }
  return items;
}

export function isBlockedPair(s: State, a: PlayerId, b: PlayerId): boolean {
  return s.players[a].blockedPlayerIds.includes(b) || s.players[b].blockedPlayerIds.includes(a);
}

export function roleOf(s: State, p: PlayerId): string {
  const series = theSeries(s);
  const pl = s.players[p];
  if (pl.accountKind === 'clubOnly') return 'Club member';
  if (series) {
    const side = sideOf(series, p);
    if (side) {
      const sc = seriesScore(s, series.id);
      const mine = sc[side];
      const theirs = sc[side === 'A' ? 'B' : 'A'];
      const state = mine > theirs ? 'up' : mine < theirs ? 'down' : 'level';
      return `Captain · ${mine}-${theirs} ${state}`;
    }
    for (const r of seriesRounds(s, series)) {
      const seat = seatFor(s, r, p);
      if (seat) return `Partner · ${s.players[series.sides[seat.side]].name}'s side`;
    }
  }
  if (p === s.opening.winnerId) return 'Captain · 1-0 up';
  if (p === s.opening.loserId) return 'Captain · 0-1 down';
  return pl.accountKind === 'partner' ? 'Partner · not seated' : 'Club member';
}

/** Gold debited into rounds that have not paid out or refunded yet (the pot in play). */
export function goldInPlay(s: State): number {
  let sum = 0;
  for (const r of Object.values(s.rounds)) {
    if (r.status !== 'active') continue;
    sum -= s.wallet.reduce((t, e) => (e.roundId === r.id ? t + e.amount : t), 0);
  }
  return sum;
}
