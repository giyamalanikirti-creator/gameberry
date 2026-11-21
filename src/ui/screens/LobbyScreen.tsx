import { ReactNode, useState } from 'react';
import { isPairBlocked } from '../../domain/notifications';
import { PLAYERS, opponent } from '../../domain/players';
import { activeReadiness, allowsReinvite, latestChallenge, windowOpen } from '../../domain/selectors';
import { formatCountdown, formatDateTime, formatDuration, formatWindow } from '../../domain/time';
import type { Challenge, DomainState, PlayerId } from '../../domain/types';
import { Avatar, ScoreLine, ScreenLayout, StatusChip } from '../components/Common';
import { inviteTitle, kindLabel } from '../copy';
import { useBadla } from '../store';

function WindowLine({ c, viewer }: { c: Challenge; viewer: PlayerId }) {
  if (!c.window) return null;
  const me = PLAYERS[viewer];
  const them = PLAYERS[opponent(viewer)];
  return (
    <div className="time-block">
      <p className="time-main">
        {formatWindow(c.window, me.timeZone)} <span className="tz">{me.timeZoneLabel}</span>
      </p>
      <p className="time-sub">
        {formatWindow(c.window, them.timeZone).split(', ')[1]} for {them.name} ({them.timeZoneLabel})
      </p>
    </div>
  );
}

function originLabel(domain: DomainState, c: Challenge): string {
  const m = domain.matches[c.originMatchId];
  if (c.kind === 'badla') return `Badla for the capture in match ${m?.number ?? 1}`;
  if (c.kind === 'decider') return 'One each · the decider';
  return `After match ${m?.number ?? ''}`.trim();
}

interface CardView {
  title: string;
  sub?: string;
  chip?: ReactNode;
  body?: ReactNode;
  actions?: ReactNode;
  tone?: 'warm' | 'calm' | 'muted';
}

