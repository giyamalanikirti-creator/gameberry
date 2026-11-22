/**
 * Time helpers. Every instant is stored as UTC epoch milliseconds and only
 * formatted for a time zone at the edge, with Intl.DateTimeFormat.
 */
import type { TimeWindow } from './types';

export const MINUTE = 60_000;
export const HOUR = 60 * MINUTE;
export const DAY = 24 * HOUR;

/** Demo seed: 22 November 2026, 8:14 pm IST (14:44 UTC). */
export const DEMO_START = Date.UTC(2026, 10, 22, 14, 44, 0);

export const INVITE_TTL = DAY;
export const PLAY_NOW_WINDOW = 5 * MINUTE;
export const WINDOW_LENGTH = 30 * MINUTE;
export const SERIES_TTL = 7 * DAY;

/** Start-inclusive, end-exclusive. */
export function inWindow(w: TimeWindow, at: number): boolean {
  return at >= w.start && at < w.end;
}

interface ZonedParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
}

const partsCache = new Map<string, Intl.DateTimeFormat>();
function partsFormatter(timeZone: string): Intl.DateTimeFormat {
  let f = partsCache.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat('en-GB', {
      timeZone,
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      hourCycle: 'h23',
    });
    partsCache.set(timeZone, f);
  }
  return f;
}

export function zonedParts(at: number, timeZone: string): ZonedParts {
  const out: Record<string, number> = {};
  for (const p of partsFormatter(timeZone).formatToParts(new Date(at))) {
    if (p.type !== 'literal') out[p.type] = Number(p.value);
  }
  return { year: out.year, month: out.month, day: out.day, hour: out.hour % 24, minute: out.minute };
}

/** Offset of a zone from UTC at an instant, in ms. */
function zoneOffset(at: number, timeZone: string): number {
  const p = zonedParts(at, timeZone);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute);
  return asUtc - Math.floor(at / MINUTE) * MINUTE;
}

/** UTC instant for a wall-clock time in a zone. */
export function zonedTimeToUtc(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
  timeZone: string,
): number {
  const guess = Date.UTC(year, month - 1, day, hour, minute);
  let at = guess - zoneOffset(guess, timeZone);
  at = guess - zoneOffset(at, timeZone); // second pass settles DST edges
  return at;
}

/** Calendar date one day after `at` in the zone, as [y, m, d]. */
export function tomorrowIn(at: number, timeZone: string): [number, number, number] {
  const p = zonedParts(at, timeZone);
  const d = new Date(Date.UTC(p.year, p.month - 1, p.day + 1));
  return [d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate()];
}

/** A 30-minute window tomorrow at a local start time in the proposer's zone. */
export function tomorrowWindow(now: number, timeZone: string, hour: number, minute: number): TimeWindow {
  const [y, m, d] = tomorrowIn(now, timeZone);
  const start = zonedTimeToUtc(y, m, d, hour, minute, timeZone);
  return { start, end: start + WINDOW_LENGTH };
}

/** Local calendar date key, e.g. 2026-11-22, in a zone. */
export function localDateKey(at: number, timeZone: string): string {
  const p = zonedParts(at, timeZone);
  return `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`;
}

/** End of tomorrow in the zone (exclusive), the latest a decider slot may start. */
export function endOfTomorrow(now: number, timeZone: string): number {
  const [y, m, d] = tomorrowIn(now, timeZone);
  return zonedTimeToUtc(y, m, d, 23, 59, timeZone) + MINUTE;
}

/** "9:00 pm" */
export function formatTime(at: number, timeZone: string): string {
  return new Intl.DateTimeFormat('en-IN', { timeZone, hour: 'numeric', minute: '2-digit', hour12: true }).format(at).replace(/\s?([ap])\.?m\.?/i, (_, x: string) => ` ${x.toLowerCase()}m`);
}

/** "IST" style short zone name. */
export function zoneShort(at: number, timeZone: string): string {
  const p = new Intl.DateTimeFormat('en-US', { timeZone, timeZoneName: 'short' }).formatToParts(at).find((x) => x.type === 'timeZoneName');
  const v = p?.value ?? timeZone;
  return v === 'GMT+5:30' ? 'IST' : v;
}

/** "Today", "Tomorrow" or the weekday + date, relative to now in the zone. */
export function relativeDay(at: number, now: number, timeZone: string): string {
  const k = localDateKey(at, timeZone);
  if (k === localDateKey(now, timeZone)) return 'Today';
  const [y, m, d] = tomorrowIn(now, timeZone);
  if (k === `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`) return 'Tomorrow';
  return formatDay(at, timeZone);
}

/** "Tomorrow 9:00–9:30 pm" */
export function formatSlot(w: TimeWindow, now: number, timeZone: string): string {
  const a = formatTime(w.start, timeZone);
  const b = formatTime(w.end, timeZone);
  const sameHalf = a.slice(-2) === b.slice(-2);
  return `${relativeDay(w.start, now, timeZone)} ${sameHalf ? a.slice(0, -3) : a}–${b}`;
}

export function formatDay(at: number, timeZone: string): string {
  return new Intl.DateTimeFormat('en-GB', { timeZone, weekday: 'short', day: 'numeric', month: 'short' }).format(at);
}

export function formatDateTime(at: number, timeZone: string): string {
  return `${formatDay(at, timeZone)}, ${formatTime(at, timeZone)}`;
}

/** Top-bar clock: "Sun 22 Nov, 8:14 pm IST" */
export function formatClock(at: number, timeZone: string): string {
  return `${formatDay(at, timeZone).replace(',', '')}, ${formatTime(at, timeZone)} ${zoneShort(at, timeZone)}`;
}

/** e.g. "Mon 23 Nov, 19:30–20:00". */
export function formatWindow(w: TimeWindow, timeZone: string): string {
  return `${formatDay(w.start, timeZone)}, ${formatTime(w.start, timeZone)}–${formatTime(w.end, timeZone)}`;
}

export function analyticsDate(at: number): string {
  return new Date(at).toISOString().slice(0, 10);
}

/** "4 h 30 min", "5 min", "under a minute". */
export function formatDuration(ms: number): string {
  if (ms < MINUTE) return 'under a minute';
  const totalMin = Math.ceil(ms / MINUTE);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h === 0) return `${m} min`;
  if (m === 0) return `${h} h`;
  return `${h} h ${m} min`;
}

/** "4:59" style countdown for short readiness timers. */
export function formatCountdown(ms: number): string {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
