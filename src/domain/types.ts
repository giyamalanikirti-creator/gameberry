import type { Color } from '../engine/board';
import type { FixtureName } from '../engine/fixtures';
import type { ReplayEvent } from '../engine/replay';
import type { LiveGame, Side } from '../engine/rules';

export type { Side };
export type PlayerId = 'gunjan' | 'riya' | 'ananya' | 'shruti' | 'dev';
export type AccountKind = 'full' | 'partner' | 'clubOnly';

export interface TimeWindow {
  /** UTC ms, inclusive */
  start: number;
  /** UTC ms, exclusive */
  end: number;
}

export interface Player {
  id: PlayerId;
  name: string;
  handle: string;
  avatarSeed: number;
  pin: string;
  clubIds: string[];
  accountKind: AccountKind;
  blockedPlayerIds: PlayerId[];
  mutedSeriesIds: string[];
  timezone: string;
  usualPlayHours: number[];
  /** Seat colour and token shape; Dev has none. */
  color: Color | null;
  shape: 'circle' | 'diamond' | 'square' | 'triangle' | null;
  possessive: 'her' | 'his' | 'their';
  /** Friends a captain may invite as a partner. */
  friendIds: PlayerId[];
}

export interface Club {
  id: string;
  name: string;
  memberIds: PlayerId[];
}

/** The settled 100-gold singles game the story opens on. Immutable. */
export interface OpeningMatch {
  id: string;
  roundId: string;
  winnerId: PlayerId;
  loserId: PlayerId;
  entryGold: number;
  settledAt: number;
  snapshot: ReplayEvent;
}

export interface Series {
  id: string;
  /** [side A captain, side B captain] */
  captainIds: [PlayerId, PlayerId];
  sides: Record<Side, PlayerId>;
  originMatchId: string;
  roundIds: string[];
  createdAt: number;
  expiresAt: number;
  initiatedBy: PlayerId;
  /** Locked when the series is created. */
  sweepBonus: boolean;
  expiredAt: number | null;
  closedAt: number | null;
  closedBy: PlayerId | null;
}

export type RoundStatus =
  | 'proposed'
  | 'filling'
  | 'booking'
  | 'confirmed'
  | 'checkin'
  | 'active'
  | 'settled'
  | 'cancelled'
  | 'expired'
  | 'voided';

export const TERMINAL_ROUND: ReadonlySet<RoundStatus> = new Set(['settled', 'cancelled', 'expired', 'voided']);

export interface Round {
  id: string;
  seriesId: string | null;
  index: number;
  format: 'singles' | 'doubles';
  entryGold: number;
  status: RoundStatus;
  seatIds: string[];
  timing: 'now' | 'scheduled';
  window: TimeWindow | null;
  bookingId: string | null;
  clubVisible: boolean;
  isDecider: boolean;
  game: LiveGame | null;
  outcome: { winnerSide: Side } | null;
  settledAt: number | null;
  voidedAt: number | null;
  createdAt: number;
  createdBy: PlayerId | null;
  fixtureName: FixtureName | 'random' | null;
  /** Last failed start, naming the seat that blocked it. */
  blockedStart: { seatId: string; playerId: PlayerId | null; reason: string } | null;
  singlesSwitch: { proposedBy: PlayerId } | null;
  rebookedFromId: string | null;
  rebookedToId: string | null;
  /** Set after a human (not auto-play) makes the first roll. */
  humanStarted: boolean;
  closedReason: string | null;
  /** Bumped only when an accepted roster changes (replacement, drop-out, format switch). */
  rosterVersion: number;
}

export type SeatStatus = 'open' | 'invited' | 'accepted' | 'declined' | 'replaced' | 'ready' | 'forfeited' | 'dissolved';

export interface TeamSeat {
  id: string;
  roundId: string;
  playerId: PlayerId | null;
  side: Side;
  seatRole: 'captain' | 'partner';
  inviteId: string | null;
  status: SeatStatus;
  readyAt: number | null;
  termsHash: string | null;
  /** Previous occupant, kept so a declined seat can say "Replace Shruti". */
  lastPlayerId: PlayerId | null;
}

