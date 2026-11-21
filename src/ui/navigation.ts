import { ORIGINAL_MATCH_ID } from '../domain/initialState';
import { latestChallenge, windowOpen } from '../domain/selectors';
import type { Challenge, DomainState, Notification, PlayerId } from '../domain/types';
import type { Screen, UiState } from '../persistence/storage';
import { DEMO_START } from '../domain/time';

export function freshUi(realNow = Date.now()): UiState {
  return {
    viewer: 'kirti',
    screens: {
      kirti: { name: 'result', matchId: ORIGINAL_MATCH_ID },
      ahmed: { name: 'result', matchId: ORIGINAL_MATCH_ID },
    },
    guided: true,
    reducedMotion: null,
    clockOffset: DEMO_START - realNow,
    bannersSeen: [],
  };
}

/** The screen where a challenge needs this player's attention. */
export function screenForChallenge(c: Challenge, player: PlayerId, at: number): Screen {
  if (c.status === 'pending' && c.invitee === player) return { name: 'invite', challengeId: c.id };
  if ((c.status === 'scheduled' || c.status === 'waiting') && windowOpen(c, at)) return { name: 'table', challengeId: c.id };
  if (c.status === 'playing' && c.matchId) return { name: 'match', matchId: c.matchId };
  if (c.status === 'completed' && c.matchId) return { name: 'rivalry', matchId: c.matchId };
  return { name: 'lobby' };
}

/** Where a demo handoff should land a player. */
export function handoffScreen(domain: DomainState, player: PlayerId, at: number, current: Screen): Screen {
  const c = latestChallenge(domain);
  if (!c) return current;
  return screenForChallenge(c, player, at);
}

/** Tapping a notification rechecks state; a stale one lands on the lobby card. */
export function screenForNotification(domain: DomainState, n: Notification, at: number): { screen: Screen; stale: boolean } {
  const c = domain.challenges[n.challengeId];
  if (!c) return { screen: { name: 'lobby' }, stale: true };
  if (c.status === 'playing' && c.matchId) return { screen: { name: 'match', matchId: c.matchId }, stale: false };
  if ((c.status === 'scheduled' || c.status === 'waiting') && windowOpen(c, at)) {
    return { screen: { name: 'table', challengeId: c.id }, stale: false };
  }
  return { screen: { name: 'lobby' }, stale: true };
}

function sameScreen(a: Screen, b: Screen): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/** Keep each player's screen consistent with the committed state. */
export function syncScreens(domain: DomainState, ui: UiState, at: number): UiState {
  let changed = false;
  const screens = { ...ui.screens };
  for (const p of ['kirti', 'ahmed'] as const) {
    const s = screens[p];
    let next: Screen = s;
    if (s.name === 'match') {
      const m = domain.matches[s.matchId];
      if (m?.status === 'completed') next = { name: 'rivalry', matchId: m.id };
      else if (!m || m.status === 'abandoned') next = { name: 'lobby' };
    } else if (s.name === 'table') {
      const c = domain.challenges[s.challengeId];
      if (c?.status === 'playing' && c.matchId) next = { name: 'match', matchId: c.matchId };
    } else if (s.name === 'invite') {
      const c = domain.challenges[s.challengeId];
      if (!c) next = { name: 'lobby' };
      else if (c.status !== 'pending') next = screenForChallenge(c, p, at);
    }
    if (!sameScreen(next, s)) {
      screens[p] = next;
      changed = true;
    }
  }
  return changed ? { ...ui, screens } : ui;
}
