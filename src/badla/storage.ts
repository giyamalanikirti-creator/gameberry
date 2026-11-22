import { DEMO_START } from '../domain/time';
import { createDemo, PLAYERS, type DemoState, type PlayerId } from './model';

export const KEY = 'badla-series-demo';
const VERSION = 1;

export interface Session {
  state: DemoState;
  viewer: PlayerId;
  offset: number;
  route: string;
  motion: 'system' | 'reduced';
}

export function parseRoute(hash: string): string | null {
  const value = hash.replace(/^#\/?/, '');
  return /^(opening|lobby|club|challenge|decider|grudge|(?:round|fixture)\/[a-z0-9-]+|notice\/[a-z0-9/-]+)$/.test(value) ? value : null;
}

export function freshSession(now = Date.now()): Session {
  return { state: createDemo(), viewer: 'riya', offset: DEMO_START - now, route: 'opening', motion: 'system' };
}

export function readSession(now = Date.now()): { session: Session; invalid: boolean } {
  const fallback = freshSession(now);
  let text: string | null;
  try { text = localStorage.getItem(KEY); }
  catch { return { session: fallback, invalid: false }; }
  if (!text) return { session: fallback, invalid: false };
  try {
    const { version, session } = JSON.parse(text);
    const state = session?.state;
    if (version !== VERSION || !Object.hasOwn(PLAYERS, session?.viewer) || !Number.isFinite(session?.offset) ||
        !parseRoute(session?.route ?? '') || !['system', 'reduced'].includes(session.motion) ||
        !state?.opening?.id || !Array.isArray(state.opening.replay?.path) || !Array.isArray(state.club?.members) ||
        !Number.isInteger(state.nextRound) || !state.demo?.balances ||
        !['rounds', 'invites', 'fixtures', 'predictions', 'wallet', 'assists', 'events', 'muted', 'blocked'].every(key => Array.isArray(state[key])) ||
        state.rounds.some((round: DemoState['rounds'][number]) =>
          !round?.id || !Array.isArray(round.seats) || !round.booking || !Number.isInteger(round.revision) ||
          (round.status === 'active' && (!round.game?.pawns?.[round.game.turn] || !round.game.dice)))) {
      return { session: fallback, invalid: true };
    }
    return { session, invalid: false };
  } catch {
    return { session: fallback, invalid: true };
  }
}

export function writeSession(session: Session) {
  try { localStorage.setItem(KEY, JSON.stringify({ version: VERSION, session })); }
  catch { /* The current session remains available in memory. */ }
}
