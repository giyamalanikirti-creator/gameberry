/**
 * Analytics adapter. Each committed player action writes exactly one event
 * with source "player" (or "demo-opponent" for the scripted Ahmed). Things the
 * system does as a consequence (a reminder delivered, an invitation expiring)
 * are logged with source "system". Demo controls log with source "demo" and
 * replay views with source "replay", so they can be filtered out.
 */
import { PAIR_ID } from './players';
import { analyticsDate } from './time';
import type { AnalyticsEvent, DomainState, EventSource, PlayerId } from './types';

export interface TrackInput {
  name: string;
  at: number;
  actor: PlayerId | 'system' | 'demo';
  source: EventSource;
  challengeId?: string;
  matchId?: string;
  detail?: AnalyticsEvent['detail'];
}

/** Mutates a draft state. Only call on a clone. */
export function track(draft: DomainState, input: TrackInput): void {
  draft.seq += 1;
  draft.analytics.push({
    id: `ev-${draft.seq}`,
    name: input.name,
    at: input.at,
    date: analyticsDate(input.at),
    actor: input.actor,
    source: input.source,
    pairId: PAIR_ID,
    ...(input.challengeId ? { challengeId: input.challengeId } : {}),
    ...(input.matchId ? { matchId: input.matchId } : {}),
    ...(input.detail ? { detail: input.detail } : {}),
  });
}

const ACTIVE_SOURCES: ReadonlySet<EventSource> = new Set(['player']);

/**
 * Distinct (player, UTC date) pairs with at least one genuine player action.
 * A reminder, an acceptance and a return match on the same date count once.
 */
export function activePlayerDays(events: AnalyticsEvent[]): string[] {
  const days = new Set<string>();
  for (const e of events) {
    if (ACTIVE_SOURCES.has(e.source) && (e.actor === 'kirti' || e.actor === 'ahmed') && e.name !== 'app_opened') {
      days.add(`${e.actor}|${e.date}`);
    }
  }
  return [...days].sort();
}
