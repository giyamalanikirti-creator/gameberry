import type { LiveGame } from '../board/engine';
import type { Color } from '../board/geometry';
import type { ReplayEvent } from '../board/replay';

export type PlayerId = 'kirti' | 'ahmed';

export interface Player {
  id: PlayerId;
  name: string;
  color: Color;
  shape: 'circle' | 'diamond';
  initial: string;
  /** Possessive used in the brief's copy, e.g. "her last token". */
  possessive: string;
  timeZone: string;
  timeZoneLabel: string;
}

export interface TimeWindow {
  /** UTC epoch ms, inclusive. */
  start: number;
  /** UTC epoch ms, exclusive. */
  end: number;
}

export interface Readiness {
  since: number;
  /** Exclusive. min(since + 5 min, window end). */
  until: number;
}

export type MatchKind = 'original' | 'rematch';

export interface Match {
  id: string;
  kind: MatchKind;
  /** 1 for the recorded match, 2 for the rematch, 3 for the decider… */
  number: number;
  challengeId: string | null;
  seats: Record<Color, PlayerId>;
  status: 'playing' | 'completed' | 'abandoned';
  createdAt: number;
  completedAt: number | null;
  winner: PlayerId | null;
  game: LiveGame | null;
  /** The moment worth replaying: a capture, or the finishing move. */
  keyEvent: ReplayEvent | null;
}

export interface MatchResult {
  matchId: string;
  winner: PlayerId;
  completedAt: number;
}

export type ChallengeKind = 'badla' | 'decider' | 'another';

export type ChallengeStatus =
  | 'pending'
  | 'proposed'
  | 'scheduled'
  | 'waiting'
  | 'playing'
  | 'completed'
  | 'declined'
  | 'withdrawn'
  | 'expired'
  | 'cancelled'
  | 'missed'
  | 'blocked'
  | 'abandoned';

export const TERMINAL_STATUSES: ReadonlySet<ChallengeStatus> = new Set([
  'completed',
  'declined',
  'withdrawn',
  'expired',
  'cancelled',
  'missed',
  'blocked',
  'abandoned',
]);

export interface Challenge {
  id: string;
  originMatchId: string;
  kind: ChallengeKind;
  challenger: PlayerId;
  invitee: PlayerId;
  status: ChallengeStatus;
  createdAt: number;
  /** Pending invitations expire 24 h after sending. */
  expiresAt: number;
  mode: 'now' | 'scheduled' | null;
  window: TimeWindow | null;
  proposedAt: number | null;
  proposalExpiresAt: number | null;
  readiness: Partial<Record<PlayerId, Readiness>>;
  everReady: PlayerId[];
  /** Recipients who already got their one reminder for this invitation. */
  remindersSent: PlayerId[];
  matchId: string | null;
  closedAt: number | null;
  previousChallengeId: string | null;
}

export interface Notification {
  id: string;
  to: PlayerId;
  from: PlayerId;
  challengeId: string;
  kind: 'ready';
  title: string;
  body: string;
  createdAt: number;
  readAt: number | null;
}

export type EventSource = 'player' | 'demo-opponent' | 'system' | 'demo' | 'replay';

export interface AnalyticsEvent {
  id: string;
  name: string;
  at: number;
  /** Analytics date in UTC (YYYY-MM-DD). */
  date: string;
  actor: PlayerId | 'system' | 'demo';
  source: EventSource;
  pairId: string;
  challengeId?: string;
  matchId?: string;
  detail?: Record<string, string | number | boolean | null>;
}

export interface PlayerSettings {
  mutedReminders: boolean;
  /** True when this player has blocked their opponent. */
  blockedOpponent: boolean;
}

export type DiceMode = 'guided' | 'fresh';

export interface DomainState {
  schema: 'badla-domain';
  version: 1;
  players: Record<PlayerId, Player>;
  settings: Record<PlayerId, PlayerSettings>;
  matches: Record<string, Match>;
  results: MatchResult[];
  challenges: Record<string, Challenge>;
  challengeOrder: string[];
  notifications: Notification[];
  analytics: AnalyticsEvent[];
  /** Offers already logged, so an offer is counted once per player per match. */
  offers: string[];
  nextDice: { mode: DiceMode; seed: number };
  seq: number;
}