export interface Invite {
  id: string;
  roundId: string;
  seriesId: string | null;
  fromPlayerId: PlayerId;
  toPlayerId: PlayerId;
  kind: 'challenge' | 'partner' | 'bookingSlot';
  termsHash: string;
  status: 'open' | 'accepted' | 'declined' | 'expired' | 'withdrawn';
  sentAt: number;
  respondedAt: number | null;
  expiresAt: number;
  seatId: string | null;
}

export interface Booking {
  id: string;
  roundId: string;
  hostId: PlayerId;
  proposedSlots: TimeWindow[];
  chosenSlot: number | null;
  confirmations: Array<{ playerId: PlayerId; confirmedAt: number; termsHash: string; source: 'product' | 'demo' }>;
  status: 'offered' | 'chosen' | 'confirmed' | 'withdrawn';
}

export interface ClubFixture {
  id: string;
  clubId: string;
  roundId: string;
  teamLabels: Record<Side, string>;
  seriesScoreAtPublish: string;
  startsAt: number;
  status: 'listed' | 'locked' | 'settled' | 'withdrawn' | 'voided';
  publishedAt: number;
  winnerSide: Side | null;
  closedReason: string | null;
}

export interface Prediction {
  id: string;
  fixtureId: string;
  playerId: PlayerId;
  pickSide: Side;
  createdAt: number;
  updatedAt: number;
}

export interface WalletEntry {
  id: string;
  playerId: PlayerId;
  roundId: string | null;
  kind: 'seed' | 'entry' | 'payout' | 'refund' | 'bonus';
  amount: number;
  balanceAfter: number;
  idempotencyKey: string;
  createdAt: number;
}

export interface Assist {
  id: string;
  roundId: string;
  playerId: PlayerId;
  captainId: PlayerId;
  seriesScoreAfter: string;
  seatSavedForRoundId: string | null;
  savedAt: number | null;
}

export type Route =
  | { name: 'home' }
  | { name: 'opening' }
  | { name: 'challenge'; seriesId: string | null }
  | { name: 'invite'; id: string }
  | { name: 'round'; id: string }
  | { name: 'receipt'; roundId: string }
  | { name: 'booking'; id: string }
  | { name: 'club' }
  | { name: 'fixture'; id: string }
  | { name: 'inbox' };

export interface Notification {
  id: string;
  to: PlayerId;
  kind: string;
  title: string;
  route: Route;
  createdAt: number;
  readAt: number | null;
}

export type Source = 'product' | 'demo' | 'system';

export interface AnalyticsEvent {
  id: string;
  name: string;
  at: number;
  playerId: PlayerId | null;
  role: string | null;
  seriesId: string | null;
  roundId: string | null;
  source: Source;
  detail: Record<string, string | number | boolean | null>;
}

export type NextFixture = 'guided' | FixtureName | 'random';

export interface Settings {
  sweepBonus: boolean;
  nextFixture: NextFixture;
  autoPlay: boolean;
}

export interface State {
  schema: 'badla';
  version: 1;
  players: Record<PlayerId, Player>;
  clubs: Record<string, Club>;
  opening: OpeningMatch;
  series: Record<string, Series>;
  rounds: Record<string, Round>;
  seats: Record<string, TeamSeat>;
  invites: Record<string, Invite>;
  bookings: Record<string, Booking>;
  fixtures: Record<string, ClubFixture>;
  predictions: Record<string, Prediction>;
  wallet: WalletEntry[];
  assists: Record<string, Assist>;
  notifications: Notification[];
  analytics: AnalyticsEvent[];
  receiptViews: string[];
  /** `${roundId}:${playerId}` — partners who saved a seat for the decider (interest only). */
  seatSaves: string[];
  settings: Settings;
  seq: number;
}