export function RivalryCard() {
  const { domain, ui, now, act, go } = useBadla();
  const viewer = ui.viewer;
  const opp = opponent(viewer);
  const oppName = PLAYERS[opp].name;
  const c = latestChallenge(domain);
  const blocked = isPairBlocked(domain);
  const [confirmCancel, setConfirmCancel] = useState(false);

  const cancelButton = (ch: Challenge) =>
    confirmCancel ? (
      <span className="confirm-row">
        <span className="hint">Cancel for both of you?</span>
        <button type="button" className="btn btn-danger btn-small" onClick={() => { act({ type: 'cancel', actor: viewer, challengeId: ch.id }); setConfirmCancel(false); }}>
          Yes, cancel
        </button>
        <button type="button" className="btn btn-ghost btn-small" onClick={() => setConfirmCancel(false)}>Keep it</button>
      </span>
    ) : (
      <button type="button" className="btn btn-ghost" onClick={() => setConfirmCancel(true)}>Cancel match</button>
    );

  const neutral = (extra?: string): CardView => {
    const lastDone = [...domain.results].sort((a, b) => b.completedAt - a.completedAt)[0];
    const m = lastDone ? domain.matches[lastDone.matchId] : null;
    const canAskOriginal = !c && !blocked && domain.matches['m-original']?.winner === opp;
    return {
      title: `You and ${oppName}`,
      sub: m ? `Last match: ${PLAYERS[m.winner!].name} won · match ${m.number}` : undefined,
      body: (
        <>
          <ScoreLine domain={domain} />
          {extra && <p className="hint">{extra}</p>}
          {blocked && <p className="hint">Invitations are off between you two.</p>}
        </>
      ),
      actions: m && (
        <button type="button" className={canAskOriginal ? 'btn btn-primary' : 'btn btn-secondary'} onClick={() => go(m.kind === 'original' ? { name: 'result', matchId: m.id } : { name: 'rivalry', matchId: m.id })}>
          {canAskOriginal ? 'See the result · Ask for Badla' : 'See last result'}
        </button>
      ),
      tone: 'muted',
    };
  };

  let view: CardView;
  if (!c) {
    view = neutral();
  } else {
    const iAmChallenger = c.challenger === viewer;
    const meReady = activeReadiness(c, viewer, now);
    const oppReady = activeReadiness(c, opp, now);
    switch (c.status) {
      case 'pending':
        view = iAmChallenger
          ? {
              title: inviteTitle(c, viewer),
              sub: originLabel(domain, c),
              chip: <StatusChip tone="warm">Waiting for {oppName}</StatusChip>,
              body: <p className="hint">{oppName} can play now, pick a time tomorrow or pass. Expires {formatDateTime(c.expiresAt, PLAYERS[viewer].timeZone)}.</p>,
              actions: (
                <>
                  <button type="button" className="btn btn-secondary" onClick={() => go(domain.matches[c.originMatchId].kind === 'original' ? { name: 'result', matchId: c.originMatchId } : { name: 'rivalry', matchId: c.originMatchId })}>
                    Watch replay
                  </button>
                  <button type="button" className="btn btn-ghost" onClick={() => act({ type: 'withdraw', actor: viewer, challengeId: c.id })}>
                    Withdraw
                  </button>
                </>
              ),
              tone: 'warm',
            }
          : {
              title: inviteTitle(c, viewer),
              sub: originLabel(domain, c),
              chip: <StatusChip tone="warm">New</StatusChip>,
              actions: (
                <button type="button" className="btn btn-primary" onClick={() => go({ name: 'invite', challengeId: c.id })}>
                  See invitation
                </button>
              ),
              tone: 'warm',
            };
        break;
      case 'proposed':
        view = iAmChallenger
          ? {
              title: `${oppName} suggested a time`,
              sub: originLabel(domain, c),
              chip: <StatusChip tone="warm">Your call</StatusChip>,
              body: (
                <>
                  <WindowLine c={c} viewer={viewer} />
                  <p className="hint">Only your confirmation books it.</p>
                </>
              ),
              actions: (
                <>
                  <button type="button" className="btn btn-primary" onClick={() => act({ type: 'confirmTime', actor: viewer, challengeId: c.id })}>
                    Confirm time
                  </button>
                  <button type="button" className="btn btn-ghost" onClick={() => act({ type: 'declineTime', actor: viewer, challengeId: c.id })}>
                    Decline
                  </button>
                </>
              ),
              tone: 'warm',
            }
          : {
              title: 'You suggested a time',
              sub: originLabel(domain, c),
              chip: <StatusChip>Waiting for {oppName}</StatusChip>,
              body: <WindowLine c={c} viewer={viewer} />,
              tone: 'calm',
            };
        break;
      case 'scheduled':
      case 'waiting': {
        const w = c.window!;
        if (now < w.start) {
          view = {
            title: `${kindLabel(c)} with ${oppName}`,
            sub: 'Agreed by both of you',
            chip: <StatusChip tone="go">Scheduled</StatusChip>,
            body: (
              <>
                <WindowLine c={c} viewer={viewer} />
                <p className="hint">Opens in {formatDuration(w.start - now)}. You can join from here even with reminders off.</p>
              </>
            ),
            actions: cancelButton(c),
            tone: 'calm',
          };
        } else if (windowOpen(c, now)) {
          const left = formatDuration(w.end - now);
          if (meReady) {
            view = {
              title: "You're at the table",
              sub: `${kindLabel(c)} with ${oppName}`,
              chip: <StatusChip tone="go">You're ready</StatusChip>,
              body: <p className="hint">Waiting for {oppName} · {formatCountdown(c.readiness[viewer]!.until - now)} left.</p>,
              actions: (
                <>
                  <button type="button" className="btn btn-primary" onClick={() => go({ name: 'table', challengeId: c.id })}>Open table</button>
                  {cancelButton(c)}
                </>
              ),
              tone: 'warm',
            };
          } else if (oppReady) {
            view = {
              title: `${oppName} is ready`,
              sub: `${kindLabel(c)} · table open`,
              chip: <StatusChip tone="go">{oppName} ready</StatusChip>,
              body: <p className="hint">{oppName}'s table is open for {formatCountdown(c.readiness[opp]!.until - now)}.</p>,
              actions: (
                <>
                  <button type="button" className="btn btn-primary" onClick={() => go({ name: 'table', challengeId: c.id })}>Open table</button>
                  {c.mode === 'now' ? (
                    <button type="button" className="btn btn-ghost" onClick={() => act({ type: 'dismissJoin', actor: viewer, challengeId: c.id })}>Not now</button>
                  ) : (
                    cancelButton(c)
                  )}
                </>
              ),
              tone: 'warm',
            };
          } else {
            view = {
              title: `Your ${kindLabel(c)} window is open`,
              sub: `With ${oppName}`,
              chip: <StatusChip tone="go">Open now</StatusChip>,
              body: (
                <>
                  <WindowLine c={c} viewer={viewer} />
                  <p className="hint">Neither of you is at the table yet. Closes in {left}.</p>
                </>
              ),
              actions: (
                <>
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={() => {
                      if (act({ type: 'ready', actor: viewer, challengeId: c.id })) go({ name: 'table', challengeId: c.id });
                    }}
                  >
                    I'm ready
                  </button>
                  {cancelButton(c)}
                </>
              ),
              tone: 'warm',
            };
          }
        } else {
          view = neutral();
        }
        break;
      }
      case 'playing':
        view = {
          title: 'Match in progress',
          sub: `${kindLabel(c)} with ${oppName}`,
          chip: <StatusChip tone="go">Live</StatusChip>,
          actions: (
            <button type="button" className="btn btn-primary" onClick={() => go({ name: 'match', matchId: c.matchId! })}>
              {viewer === 'kirti' ? 'Resume match' : 'Watch match'}
            </button>
          ),
          tone: 'warm',
        };
        break;
      case 'missed':
      case 'abandoned':
      case 'expired': {
        if (c.status === 'expired' && !allowsReinvite(c)) {
          view = neutral(iAmChallenger ? 'The invitation expired.' : undefined);
          break;
        }
        const who = c.everReady.map((p) => PLAYERS[p].name).join(' and ');
        view = {
          title: c.status === 'abandoned' ? 'Match left unfinished' : c.status === 'missed' ? 'You missed each other' : 'The window closed',
          sub: `${kindLabel(c)} with ${oppName}`,
          chip: <StatusChip tone="muted">No result</StatusChip>,
          body: (
            <>
              <p className="hint">
                {c.status === 'missed' ? `Only ${who} made it to the table before it closed. ` : ''}
                No score change. A new invitation needs both of you again.
              </p>
              <ScoreLine domain={domain} />
            </>
          ),
          actions: !blocked && (
            <button type="button" className="btn btn-secondary" onClick={() => act({ type: 'sendChallenge', actor: viewer, matchId: c.originMatchId })}>
              Send a new invitation
            </button>
          ),
          tone: 'muted',
        };
        break;
      }
      case 'completed': {
        const m = domain.matches[c.matchId!];
        view = {
          title: `${m.winner === viewer ? 'You' : PLAYERS[m.winner!].name} won match ${m.number}`,
          sub: kindLabel(c),
          body: <ScoreLine domain={domain} />,
          actions: (
            <button type="button" className="btn btn-primary" onClick={() => go({ name: 'rivalry', matchId: m.id })}>
              See head-to-head
            </button>
          ),
          tone: 'calm',
        };
        break;
      }
      case 'declined':
        view = neutral(iAmChallenger ? 'No match this time.' : undefined);
        break;
      case 'withdrawn':
        view = neutral(iAmChallenger ? 'You withdrew your invitation.' : undefined);
        break;
      case 'cancelled':
        view = neutral('That match was cancelled.');
        break;
      case 'blocked':
      default:
        view = neutral();
    }
  }

  return (
    <article className={`rivalry-card rc-${view.tone ?? 'calm'}`} aria-live="polite" data-testid="rivalry-card">
      <div className="rc-head">
        <Avatar player={opp} size="lg" ready={c ? activeReadiness(c, opp, now) : false} />
        <div className="rc-titles">
          {view.chip && <div className="rc-chip">{view.chip}</div>}
          <h2 className="rc-title">{view.title}</h2>
          {view.sub && <p className="rc-sub">{view.sub}</p>}
        </div>
      </div>
      {view.body && <div className="rc-body">{view.body}</div>}
      {view.actions && <div className="rc-actions">{view.actions}</div>}
    </article>
  );
}

