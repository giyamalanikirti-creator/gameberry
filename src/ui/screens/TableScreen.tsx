import { PLAYERS, SCORE_ORDER, opponent } from '../../domain/players';
import { activeReadiness, allowsReinvite, windowOpen } from '../../domain/selectors';
import { formatCountdown, formatDuration, formatWindow } from '../../domain/time';
import { Avatar, ScreenLayout } from '../components/Common';
import { kindLabel } from '../copy';
import { useBadla } from '../store';

/** The shared waiting table both players can join from. */
export function TableScreen({ challengeId }: { challengeId: string }) {
  const { domain, ui, now, act, go } = useBadla();
  const c = domain.challenges[challengeId];
  if (!c) return null;
  const viewer = ui.viewer;
  const opp = opponent(viewer);
  const oppName = PLAYERS[opp].name;
  const me = PLAYERS[viewer];
  const open = windowOpen(c, now) && (c.status === 'scheduled' || c.status === 'waiting');
  const meReady = activeReadiness(c, viewer, now);
  const oppReady = activeReadiness(c, opp, now);

  let headline: string;
  let detail: string;
  if (open) {
    if (oppReady) {
      headline = `${oppName} is at the table`;
      detail = `${oppName}'s seat is held for ${formatCountdown(c.readiness[opp]!.until - now)}.`;
    } else if (meReady) {
      headline = `Waiting for ${oppName}`;
      detail = `Your seat is held for ${formatCountdown(c.readiness[viewer]!.until - now)}. ${oppName} gets one reminder, unless reminders are off.`;
    } else {
      headline = c.everReady.length ? 'The table is empty again' : 'The table is open';
      detail = c.everReady.length
        ? `A seat was held but timed out. You can still mark ready until the window closes in ${formatDuration(c.window!.end - now)}.`
        : `Closes in ${formatDuration(c.window!.end - now)}.`;
    }
  } else if (c.status === 'scheduled' && c.window && now < c.window.start) {
    headline = 'Not open yet';
    detail = `Opens in ${formatDuration(c.window.start - now)}.`;
  } else if (c.status === 'missed') {
    headline = 'You missed each other';
    detail = 'The window closed with only one player at the table. No result, no score change.';
  } else if (c.status === 'playing') {
    headline = 'Match in progress';
    detail = '';
  } else {
    headline = 'This table has closed';
    detail = 'Check your lobby for the current status.';
  }

  return (
    <ScreenLayout
      label="Waiting table"
      stage={
        <>
          <header className="result-head">
            <p className="eyebrow">{kindLabel(c)} table{c.mode === 'now' ? ' · play now' : ''}</p>
            <h1 className="result-title" aria-live="polite">{headline}</h1>
            {c.window && (
              <p className="time-sub">
                Window {formatWindow(c.window, me.timeZone)} {me.timeZoneLabel}
              </p>
            )}
          </header>
          <div className="seats">
            {SCORE_ORDER.map((p) => {
              const ready = activeReadiness(c, p, now);
              return (
                <div key={p} className={`seat${ready ? ' seat-ready' : ''}`}>
                  <Avatar player={p} size="lg" ready={ready} />
                  <strong>{PLAYERS[p].name}{p === viewer ? ' (you)' : ''}</strong>
                  <span className="seat-status">{ready ? `Ready · ${formatCountdown(c.readiness[p]!.until - now)}` : 'Not at the table'}</span>
                </div>
              );
            })}
          </div>
          {detail && <p className="hint center">{detail}</p>}
        </>
      }
      panel={
        <div className="actions">
          {open && oppReady && (
            <button type="button" className="btn btn-primary btn-big" onClick={() => act({ type: 'ready', actor: viewer, challengeId: c.id })}>
              Join match
            </button>
          )}
          {open && !oppReady && !meReady && (
            <button type="button" className="btn btn-primary btn-big" onClick={() => act({ type: 'ready', actor: viewer, challengeId: c.id })}>
              I'm ready
            </button>
          )}
          {open && c.mode === 'now' && oppReady && (
            <button type="button" className="btn btn-ghost" onClick={() => act({ type: 'dismissJoin', actor: viewer, challengeId: c.id })}>
              Not now
            </button>
          )}
          {open && (c.mode !== 'now' || meReady) && (
            <button type="button" className="btn btn-ghost" onClick={() => act({ type: 'cancel', actor: viewer, challengeId: c.id })}>
              Cancel match
            </button>
          )}
          {c.status === 'playing' && c.matchId && (
            <button type="button" className="btn btn-primary" onClick={() => go({ name: 'match', matchId: c.matchId! })}>Go to match</button>
          )}
          {allowsReinvite(c) && (
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => {
                if (act({ type: 'sendChallenge', actor: viewer, matchId: c.originMatchId })) go({ name: 'lobby' });
              }}
            >
              Send a new invitation
            </button>
          )}
          <button type="button" className="btn btn-ghost" onClick={() => go({ name: 'lobby' })}>Back to lobby</button>
        </div>
      }
    />
  );
}
