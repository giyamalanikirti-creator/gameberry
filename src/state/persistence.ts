/**
 * One root object in local storage under one version key. Every read and write
 * is wrapped so a blocked storage degrades to memory instead of a blank screen.
 */
import type { PlayerId, Route, State } from '../domain/types';

export const STORAGE_KEY = 'badla.v1';
export const ROOT_VERSION = 2;

export interface SessionState {
  current: PlayerId | null;
  /** Sessions kept unlocked by "Remember this device". */
  unlocked: PlayerId[];
  routes: Partial<Record<PlayerId, Route>>;
}

export interface UiState {
  mode: 'guided' | 'free';
  welcomeSeen: boolean;
}

export interface Root {
  version: number;
  state: State;
  session: SessionState;
  clockOffset: number;
  ui: UiState;
}

export type Loaded = { status: 'ok'; root: Root } | { status: 'empty' } | { status: 'reset'; reason: string };

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

export function validateRoot(raw: unknown): string | null {
  if (!isObj(raw)) return 'not an object';
  if (raw.version !== ROOT_VERSION) return `saved with version ${String(raw.version)}`;
  const s = raw.state;
  if (!isObj(s) || s.schema !== 'badla' || s.version !== 1) return 'state schema mismatch';
  for (const k of ['players', 'clubs', 'series', 'rounds', 'seats', 'invites', 'bookings', 'fixtures', 'predictions', 'assists', 'opening', 'settings']) {
    if (!isObj(s[k])) return `missing ${k}`;
  }
  for (const k of ['wallet', 'notifications', 'analytics', 'receiptViews', 'seatSaves']) if (!Array.isArray(s[k])) return `missing ${k}`;
  if (!isObj(raw.session) || !Array.isArray(raw.session.unlocked) || !isObj(raw.session.routes)) return 'session missing';
  if (typeof raw.clockOffset !== 'number') return 'clock missing';
  if (!isObj(raw.ui) || (raw.ui.mode !== 'guided' && raw.ui.mode !== 'free')) return 'ui missing';
  if (!isObj(s.opening) || typeof s.opening.played !== 'boolean') return 'opening missing';
  return null;
}

let memoryOnly = false;
export function storageIsMemoryOnly() {
  return memoryOnly;
}

function store(): Storage | null {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null;
  } catch {
    memoryOnly = true;
    return null;
  }
}

export function load(): Loaded {
  const st = store();
  if (!st) return { status: 'empty' };
  let text: string | null = null;
  try {
    text = st.getItem(STORAGE_KEY);
  } catch {
    memoryOnly = true;
    return { status: 'empty' };
  }
  if (!text) return { status: 'empty' };
  try {
    const raw = JSON.parse(text);
    const reason = validateRoot(raw);
    return reason ? { status: 'reset', reason } : { status: 'ok', root: raw as Root };
  } catch {
    return { status: 'reset', reason: 'saved data is not valid JSON' };
  }
}

export function save(root: Root): void {
  const st = store();
  if (!st) return;
  try {
    st.setItem(STORAGE_KEY, JSON.stringify(root));
  } catch {
    memoryOnly = true;
  }
}

export function clear(): void {
  try {
    store()?.removeItem(STORAGE_KEY);
  } catch {
    memoryOnly = true;
  }
}
