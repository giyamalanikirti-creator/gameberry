/**
 * Local notification adapter. Writes inbox entries keyed by invitation ID and
 * suppresses duplicates, muted recipients, blocked pairs and closed invitations.
 */
import { track } from './analytics';
import { PLAYERS } from './players';
import { formatTime } from './time';
import { Challenge, DomainState, PlayerId, TERMINAL_STATUSES } from './types';

export type SuppressReason = 'muted' | 'blocked' | 'duplicate' | 'closed';

export function isPairBlocked(state: DomainState): boolean {
  return state.settings.kirti.blockedOpponent || state.settings.ahmed.blockedOpponent;
}

export function reminderCopy(c: Challenge, from: PlayerId): string {
  const name = PLAYERS[from].name;
  if (c.kind === 'decider') return `${name} is ready for your decider.`;
  if (c.kind === 'another') return `${name} is ready for your match.`;
  return `${name} is ready for your Badla match.`;
}

/**
 * Send the single readiness reminder for an invitation to `to`.
 * Mutates the draft. Returns the reason if nothing was delivered.
 */
export function deliverReminder(
  draft: DomainState,
  c: Challenge,
  from: PlayerId,
  to: PlayerId,
  at: number,
  tableCloses: number,
): SuppressReason | null {
  let reason: SuppressReason | null = null;
  if (TERMINAL_STATUSES.has(c.status)) reason = 'closed';
  else if (isPairBlocked(draft)) reason = 'blocked';
  else if (c.remindersSent.includes(to) || draft.notifications.some((n) => n.challengeId === c.id && n.to === to)) reason = 'duplicate';
  else if (draft.settings[to].mutedReminders) reason = 'muted';

  if (reason) {
    track(draft, {
      name: 'reminder_suppressed',
      at,
      actor: 'system',
      source: 'system',
      challengeId: c.id,
      detail: { to, reason },
    });
    return reason;
  }

  draft.seq += 1;
  const tz = PLAYERS[to].timeZone;
  draft.notifications.push({
    id: `n-${draft.seq}`,
    to,
    from,
    challengeId: c.id,
    kind: 'ready',
    title: reminderCopy(c, from),
    body: `Table open until ${formatTime(tableCloses, tz)}. Tap to check the table.`,
    createdAt: at,
    readAt: null,
  });
  c.remindersSent.push(to);
  track(draft, { name: 'reminder_delivered', at, actor: 'system', source: 'system', challengeId: c.id, detail: { to } });
  return null;
}
