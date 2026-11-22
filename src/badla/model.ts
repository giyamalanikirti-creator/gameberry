import { ORIGINAL_CAPTURE, type ReplayEvent } from '../board/replay';
import { analyticsDate, DEMO_START, MINUTE } from '../domain/time';
import type { TimeWindow } from '../domain/types';
import type { Endgame } from './endgame';

export const CAPTAINS = ['riya', 'gunjan'] as const;
export type Captain = (typeof CAPTAINS)[number];
export type PlayerId = Captain | 'ananya' | 'shruti' | 'dev' | 'meera';
export type Format = 'singles' | 'doubles';
export type RoundStatus = 'proposed' | 'filling' | 'confirmed' | 'check-in' | 'active' | 'settled' | 'cancelled' | 'expired' | 'voided';

export interface Player {
  name: string;
  color: 'red' | 'yellow' | 'green' | 'blue' | 'neutral';
  symbol: string;
}

export const PLAYERS: Record<PlayerId, Player> = {
  riya: { name: 'Riya', color: 'red', symbol: '●' },
  gunjan: { name: 'Gunjan', color: 'yellow', symbol: '◆' },
  ananya: { name: 'Ananya', color: 'green', symbol: '▲' },
  shruti: { name: 'Shruti', color: 'blue', symbol: '■' },
  dev: { name: 'Dev', color: 'neutral', symbol: 'D' },
  meera: { name: 'Meera', color: 'neutral', symbol: 'M' },
};

export const FRIENDS = ['ananya', 'shruti', 'meera'] as const;
export const isCaptain = (p: PlayerId): p is Captain => p === 'riya' || p === 'gunjan';
export const rival = (p: Captain): Captain => p === 'riya' ? 'gunjan' : 'riya';

export interface Club { id: string; name: string; members: PlayerId[] }
export interface Series { id: string; openingId: string; bonus: boolean; left: boolean }
export interface TeamSeat { side: Captain; player: PlayerId; consent: number | null; ready: boolean }
export interface Invite { id: string; roundId: string; from: PlayerId; to: PlayerId; kind: 'captain' | 'partner' | 'check-in'; read: boolean }
export interface Booking { choices: number[]; window: TimeWindow | null; mode: 'now' | 'scheduled'; club: boolean }
export interface Round {
  id: string;
  number: 2 | 3;
  proposer: Captain;
  format: Format;
  status: RoundStatus;
  seats: TeamSeat[];
  booking: Booking;
  expiresAt: number;
  revision: number;
  declined: PlayerId[];
  game: Endgame | null;
  winner: Captain | null;
  endedAt: number | null;
  reason: 'passed' | 'cancelled' | 'missed' | 'expired' | 'refunded' | 'forfeit' | null;
}

export interface ClubFixture { id: string; clubId: string; roundId: string }
export interface Prediction { fixtureId: string; player: PlayerId; side: Captain }
export interface WalletEntry { roundId: string; player: PlayerId; kind: 'entry' | 'pot' | 'bonus' | 'refund'; gold: number; at: number }
export interface Assist { roundId: string; player: PlayerId; captain: Captain; saved: boolean }
export interface ProductEvent { name: string; actor: PlayerId; at: number; day: string; roundId?: string; detail?: string }

export interface DemoState {
  series: Series | null;
  rounds: Round[];
  club: Club;
  opening: { id: string; winner: Captain; endedAt: number; replay: ReplayEvent<Captain> };
  invites: Invite[];
  fixtures: ClubFixture[];
  predictions: Prediction[];
  wallet: WalletEntry[];
  assists: Assist[];
  events: ProductEvent[];
  muted: PlayerId[];
  blocked: [PlayerId, PlayerId][];
  demo: { bonus: boolean; seed: number | null; balances: Partial<Record<PlayerId, number>> };
  nextRound: number;
}

export const OPENING_ID = 'opening-singles';
export const BASE_GOLD = 1000;
const OPENING_CAPTURE: ReplayEvent<Captain> = {
  ...ORIGINAL_CAPTURE,
  id: 'opening-capture',
  matchId: OPENING_ID,
  actor: 'gunjan',
  capture: ORIGINAL_CAPTURE.capture && { ...ORIGINAL_CAPTURE.capture, player: 'riya' },
};

