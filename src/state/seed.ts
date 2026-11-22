import { OPENING_CAPTURE } from '../engine/replay';
import { DEMO_START, MINUTE } from '../domain/time';
import type { Player, PlayerId, Round, State, WalletEntry } from '../domain/types';

export const CLUB_ID = 'club-chai-dice';
export const OPENING_MATCH_ID = 'm-opening';
export const OPENING_ROUND_ID = 'r-opening';
export const SEED_GOLD = 1000;
export const OPENING_ENTRY = 100;
export const OPENING_SETTLED_AT = DEMO_START - 6 * MINUTE;
export const PLAYER_IDS: PlayerId[] = ['gunjan', 'riya', 'ananya', 'shruti', 'dev'];

const IST = 'Asia/Kolkata';

export const PLAYERS: Record<PlayerId, Player> = {
  gunjan: {
    id: 'gunjan', name: 'Gunjan', handle: '+91 98•••• 2107', avatarSeed: 1, pin: '1111', clubIds: [CLUB_ID],
    accountKind: 'full', blockedPlayerIds: [], mutedSeriesIds: [], timezone: IST, usualPlayHours: [21, 22],
    color: 'teal', shape: 'diamond', possessive: 'her', friendIds: ['shruti', 'ananya'], remindersOff: false, level: 18,
  },
  riya: {
    id: 'riya', name: 'Riya', handle: 'riya.k', avatarSeed: 2, pin: '2222', clubIds: [CLUB_ID],
    accountKind: 'full', blockedPlayerIds: [], mutedSeriesIds: [], timezone: IST, usualPlayHours: [21, 22],
    color: 'red', shape: 'circle', possessive: 'her', friendIds: ['ananya', 'shruti'], remindersOff: false, level: 14,
  },
  ananya: {
    id: 'ananya', name: 'Ananya', handle: 'ananya (invited by Riya)', avatarSeed: 3, pin: '3333', clubIds: [CLUB_ID],
    accountKind: 'partner', blockedPlayerIds: [], mutedSeriesIds: [], timezone: IST, usualPlayHours: [21],
    color: 'amber', shape: 'triangle', possessive: 'her', friendIds: [], remindersOff: false, level: 9,
  },
  shruti: {
    id: 'shruti', name: 'Shruti', handle: 'shruti (invited by Gunjan)', avatarSeed: 4, pin: '4444', clubIds: [CLUB_ID],
    accountKind: 'partner', blockedPlayerIds: [], mutedSeriesIds: [], timezone: IST, usualPlayHours: [21],
    color: 'blue', shape: 'square', possessive: 'her', friendIds: [], remindersOff: false, level: 11,
  },
  dev: {
    id: 'dev', name: 'Dev', handle: 'dev · club member', avatarSeed: 5, pin: '5555', clubIds: [CLUB_ID],
    accountKind: 'clubOnly', blockedPlayerIds: [], mutedSeriesIds: [], timezone: IST, usualPlayHours: [21],
    color: null, shape: null, possessive: 'his', friendIds: [], remindersOff: false, level: 22,
  },
};

function entry(id: string, playerId: PlayerId, roundId: string | null, kind: WalletEntry['kind'], amount: number, key: string, at: number): Omit<WalletEntry, 'balanceAfter'> {
  return { id, playerId, roundId, kind, amount, idempotencyKey: key, createdAt: at };
}

/** The opening game's three ledger lines: both entries and Gunjan's payout. */
export function openingEntries(at: number): Array<Omit<WalletEntry, 'balanceAfter' | 'id'>> {
  return [
    { playerId: 'gunjan', roundId: OPENING_ROUND_ID, kind: 'entry', amount: -OPENING_ENTRY, idempotencyKey: `${OPENING_ROUND_ID}:entry:gunjan`, createdAt: at },
    { playerId: 'riya', roundId: OPENING_ROUND_ID, kind: 'entry', amount: -OPENING_ENTRY, idempotencyKey: `${OPENING_ROUND_ID}:entry:riya`, createdAt: at },
    { playerId: 'gunjan', roundId: OPENING_ROUND_ID, kind: 'payout', amount: 2 * OPENING_ENTRY, idempotencyKey: `${OPENING_ROUND_ID}:payout:gunjan`, createdAt: at },
  ];
}

/** Settle the opening game once: idempotent by key. Mutates. */
export function applyOpening(s: State, at: number): void {
  if (s.opening.played) return;
  for (const e of openingEntries(at)) {
    if (s.wallet.some((w) => w.idempotencyKey === e.idempotencyKey)) continue;
    const prev = s.wallet.filter((w) => w.playerId === e.playerId).reduce((t, w) => t + w.amount, 0);
    s.seq += 1;
    s.wallet.push({ ...e, id: `w-${s.seq}`, balanceAfter: prev + e.amount });
  }
  s.opening.played = true;
  s.opening.settledAt = at;
  s.rounds[OPENING_ROUND_ID].settledAt = at;
}

/** The guided start: five players at 1,000, before the public match. */
export function createFreshState(): State {
  const t0 = OPENING_SETTLED_AT - 10 * MINUTE;
  const wallet: WalletEntry[] = (Object.keys(PLAYERS) as PlayerId[]).map((p, i) => ({
    ...entry(`w-seed-${i}`, p, null, 'seed', SEED_GOLD, `seed:${p}`, t0), balanceAfter: SEED_GOLD,
  }));
  const openingRound: Round = {
    id: OPENING_ROUND_ID, seriesId: null, index: 1, format: 'singles', entryGold: OPENING_ENTRY, status: 'settled',
    seatIds: [], timing: 'now', window: null, bookingId: null, clubVisible: false, isDecider: false, game: null,
    outcome: { winnerSide: 'B' }, settledAt: OPENING_SETTLED_AT, voidedAt: null, createdAt: t0, createdBy: null,
    fixtureName: null, blockedStart: null, singlesSwitch: null, rebookedFromId: null, rebookedToId: null,
    humanStarted: true, closedReason: null, rosterVersion: 0,
  };
  return {
    schema: 'badla',
    version: 1,
    players: structuredClone(PLAYERS),
    clubs: { [CLUB_ID]: { id: CLUB_ID, name: 'Chai & Dice Club', memberIds: ['gunjan', 'riya', 'ananya', 'shruti', 'dev'] } },
    opening: {
      id: OPENING_MATCH_ID, roundId: OPENING_ROUND_ID, winnerId: 'gunjan', loserId: 'riya', entryGold: OPENING_ENTRY,
      settledAt: OPENING_SETTLED_AT, snapshot: structuredClone(OPENING_CAPTURE), played: false,
    },
    series: {},
    rounds: { [OPENING_ROUND_ID]: openingRound },
    seats: {},
    invites: {},
    bookings: {},
    fixtures: {},
    predictions: {},
    wallet,
    assists: {},
    notifications: [],
    analytics: [],
    receiptViews: [],
    seatSaves: [],
    publicGame: null,
    settings: { sweepBonus: false, nextFixture: 'guided', autoPlay: false, variant: 'D' },
    seq: 0,
  };
}

/** Five players at 1,000 with the opening game applied: Gunjan 1,100, Riya 900. */
export function createSeedState(): State {
  const s = createFreshState();
  applyOpening(s, OPENING_SETTLED_AT);
  return s;
}
