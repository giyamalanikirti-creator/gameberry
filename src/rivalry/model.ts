import type { ReplayEvent } from '../board/replay';
import { DAY, DEMO_START, HOUR, formatDateTime, formatTime, tomorrowWindow, zonedParts } from '../domain/time';
import type { Ludo } from './ludo';

export const PEOPLE = {
  riya: { name: 'Riya', initials: 'R', zone: 'Asia/Kolkata', hours: [19, 23], id: 'RY-1042' },
  gunjan: { name: 'Gunjan', initials: 'G', zone: 'Asia/Kolkata', hours: [20, 23], id: 'GJ-2317' },
  ananya: { name: 'Ananya', initials: 'A', zone: 'Asia/Kolkata', hours: [20, 23], id: 'AN-4402' },
  shruti: { name: 'Shruti', initials: 'S', zone: 'Asia/Kolkata', hours: [19, 23], id: 'SH-2168' },
} as const;
export type Person = keyof typeof PEOPLE;
export type Viewer = 'riya' | 'gunjan';
export type Pair = [Person, Person];
export const nameOf = (person: Person) => PEOPLE[person].name;
export const pairKey = (a: Person, b: Person) => [a, b].sort().join(':');
export const samePair = (pair: Pair, a: Person, b: Person) => pairKey(...pair) === pairKey(a, b);
export const counterpart = (pair: Pair, viewer: Person) => pair[0] === viewer ? pair[1] : pair[0];
export const DEMO_DAY = DEMO_START;
export const DEBT_AGE = 3 * DAY;
export const SERIES_AGE = 7 * DAY;
export const WINDOW = 2 * HOUR;
export const STICKERS = ['Rematch?', 'That was close', 'See you on the board'] as const;

export interface Kaat {
  replay: ReplayEvent<Person>;
  at: number;
  spaces: number;
  victim: Person;
  attacker: Person;
}
export interface Match {
  id: string;
  pair: Pair;
  mode: 'public' | 'badla';
  cardId?: string;
  at: number;
  endedAt?: number;
  cancelled?: boolean;
  board: Ludo;
  kaats: Kaat[];
  sticker?: (typeof STICKERS)[number];
}
export interface Debt {
  id: string;
  from: Person;
  rival: Person;
  matchId: string;
  kaat: Kaat;
  until: number;
  status: 'open' | 'settled' | 'dropped';
}
export interface Series {
  id: string;
  pair: Pair;
  openingId?: string;
  opens: number;
  closes: number;
  wins: Person[];
  derby?: boolean;
}
export type CardStatus = 'asked' | 'proposed' | 'confirmed' | 'open' | 'playing' | 'settled' | 'passed' | 'missed' | 'closed';
export interface Card {
  id: string;
  pair: Pair;
  from: Person;
  seriesId: string;
  debtId?: string;
  kind: 'rematch' | 'decider' | 'derby';
  status: CardStatus;
  askedAt: number;
  proposedBy?: Person;
  window?: { start: number; end: number };
  confirmed: Person[];
  changes: Person[];
  ready: Person[];
  matchId?: string;
  visit: Person[];
}
export interface Push {
  id: string;
  actor: Person;
  cardId: string;
  kind: 'window' | 'ready';
  sender?: Person;
  at: number;
  read: boolean;
}
export interface Activity {
  person: Person;
  date: string;
  incremental: boolean;
}
export interface Event {
  name: string;
  at: number;
  actor: Person;
  detail?: Record<string, string | number | boolean>;
}
export interface PairSettings {
  misses: number;
  cooldown: number;
  muted: Person[];
  blocked: Person[];
  theme: Person[];
  derby: Person[];
  nextDerby: number | null;
}
export interface RivalryState {
  version: 1;
  now: number;
  seq: number;
  seed: number;
  guided: boolean;
  autoGunjan: boolean;
  sound: boolean;
  active: string | null;
  matches: Match[];
  cards: Card[];
  debts: Debt[];
  series: Series[];
  pushes: Push[];
  events: Event[];
  activities: Activity[];
  settings: Record<string, PairSettings>;
}

