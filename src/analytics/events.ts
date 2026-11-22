import { localDateKey } from '../domain/time';
import type { AnalyticsEvent, PlayerId, State } from '../domain/types';

const TZ = 'Asia/Kolkata';

/** Product events only. Demo-drawer records never enter a count. */
export function productEvents(s: State): AnalyticsEvent[] {
  return s.analytics.filter((e) => e.source === 'product');
}

export const STAGE: Record<string, string> = {
  result_view: 'card', replay_shown: 'card', challenge_opened: 'card',
  series_created: 'invite', challenge_sent: 'invite', challenge_response: 'accept',
  partner_invited: 'partner', partner_invite_view: 'partner', partner_accepted: 'partner', partner_declined: 'partner',
  slots_offered: 'booking', slot_chosen: 'booking', booking_confirmed: 'booking', fixture_published: 'club',
  prediction_created: 'club', prediction_updated: 'club', predictions_locked: 'club', fixture_settled: 'club', prediction_verdict: 'club',
  club_result_open: 'club', ready: 'checkin', checkin_opened: 'checkin', round_started: 'play', roll: 'play', move: 'play',
  round_settled: 'result', series_closed: 'result', receipt_view: 'result', assist_awarded: 'result', seat_saved: 'result',
};

export function stageOf(name: string): string {
  return STAGE[name] ?? 'other';
}

export function activeDays(s: State, p: PlayerId): string[] {
  const days = new Set<string>();
  for (const e of productEvents(s)) if (e.playerId === p) days.add(localDateKey(e.at, TZ));
  return [...days].sort();
}

/** Which funnel stages the demo's own path has lit. Skipped stages stay grey. */
export function litStages(s: State): Set<string> {
  const ev = productEvents(s);
  const has = (n: string, f?: (e: AnalyticsEvent) => boolean) => ev.some((e) => e.name === n && (!f || f(e)));
  const lit = new Set<string>();
  if (has('replay_shown') || has('result_view')) lit.add('card');
  if (has('challenge_sent')) lit.add('invite');
  if (has('challenge_response', (e) => e.detail.response === 'accept')) lit.add('accepted');
  if (has('partner_invited')) lit.add('partner_invited');
  if (has('partner_accepted')) lit.add('partner_accepted');
  const scheduled = Object.values(s.rounds).filter((r) => r.timing === 'scheduled' && (r.status === 'confirmed' || r.status === 'checkin' || r.status === 'active' || r.status === 'settled'));
  if (scheduled.length) lit.add('tomorrow');
  const startedScheduled = scheduled.filter((r) => r.status === 'active' || r.status === 'settled');
  if (startedScheduled.length) lit.add('turnup');
  const firstDay = s.opening.settledAt;
  const later = ev.some((e) => e.name === 'round_settled' && localDateKey(e.at, TZ) !== localDateKey(firstDay, TZ));
  if (later) lit.add('inactive_day');
  return lit;
}

export function guardrails(s: State) {
  const ev = productEvents(s);
  const count = (f: (e: AnalyticsEvent) => boolean) => ev.filter(f).length;
  return [
    { label: 'Displaced normal matches', value: 0, note: 'no normal-match queue in the demo' },
    { label: 'Gold-entry declines', value: count((e) => e.name === 'partner_declined' || (e.name === 'challenge_response' && e.detail.response === 'pass')) },
    { label: 'Four-seat no-shows', value: count((e) => e.name === 'round_expired') },
    { label: 'Push mutes', value: count((e) => e.name === 'push_muted') },
    { label: 'Blocks or reports', value: count((e) => e.name === 'player_blocked') },
    { label: 'Suppressed notifications', value: count((e) => e.name === 'notification_suppressed') },
  ];
}
