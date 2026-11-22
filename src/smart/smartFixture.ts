/**
 * Smart Fixture, mocked with deterministic functions from the build spec.
 * No ML or LLM calls: the same inputs always give the same suggestion.
 */
import { MINUTE, WINDOW_LENGTH, tomorrowIn, zonedParts, zonedTimeToUtc } from '../domain/time';
import type { PlayerId, TimeWindow } from '../domain/types';

const TZ = 'Asia/Kolkata';

/** Hour-of-day play histograms (0–23), seeded from the spec. */
export const hourProfile: Partial<Record<PlayerId, number[]>> = {
  riya: [0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 2, 3, 2, 1, 1, 2, 3, 5, 7, 9, 8, 4, 1],
  gunjan: [0, 0, 0, 0, 0, 0, 0, 1, 2, 1, 1, 1, 2, 2, 1, 1, 2, 4, 6, 8, 9, 7, 3, 1],
};

/** Chance the player returns on that weekday anyway. */
export const pReturnByDay: Partial<Record<PlayerId, Partial<Record<string, number>>>> = {
  riya: { Mon: 0.35, Tue: 0.8 },
  gunjan: { Mon: 0.55, Tue: 0.7 },
};

/** Not given in the spec; a fixed show-up rate per player. */
export const showRate: Partial<Record<PlayerId, number>> = { riya: 0.9, gunjan: 0.85 };

const DEFAULT_PROFILE = hourProfile.riya!.map((v, i) => (v + hourProfile.gunjan![i]) / 2);

function profileOf(p: PlayerId): number[] {
  return hourProfile[p] ?? DEFAULT_PROFILE;
}

function norm(arr: number[]): number[] {
  const max = Math.max(...arr);
  return arr.map((v) => (max ? v / max : 0));
}

export function weekday(at: number): string {
  return new Intl.DateTimeFormat('en-GB', { timeZone: TZ, weekday: 'short' }).format(at);
}

export function pReturn(p: PlayerId, at: number): number {
  return pReturnByDay[p]?.[weekday(at)] ?? 0.6;
}

/** scoreSlot from the spec: chance everyone shows × how much of an extra day it is. */
export function scoreSlot(slot: TimeWindow, players: PlayerId[]): { pShow: number; incr: number; score: number } {
  const hour = zonedParts(slot.start, TZ).hour;
  const pShow = players.map((p) => norm(profileOf(p))[hour] * (showRate[p] ?? 0.85)).reduce((a, b) => a * b, 1);
  const incr = players.map((p) => 1 - pReturn(p, slot.start)).reduce((a, b) => a + b, 0) / players.length;
  return { pShow, incr, score: pShow * incr };
}

export interface Suggestion {
  slot: TimeWindow;
  score: number;
  pShow: number;
  incr: number;
  confidence: 'High' | 'Good' | 'Fair';
}

/** Candidate slots tomorrow at quarter past each hour, 12:15–22:15, best first. */
export function suggestSlots(now: number, players: PlayerId[], dayOffset = 1): Suggestion[] {
  let [y, m, d] = tomorrowIn(now, TZ);
  for (let i = 1; i < dayOffset; i++) [y, m, d] = tomorrowIn(zonedTimeToUtc(y, m, d, 12, 0, TZ), TZ);
  const out: Suggestion[] = [];
  for (let h = 12; h <= 22; h++) {
    const start = zonedTimeToUtc(y, m, d, h, 15, TZ);
    const slot = { start, end: start + WINDOW_LENGTH };
    const s = scoreSlot(slot, players);
    out.push({ slot, ...s, confidence: s.pShow >= 0.6 ? 'High' : s.pShow >= 0.35 ? 'Good' : 'Fair' });
  }
  return out.sort((a, b) => b.score - a.score || a.slot.start - b.slot.start);
}

/** Usual hour both play around: the peak of the combined profile. */
export function usualHour(players: PlayerId[]): number {
  const combined = Array.from({ length: 24 }, (_, h) => players.map((p) => norm(profileOf(p))[h]).reduce((a, b) => a * b, 1));
  return combined.indexOf(Math.max(...combined));
}

/** The Badla card is shown only after a "hot" capture. */
export function cardScore(squaresFromHome: number, chats: number): { score: number; closeness: number; heat: number; show: boolean } {
  const closeness = Math.max(0, 0.5 - 0.05 * (squaresFromHome - 1));
  const heat = Math.min(0.5, chats * 0.1);
  const score = closeness + heat;
  return { score, closeness, heat, show: score >= 0.6 };
}

export const OPENING_CHATS = 3;

export interface InviteCtx {
  from: string;
  to: string;
  squaresFromHome: number;
  timeLabel: string;
  score: string;
}

/** Six templates filled with match facts. inviteLine picks deterministically. */
const TEMPLATES: Array<(c: InviteCtx) => string> = [
  (c) => `${c.from} wants Badla. You sent ${c.from === 'Riya' ? 'her' : 'them'} home ${c.squaresFromHome} square from the finish. ${c.timeLabel}?`,
  (c) => `${c.from} hasn't forgotten that capture. Rematch ${c.timeLabel}?`,
  (c) => `You're ${c.score} up on ${c.from}. Defend it ${c.timeLabel}?`,
  (c) => `${c.from} is one roll away from evening it. ${c.timeLabel}?`,
  (c) => `First to two: ${c.from} vs you. ${c.timeLabel}?`,
  (c) => `${c.from} booked a slot you both usually play. ${c.timeLabel}?`,
];

export const TEMPLATE_LINE = (c: InviteCtx) => `${c.from} challenged you to a Badla match.`;

export function inviteLine(c: InviteCtx): string {
  const i = c.squaresFromHome <= 1 ? 0 : (c.from.length + c.to.length) % TEMPLATES.length;
  return TEMPLATES[i](c);
}

export function smartTimeLabel(slot: TimeWindow, now: number): string {
  const hhmm = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(slot.start);
  const sameDay = zonedParts(slot.start, TZ).day === zonedParts(now, TZ).day;
  const isTomorrow = slot.start - now < 2 * 24 * 60 * MINUTE && !sameDay;
  return `${sameDay ? 'Tonight' : isTomorrow ? 'Tomorrow' : weekday(slot.start)} ${hhmm}`;
}
