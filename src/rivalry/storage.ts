import { newRivalry, type RivalryState, type Viewer } from './model';

export type RouteName = 'lobby' | 'table' | 'result' | 'invite' | 'rivals' | 'ledger' | 'inbox';
export interface Route { name: RouteName; id?: string }
interface Session {
  state: RivalryState;
  viewer: Viewer;
  route: Route;
  reduced: boolean;
}
const KEY = 'badla-rivalry-v1';
const ROUTES = new Set(['lobby', 'table', 'result', 'invite', 'rivals', 'ledger', 'inbox']);
export function initialSession(): Session {
  const seed = globalThis.crypto?.getRandomValues(new Uint32Array(1))[0] ?? Math.floor(Math.random() * 0x100000000);
  return { state: newRivalry(seed), viewer: 'riya', route: { name: 'lobby' }, reduced: false };
}
export function loadSession(): Session {
  try {
    const data = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    if (data && data.state?.version === 1 && Number.isFinite(data.state.now) && Number.isInteger(data.state.seed) && ROUTES.has(data.route?.name) &&
      ['riya', 'gunjan'].includes(data.viewer) && ['matches', 'cards', 'debts', 'events', 'activities', 'pushes', 'series'].every(key => Array.isArray(data.state[key])) &&
      typeof data.state.settings === 'object' && data.state.settings !== null) return data as Session;
  } catch { /* The demo can run without browser storage. */ }
  return initialSession();
}
export function saveSession(session: Session) {
  try { localStorage.setItem(KEY, JSON.stringify(session)); }
  catch { /* Browser storage is optional. */ }
}