export const emptySettings = (): PairSettings => ({ misses: 0, cooldown: 0, muted: [], blocked: [], theme: [], derby: [], nextDerby: null });
export function newRivalry(seed = 23): RivalryState {
  return { version: 1, now: DEMO_DAY, seq: 0, seed, guided: true, autoGunjan: false, sound: false, active: null, matches: [], cards: [],
    debts: [], series: [], pushes: [], events: [], activities: [], settings: {} };
}
export function dayOf(at: number, p: Person) {
  const { year, month, day } = zonedParts(at, PEOPLE[p].zone);
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}
export const atLabel = (at: number, person: Person) => formatDateTime(at, PEOPLE[person].zone);
export const timeLabel = (at: number, person: Person) => formatTime(at, PEOPLE[person].zone);
export function windowLabel(window: NonNullable<Card['window']>, person: Person) {
  return `${atLabel(window.start, person)}–${dayOf(window.start, person) === dayOf(window.end, person) ? timeLabel(window.end, person) : atLabel(window.end, person)} IST`;
}
export function suggestedTime(at: number, pair: Pair) {
  const hour = Math.max(...pair.map(person => PEOPLE[person].hours[0]));
  return tomorrowWindow(at, PEOPLE[pair[0]].zone, hour, 0).start;
}
export function suggestedNow(state: RivalryState, series: Series) {
  return Math.min(suggestedTime(state.now, series.pair), series.closes - WINDOW);
}
export function nextSunday(at: number, person: Person) {
  const zone = PEOPLE[person].zone;
  const local = zonedParts(at, zone);
  const midnight = Date.UTC(local.year, local.month - 1, local.day);
  const weekday = new Date(midnight).getUTCDay();
  const nineTonight = tomorrowWindow(at - DAY, zone, 21, 0).start;
  return nineTonight + ((7 - weekday) % 7 || (nineTonight <= at ? 7 : 0)) * DAY;
}
export function settingsFor(state: RivalryState, a: Person, b: Person) {
  return state.settings[pairKey(a, b)] ?? emptySettings();
}
export function linked(state: RivalryState, a: Person, b: Person) {
  const { muted, blocked } = settingsFor(state, a, b);
  return muted.length === 0 && blocked.length === 0;
}
export function inWindow(state: RivalryState, card: Card) {
  return !!card.window && state.now >= card.window.start && state.now < card.window.end;
}
export function isPending(card: Card) {
  return ['asked', 'proposed', 'confirmed', 'open', 'playing', 'missed'].includes(card.status);
}
export function latestCard(state: RivalryState, a: Person, b: Person) {
  return [...state.cards].reverse().find(card => samePair(card.pair, a, b));
}
export function seriesFor(state: RivalryState, card: Card) {
  return state.series.find(series => series.id === card.seriesId)!;
}
export function debtGroups(state: RivalryState, person: Person) {
  const current = state.debts.filter(debt => debt.status === 'open' && debt.until > state.now && [debt.from, debt.rival].includes(person));
  const groups = new Map<Person, Debt[]>();
  for (const debt of current) {
    const rival = debt.from === person ? debt.rival : debt.from;
    if (!linked(state, person, rival)) continue;
    const group = groups.get(rival) ?? [];
    group.push(debt);
    groups.set(rival, group);
  }
  return [...groups.entries()].filter(([, debts]) => debts.some(debt => debt.from === person)).map(([rival, debts]) => ({
    rival, mutual: debts.some(debt => debt.from === rival), debt: debts.filter(debt => debt.from === person).sort((a, b) => a.until - b.until)[0],
  }));
}

const seeded: Record<string, { settled: number; wins: Partial<Record<Person, number>>; captures: Partial<Record<Person, number>>; streak: Person }> = {
  [pairKey('riya', 'ananya')]: { settled: 5, wins: { riya: 3, ananya: 2 }, captures: { riya: 8, ananya: 7 }, streak: 'riya' },
  [pairKey('riya', 'shruti')]: { settled: 7, wins: { riya: 3, shruti: 4 }, captures: { riya: 9, shruti: 12 }, streak: 'shruti' },
};
export function ledger(state: RivalryState, person: Person, rival: Person) {
  const previous = seeded[pairKey(person, rival)];
  const matches = state.matches.filter(match => match.endedAt !== undefined && samePair(match.pair, person, rival));
  const badlas = matches.filter(match => match.mode === 'badla');
  const winners = matches.map(match => match.board.winner === 'red' ? match.pair[0] : match.pair[1]);
  const winner = winners.at(-1) ?? previous?.streak;
  const trailing = [...winners].reverse().findIndex(value => value !== winner);
  const count = trailing < 0 ? winners.length + (previous?.streak === winner && previous ? 1 : 0) : trailing;
  const kaats = state.matches.filter(match => samePair(match.pair, person, rival)).flatMap(match => match.kaats);
  const settled = (previous?.settled ?? 0) + badlas.length;
  const level = settled >= 7 ? 'Nemesis' : settled >= 3 ? 'Rival' : settled > 0 ? 'Acquaintance' : 'New';
  const lastBadla = badlas.at(-1);
  const lastBadlaWinner = lastBadla?.board.winner === 'red' ? lastBadla.pair[0] : lastBadla?.pair[1];
  return {
    settled, level, count, streakBy: winner, played: matches.length + (previous?.settled ?? 0),
    wins: winners.filter(value => value === person).length + (previous?.wins[person] ?? 0),
    losses: winners.filter(value => value === rival).length + (previous?.wins[rival] ?? 0),
    given: kaats.filter(kaat => kaat.attacker === person).length + (previous?.captures[person] ?? 0),
    taken: kaats.filter(kaat => kaat.victim === person).length + (previous?.captures[rival] ?? 0),
    lastKaat: kaats.at(-1), sticker: lastBadlaWinner === rival ? lastBadla?.sticker : undefined,
  };
}
export function rivalsOf(state: RivalryState, person: Person): Person[] {
  return (Object.keys(PEOPLE) as Person[]).filter(rival => rival !== person &&
    (samePair(['riya', 'gunjan'], person, rival) || !!seeded[pairKey(person, rival)] || ledger(state, person, rival).played > 0));
}
