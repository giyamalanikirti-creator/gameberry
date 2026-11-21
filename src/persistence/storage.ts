/**
 * Versioned local storage shared by both demo perspectives. The committed
 * snapshot is saved after every action and validated before it is restored.
 */
import type { DomainState, PlayerId } from '../domain/types';

export const STORAGE_KEY = 'badla-demo';
export const SNAPSHOT_VERSION = 1;

export type Screen =
  | { name: 'result'; matchId: string }
  | { name: 'lobby' }
  | { name: 'invite'; challengeId: string }
  | { name: 'table'; challengeId: string }
  | { name: 'match'; matchId: string }
  | { name: 'rivalry'; matchId: string };

export interface UiState {
  viewer: PlayerId;
  screens: Record<PlayerId, Screen>;
  guided: boolean;
  /** null follows the system setting. */
  reducedMotion: boolean | null;
  /** Demo clock = real clock + offset. */
  clockOffset: number;
  /** Notification banners the viewer has already seen. */
  bannersSeen: string[];
}

export interface Snapshot {
  version: number;
  savedAt: number;
  domain: DomainState;
  ui: UiState;
}

export type LoadResult =
  | { status: 'empty' }
  | { status: 'ok'; snapshot: Snapshot }
  | { status: 'invalid'; reason: string };

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isPlayer = (v: unknown) => v === 'kirti' || v === 'ahmed';
const SCREENS = new Set(['result', 'lobby', 'invite', 'table', 'match', 'rivalry']);

function validScreen(s: unknown, domain: DomainState): boolean {
  if (!isObj(s) || typeof s.name !== 'string' || !SCREENS.has(s.name)) return false;
  if ('matchId' in s && (typeof s.matchId !== 'string' || !domain.matches[s.matchId])) return false;
  if ('challengeId' in s && (typeof s.challengeId !== 'string' || !domain.challenges[s.challengeId])) return false;
  return true;
}

/** Structural check. Returns a reason when the snapshot cannot be trusted. */
export function validateSnapshot(raw: unknown): string | null {
  if (!isObj(raw)) return 'not an object';
  if (raw.version !== SNAPSHOT_VERSION) return `unsupported version ${String(raw.version)}`;
  const d = raw.domain;
  const ui = raw.ui;
  if (!isObj(d) || d.schema !== 'badla-domain' || d.version !== 1) return 'domain schema mismatch';
  if (!isObj(d.players) || !isObj(d.players.kirti) || !isObj(d.players.ahmed)) return 'players missing';
  if (!isObj(d.settings) || !isObj(d.settings.kirti) || !isObj(d.settings.ahmed)) return 'settings missing';
  if (!isObj(d.matches) || !isObj(d.challenges)) return 'collections missing';
  if (!Array.isArray(d.results) || !Array.isArray(d.challengeOrder) || !Array.isArray(d.notifications) || !Array.isArray(d.analytics) || !Array.isArray(d.offers)) {
    return 'lists missing';
  }
  if (typeof d.seq !== 'number' || !isObj(d.nextDice)) return 'counters missing';
  for (const id of d.challengeOrder as unknown[]) {
    if (typeof id !== 'string' || !isObj((d.challenges as Record<string, unknown>)[id])) return 'challenge order broken';
  }
  for (const r of d.results as unknown[]) {
    if (!isObj(r) || typeof r.matchId !== 'string' || !isPlayer(r.winner)) return 'bad result';
    if (!isObj((d.matches as Record<string, unknown>)[r.matchId])) return 'result for unknown match';
  }
  for (const m of Object.values(d.matches as Record<string, unknown>)) {
    if (!isObj(m) || typeof m.id !== 'string' || !isObj(m.seats)) return 'bad match';
    if (m.status === 'playing') {
      const g = m.game;
      if (!isObj(g) || !isObj(g.tokens) || !Array.isArray((g.tokens as Record<string, unknown>).blue) || typeof g.rollCount !== 'number' || !isObj(g.dice)) {
        return 'bad live game';
      }
    }
  }
  if (!isObj(ui) || !isPlayer(ui.viewer) || !isObj(ui.screens)) return 'ui missing';
  if (typeof ui.clockOffset !== 'number' || typeof ui.guided !== 'boolean' || !Array.isArray(ui.bannersSeen)) return 'ui fields missing';
  const domain = d as unknown as DomainState;
  if (!validScreen(ui.screens.kirti, domain) || !validScreen(ui.screens.ahmed, domain)) return 'bad screen';
  return null;
}

export function loadSnapshot(storage: Storage | undefined = safeStorage()): LoadResult {
  if (!storage) return { status: 'empty' };
  let text: string | null;
  try {
    text = storage.getItem(STORAGE_KEY);
  } catch {
    return { status: 'empty' };
  }
  if (!text) return { status: 'empty' };
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { status: 'invalid', reason: 'saved data is not valid JSON' };
  }
  const reason = validateSnapshot(raw);
  if (reason) return { status: 'invalid', reason };
  return { status: 'ok', snapshot: raw as Snapshot };
}

export function saveSnapshot(domain: DomainState, ui: UiState, storage: Storage | undefined = safeStorage()): void {
  if (!storage) return;
  const snapshot: Snapshot = { version: SNAPSHOT_VERSION, savedAt: Date.now(), domain, ui };
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
  } catch {
    // Storage full or blocked: the demo keeps working in memory.
  }
}

export function clearSnapshot(storage: Storage | undefined = safeStorage()): void {
  try {
    storage?.removeItem(STORAGE_KEY);
  } catch {
    /* ignore */
  }
}

function safeStorage(): Storage | undefined {
  try {
    return typeof window !== 'undefined' ? window.localStorage : undefined;
  } catch {
    return undefined;
  }
}