function Settings() {
  const { domain, ui, act } = useBadla();
  const viewer = ui.viewer;
  const s = domain.settings[viewer];
  const oppName = PLAYERS[opponent(viewer)].name;
  const [confirmBlock, setConfirmBlock] = useState(false);
  return (
    <section className="settings" aria-labelledby="settings-h">
      <h2 id="settings-h" className="panel-h">Badla settings</h2>
      <label className="switch-row">
        <input
          type="checkbox"
          role="switch"
          checked={!s.mutedReminders}
          onChange={(e) => act({ type: 'setMute', actor: viewer, muted: !e.target.checked })}
        />
        <span>
          <strong>Badla reminders</strong>
          <small>{s.mutedReminders ? 'Off. Agreed matches still show here and you can still join.' : 'One reminder when your opponent is ready.'}</small>
        </span>
      </label>
      <div className="switch-row">
        <span>
          <strong>{s.blockedOpponent ? `${oppName} is blocked` : `Block ${oppName}`}</strong>
          <small>Ends open invitations and stops new ones.</small>
        </span>
        {s.blockedOpponent ? (
          <button type="button" className="btn btn-ghost btn-small" onClick={() => act({ type: 'setBlock', actor: viewer, blocked: false })}>Unblock</button>
        ) : confirmBlock ? (
          <span className="confirm-row">
            <button type="button" className="btn btn-danger btn-small" onClick={() => { act({ type: 'setBlock', actor: viewer, blocked: true }); setConfirmBlock(false); }}>Block</button>
            <button type="button" className="btn btn-ghost btn-small" onClick={() => setConfirmBlock(false)}>Cancel</button>
          </span>
        ) : (
          <button type="button" className="btn btn-ghost btn-small" onClick={() => setConfirmBlock(true)}>Block…</button>
        )}
      </div>
      <p className="hint">Opening the app never tells {oppName} you're around. Only “I'm ready” does.</p>
    </section>
  );
}

const MODES = ['Quick', 'Classic', 'Private table', 'Tournament'];

export function LobbyScreen() {
  const { ui } = useBadla();
  const me = PLAYERS[ui.viewer];
  return (
    <ScreenLayout
      label="Lobby"
      stage={
        <>
          <header className="lobby-head">
            <Avatar player={me.id} size="lg" />
            <div>
              <p className="eyebrow">Lobby</p>
              <h1 className="lobby-title">Hi, {me.name}</h1>
            </div>
          </header>
          <RivalryCard />
          <section aria-label="Other modes" className="modes">
            {MODES.map((m) => (
              <div key={m} className="mode-tile" aria-disabled="true">
                <span>{m}</span>
                <small>Not in this demo</small>
              </div>
            ))}
          </section>
        </>
      }
      panel={<Settings />}
    />
  );
}
