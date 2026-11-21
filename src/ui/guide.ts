import { ORIGINAL_MATCH_ID } from '../domain/initialState';
import { PLAYERS } from '../domain/players';
import { activeReadiness, isTied, latestChallenge, unreadNotifications, windowOpen } from '../domain/selectors';
import type { DomainState, PlayerId } from '../domain/types';
import type { Screen, UiState } from '../persistence/storage';

export type GuideAction =
  | { kind: 'switch'; to: PlayerId; label: string }
  | { kind: 'advance'; label: string }
  | { kind: 'go'; screen: Screen; label: string }
  | { kind: 'inbox'; label: string }
  | { kind: 'reset'; label: string };

export interface GuideStep {
  text: string;
  action?: GuideAction;
}

const switchTo = (p: PlayerId): GuideAction => ({
  kind: 'switch',
  to: p,
  label: p === 'ahmed' ? "Try Ahmed's view" : "Back to Kirti's view",
});

/**
 * The guided demo never acts for anyone. It only says whose move it is and
 * offers a handoff; the reviewer always taps the player's choice.
 */
export function guideStep(domain: DomainState, ui: UiState, now: number): GuideStep | null {
  const viewer = ui.viewer;
  const screen = ui.screens[viewer];
  const c = latestChallenge(domain);

  if (!c) {
    if (viewer === 'ahmed') return { text: 'Nothing for Ahmed yet. Kirti makes the first move.', action: switchTo('kirti') };
    if (screen.name !== 'result') return { text: 'Open the match result to ask for Badla.', action: { kind: 'go', screen: { name: 'result', matchId: ORIGINAL_MATCH_ID }, label: 'Open result' } };
    return { text: 'Watch the capture, then tap Ask for Badla.' };
  }

  const challenger = PLAYERS[c.challenger].name;
  const invitee = PLAYERS[c.invitee].name;

  switch (c.status) {
    case 'pending':
      return viewer === c.invitee
        ? { text: `${invitee} decides: play now, tomorrow evening or pass. Nothing is accepted until you tap.` }
        : { text: `${invitee} decides next. The demo never answers on ${invitee}'s behalf.`, action: switchTo(c.invitee) };
    case 'proposed':
      return viewer === c.challenger
        ? { text: `Confirm or decline ${invitee}'s time. Only confirming books it.` }
        : { text: `${challenger} confirms or declines the time.`, action: switchTo(c.challenger) };
    case 'scheduled':
    case 'waiting': {
      if (!c.window) return null;
      if (now < c.window.start) return { text: 'Booked for tomorrow evening. Skip ahead to the agreed time.', action: { kind: 'advance', label: 'Advance to agreed time' } };
      if (!windowOpen(c, now)) return null;
      const readyNow = (['kirti', 'ahmed'] as PlayerId[]).filter((p) => activeReadiness(c, p, now));
      if (readyNow.length === 0) {
        // In the story Ahmed shows up first; either order works.
        const first: PlayerId = 'ahmed';
        return viewer === first
          ? { text: "The window is open. Tap I'm ready. Kirti gets one reminder." }
          : { text: 'The window is open. In this story Ahmed shows up first.', action: switchTo(first) };
      }
      const waitingFor: PlayerId = readyNow[0] === 'kirti' ? 'ahmed' : 'kirti';
      if (viewer !== waitingFor) {
        return { text: `${PLAYERS[readyNow[0]].name} is at the table. ${PLAYERS[waitingFor].name} gets one reminder.`, action: switchTo(waitingFor) };
      }
      if (unreadNotifications(domain, viewer).some((n) => n.challengeId === c.id)) {
        return { text: 'Tap the notification to check the table, then Join match.', action: { kind: 'inbox', label: 'Open inbox' } };
      }
      return screen.name === 'table'
        ? { text: 'Tap Join match.' }
        : { text: 'Open the table to join.', action: { kind: 'go', screen: { name: 'table', challengeId: c.id }, label: 'Open table' } };
    }
    case 'playing':
      return viewer === 'kirti'
        ? { text: 'You take Kirti’s turns: Roll, then tap the highlighted token. A demo opponent plays Ahmed.' }
        : { text: 'Kirti’s turns are played in Kirti’s view. The demo opponent plays Ahmed.', action: switchTo('kirti') };
    case 'completed':
      if (screen.name !== 'rivalry' && c.matchId) return { text: 'See the head-to-head.', action: { kind: 'go', screen: { name: 'rivalry', matchId: c.matchId }, label: 'Open result' } };
      return isTied(domain)
        ? { text: 'One each. Offer the decider — it needs the other player to accept too.' }
        : { text: 'Ask for another match, or reset to try a different path.', action: { kind: 'reset', label: 'Reset demo' } };
    case 'missed':
      return { text: 'You missed each other. No score change. Either player can send a new invitation.' };
    case 'abandoned':
      return { text: 'Match left unfinished. No result was recorded.' };
    default:
      return viewer === 'ahmed'
        ? { text: 'This invitation is closed. See how it looks for Kirti: no pending card, no guilt message.', action: switchTo('kirti') }
        : { text: 'This invitation is closed. Reset to try another path.', action: { kind: 'reset', label: 'Reset demo' } };
  }
}