export function createDemo(): DemoState {
  const endedAt = DEMO_START - 2 * MINUTE;
  return {
    opening: { id: OPENING_ID, winner: 'gunjan', endedAt, replay: structuredClone(OPENING_CAPTURE) },
    series: null,
    rounds: [],
    club: { id: 'the-ludo-club', name: 'The Ludo Club', members: ['riya', 'gunjan', 'ananya', 'shruti', 'dev'] },
    invites: [],
    fixtures: [],
    predictions: [],
    wallet: [
      { roundId: OPENING_ID, player: 'riya', kind: 'entry', gold: -100, at: endedAt },
      { roundId: OPENING_ID, player: 'gunjan', kind: 'entry', gold: -100, at: endedAt },
      { roundId: OPENING_ID, player: 'gunjan', kind: 'pot', gold: 200, at: endedAt },
    ],
    assists: [],
    events: [],
    muted: [],
    blocked: [],
    demo: { bonus: false, seed: null, balances: {} },
    nextRound: 1,
  };
}

export const entryFor = (format: Format) => format === 'doubles' ? 100 : 200;
export const payoutFor = (format: Format) => entryFor(format) * 2;
export const seatFor = (round: Round, player: PlayerId) => round.seats.find(seat => seat.player === player);
export const terminal = (round: Round) => ['settled', 'cancelled', 'expired', 'voided'].includes(round.status);
export const currentRound = (state: DemoState) => [...state.rounds].reverse().find(round => !terminal(round));
export const lastResult = (state: DemoState) => [...state.rounds].reverse().find(round => round.status === 'settled');
export const offerExpires = (round: Round) => round.booking.choices.at(-1) ?? round.expiresAt;

export function scores(state: DemoState): Record<Captain, number> {
  const score: Record<Captain, number> = { riya: 0, gunjan: 0 };
  score[state.opening.winner]++;
  for (const round of state.rounds) if (round.status === 'settled' && round.winner) score[round.winner]++;
  return score;
}

export function seriesStatus(state: DemoState): 'open' | 'tied' | 'won' | 'expired' {
  const score = scores(state);
  if (CAPTAINS.some(side => score[side] === 2)) return 'won';
  if (state.series?.left || (score.riya === 1 && state.rounds.at(-1)?.status === 'expired')) return 'expired';
  return score.riya === 1 ? 'tied' : 'open';
}

export function balance(state: DemoState, player: PlayerId): number {
  return state.wallet.reduce((total, row) => total + (row.player === player ? row.gold : 0), state.demo.balances[player] ?? BASE_GOLD);
}

export function receipt(state: DemoState, player: PlayerId, roundId: string) {
  const rows = state.wallet.filter(row => row.roundId === roundId && row.player === player);
  const amount = (kind: WalletEntry['kind']) => rows.find(row => row.kind === kind)?.gold ?? 0;
  return { entry: -amount('entry') || 0, pot: amount('pot'), bonus: amount('bonus'), refund: amount('refund'), net: rows.reduce((total, row) => total + row.gold, 0) };
}

export function bonusEligible(state: DemoState, player: PlayerId, at: number) {
  return !state.wallet.some(row => row.player === player && row.kind === 'bonus' && analyticsDate(row.at) === analyticsDate(at));
}

export function clubPairs(state: DemoState): TeamSeat[] | undefined {
  const rematch = lastResult(state);
  if (seriesStatus(state) !== 'tied' || rematch?.format !== 'doubles') return undefined;
  const attempt = state.rounds.at(-1);
  if (attempt?.number === 3 && attempt.booking.club && attempt.declined.length > 0) return undefined;
  return rematch.seats.every(seat => state.club.members.includes(seat.player)) ? rematch.seats : undefined;
}

export function isBlocked(state: DemoState, a: PlayerId, b: PlayerId) {
  return state.blocked.some(pair => pair.includes(a) && pair.includes(b));
}

export function teamName(round: Round, side: Captain): string {
  return round.seats.filter(seat => seat.side === side).map(seat => PLAYERS[seat.player].name).join(' & ');
}

export function activePlayerDays(events: ProductEvent[]) {
  return new Set(events.map(event => `${event.actor}/${event.day}`)).size;
}
