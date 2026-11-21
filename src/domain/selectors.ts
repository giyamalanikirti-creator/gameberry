import { SCORE_ORDER } from './players';
import { inWindow } from './time';
import { Challenge, ChallengeStatus, DomainState, PlayerId, TERMINAL_STATUSES } from './types';

export type PairScore = Record<PlayerId, number>;

/** Head-to-head derived from unique completed match IDs. */
export function pairRecord(state: Pick<DomainState, 'results'>): PairScore {
  const seen = new Set<string>();
  const score: PairScore = { kirti: 0, ahmed: 0 };
  for (const r of state.results) {
    if (seen.has(r.matchId)) continue;
    seen.add(r.matchId);
    score[r.winner] += 1;
  }
  return score;
}

/** "Ahmed 1 · Kirti 0" with names in SCORE_ORDER, the same in every view. */
export function scoreLine(state: DomainState): string {
  const s = pairRecord(state);
  return SCORE_ORDER.map((id) => `${state.players[id].name} ${s[id]}`).join(' · ');
}

export function isTerminal(status: ChallengeStatus): boolean {
  return TERMINAL_STATUSES.has(status);
}

export function challengesInOrder(state: DomainState): Challenge[] {
  return state.challengeOrder.map((id) => state.challenges[id]);
}

export function latestChallenge(state: DomainState): Challenge | null {
  const id = state.challengeOrder[state.challengeOrder.length - 1];
  return id ? state.challenges[id] : null;
}

export function activeChallenge(state: DomainState): Challenge | null {
  const c = latestChallenge(state);
  return c && !isTerminal(c.status) ? c : null;
}

export function latestChallengeFor(state: DomainState, originMatchId: string): Challenge | null {
  const list = challengesInOrder(state).filter((c) => c.originMatchId === originMatchId);
  return list[list.length - 1] ?? null;
}

/** A new invitation for the same match is allowed only after a no-fault outcome. */
export function allowsReinvite(c: Challenge): boolean {
  return c.status === 'missed' || c.status === 'abandoned' || (c.status === 'expired' && c.window !== null);
}

export function activeReadiness(c: Challenge, player: PlayerId, at: number): boolean {
  const r = c.readiness[player];
  return !!r && at >= r.since && at < r.until;
}

export function windowOpen(c: Challenge, at: number): boolean {
  return !!c.window && inWindow(c.window, at);
}

export function unreadNotifications(state: DomainState, player: PlayerId) {
  return state.notifications.filter((n) => n.to === player && n.readAt === null);
}

export function isTied(state: DomainState): boolean {
  const s = pairRecord(state);
  return s.kirti === s.ahmed;
}
