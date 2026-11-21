import { useState } from 'react';
import { PLAYERS } from '../domain/players';
import { latestChallenge, scoreLine, unreadNotifications } from '../domain/selectors';
import { formatTime } from '../domain/time';
import { Avatar } from './components/Common';
import { DemoControls, useOpenNotification } from './components/DemoControls';
import { guideStep } from './guide';
import { BadlaContext, useBadla, useBadlaStore } from './store';
import { InviteScreen } from './screens/InviteScreen';
import { LobbyScreen } from './screens/LobbyScreen';
import { MatchScreen } from './screens/MatchScreen';
import { ResultScreen } from './screens/ResultScreen';
import { RivalryScreen } from './screens/RivalryScreen';
import { TableScreen } from './screens/TableScreen';

function Header({ onOpenDemo }: { onOpenDemo: () => void }) {
  const { domain, ui, now } = useBadla();
  const me = PLAYERS[ui.viewer];
  const unread = unreadNotifications(domain, ui.viewer).length;
  return (
    <header className={`topbar topbar-${me.color}`}>
      <div className="identity" aria-live="polite">
        <Avatar player={me.id} size="sm" />
        <span>
          <strong>{me.name}</strong>
          <small>Viewing as {me.name} · {formatTime(now, me.timeZone)} {me.timeZoneLabel}</small>
        </span>
      </div>
      <p className="brand" aria-hidden="true">
        <span className="brand-mark">◆</span> Badla
      </p>
      <button type="button" className="demo-btn" onClick={onOpenDemo} aria-label={`Demo controls${unread ? `, ${unread} unread notification${unread > 1 ? 's' : ''}` : ''}`}>
        Demo controls
        {unread > 0 && <span className="badge" aria-hidden="true">{unread}</span>}
      </button>
    </header>
  );
}

function GuideBar({ onOpenInbox }: { onOpenInbox: () => void }) {
  const { domain, ui, now, switchViewer, advanceClock, go, reset } = useBadla();
  if (!ui.guided) return null;
  const step = guideStep(domain, ui, now);
  if (!step) return null;
  const a = step.action;
  const run = () => {
    if (!a) return;
    if (a.kind === 'switch') switchViewer(a.to, { handoff: true });
    else if (a.kind === 'advance') {
      const c = latestChallenge(domain);
      if (c?.window && now < c.window.start) advanceClock(c.window.start - now, 'agreed_time');
    } else if (a.kind === 'go') go(a.screen);
    else if (a.kind === 'inbox') onOpenInbox();
    else if (a.kind === 'reset') reset();
  };
  return (
    <div className="guide" role="note" aria-label="Demo guide">
      <span className="guide-tag">Demo guide</span>
      <p>{step.text}</p>
      {a && (
        <button type="button" className="btn btn-guide btn-small" onClick={run}>
          {a.label}
        </button>
      )}
    </div>
  );
}

/** Simulated device notification for the active identity. */
function Banner() {
  const { domain, ui, setUi } = useBadla();
  const open = useOpenNotification();
  const n = unreadNotifications(domain, ui.viewer).filter((x) => !ui.bannersSeen.includes(x.id)).pop();
  if (!n) return null;
  const dismiss = () => setUi({ bannersSeen: [...ui.bannersSeen, n.id] });
  return (
    <div className="push" role="alert">
      <button type="button" className="push-body" onClick={() => { dismiss(); open(n); }}>
        <span className="push-app">LUDO · Badla reminder · now</span>
        <strong>{n.title}</strong>
        <small>{n.body}</small>
      </button>
      <button type="button" className="push-x" onClick={dismiss} aria-label="Dismiss notification (it stays in the inbox)">✕</button>
    </div>
  );
}

function Announcer() {
  const { domain } = useBadla();
  const live = Object.values(domain.matches).find((m) => m.status === 'playing');
  const turn = live?.game ? ` Turn: ${PLAYERS[live.seats[live.game.turn]].name}.` : '';
  return (
    <p className="sr-only" aria-live="polite" aria-atomic="true">
      Head to head: {scoreLine(domain)}.{turn}
    </p>
  );
}

function CurrentScreen() {
  const { ui } = useBadla();
  const s = ui.screens[ui.viewer];
  switch (s.name) {
    case 'result':
      return <ResultScreen key={`r${s.matchId}${ui.viewer}`} matchId={s.matchId} />;
    case 'lobby':
      return <LobbyScreen key={`l${ui.viewer}`} />;
    case 'invite':
      return <InviteScreen key={`i${s.challengeId}`} challengeId={s.challengeId} />;
    case 'table':
      return <TableScreen challengeId={s.challengeId} />;
    case 'match':
      return <MatchScreen key={`m${s.matchId}${ui.viewer}`} matchId={s.matchId} />;
    case 'rivalry':
      return <RivalryScreen key={`v${s.matchId}${ui.viewer}`} matchId={s.matchId} />;
  }
}

function LoadError() {
  const { loadError, reset } = useBadla();
  if (!loadError) return null;
  return (
    <div className="sheet-backdrop">
      <div className="sheet sheet-small" role="alertdialog" aria-modal="true" aria-labelledby="le-h">
        <h2 id="le-h">Saved demo couldn't be restored</h2>
        <p className="hint">The stored data failed validation ({loadError}). Reset to start from the original match result.</p>
        <button type="button" className="btn btn-primary" onClick={reset}>Reset demo</button>
      </div>
    </div>
  );
}

function Toast() {
  const { toast } = useBadla();
  return toast ? <div className="toast" role="status">{toast}</div> : null;
}

function Shell() {
  const [demo, setDemo] = useState<null | 'controls' | 'inbox'>(null);
  return (
    <div className="app">
      <a className="skip" href="#main-content">Skip to content</a>
      <Header onOpenDemo={() => setDemo('controls')} />
      <GuideBar onOpenInbox={() => setDemo('inbox')} />
      <Banner />
      <div id="main-content">
        <CurrentScreen />
      </div>
      <Toast />
      <Announcer />
      <DemoControls open={demo !== null} initialTab={demo ?? 'controls'} onClose={() => setDemo(null)} />
      <LoadError />
    </div>
  );
}

export function App(props: { opponentDelayMs?: number; tickMs?: number }) {
  const store = useBadlaStore(props);
  return (
    <BadlaContext.Provider value={store}>
      <Shell />
    </BadlaContext.Provider>
  );
}
