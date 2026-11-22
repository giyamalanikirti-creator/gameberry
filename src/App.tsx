import { useEffect, useRef, useState } from 'react';
import { AnalyticsPanel } from './analytics/Panel';
import { useAutoPlay } from './demo/autoplay';
import { DemoDrawer } from './demo/DemoDrawer';
import { formatClock } from './domain/time';
import type { PlayerId } from './domain/types';
import { BookingScreen } from './screens/Booking';
import { Challenge } from './screens/Challenge';
import { Club, FixtureScreen, Inbox } from './screens/Club';
import { hashToRoute, routeToHash } from './screens/common';
import { Home } from './screens/Home';
import { InviteScreen } from './screens/Invite';
import { Opening } from './screens/Opening';
import { Receipt } from './screens/Receipt';
import { RoundScreen } from './screens/Round';
import { AccountPane } from './session/AccountPane';
import { SessionProvider } from './session/SessionProvider';
import { balance, pendingActions } from './state/selectors';
import { StoreProvider, useStore } from './state/store';
import { Avatar, Gold } from './ui/kit';

function TopBar({ onAccount }: { onAccount: () => void }) {
  const { state, me, now, clockOffset } = useStore();
  const diverged = Math.abs(clockOffset) > 60_000;
  const count = me ? pendingActions(state, me, now).length : 0;
  return (
    <header className="topbar">
      <div className="tb-left">
        <span className="wordmark">Badla</span>
        <span className="tb-label">Concept prototype - not affiliated with Gameberry</span>
      </div>
      <div className="clock-chip num" title={diverged ? 'Simulated time (moved off real time)' : 'Real time'}>
        {diverged && <span className="amber-dot" aria-label="simulated time" />}
        {formatClock(now, 'Asia/Kolkata')}
      </div>
      <button type="button" className="acct-trigger" onClick={onAccount} aria-haspopup="dialog" aria-label={me ? `Account: ${state.players[me].name}, ${count} pending` : 'Accounts · signed out'}>
        {me ? (
          <>
            <Avatar state={state} id={me} size={30} badge={count || undefined} />
            <span className="tb-name">{state.players[me].name}</span>
            <Gold amount={balance(state, me)} />
          </>
        ) : (
          <span className="tb-name">Signed out</span>
        )}
        <span className="chev" aria-hidden="true">▾</span>
      </button>
    </header>
  );
}

function PhoneScreen() {
  const { me, route } = useStore();
  if (!me) {
    return (
      <div className="screen signed-out">
        <h1 className="title">Signed out</h1>
        <p className="muted">Pick a player in the account pane at the top right. Each of the five players has their own sign-in, inbox and seat.</p>
        <p className="fine">Start with Riya: she just lost the opening game.</p>
      </div>
    );
  }
  switch (route.name) {
    case 'opening': return <Opening />;
    case 'challenge': return <Challenge />;
    case 'invite': return <InviteScreen id={route.id} key={route.id} />;
    case 'round': return <RoundScreen id={route.id} key={route.id} />;
    case 'receipt': return <Receipt roundId={route.roundId} key={route.roundId} />;
    case 'booking': return <BookingScreen id={route.id} key={route.id} />;
    case 'club': return <Club />;
    case 'fixture': return <FixtureScreen id={route.id} key={route.id} />;
    case 'inbox': return <Inbox />;
    default: return <Home />;
  }
}

function BottomNav() {
  const { state, me, route, go } = useStore();
  if (!me) return null;
  const unread = state.notifications.filter((n) => n.to === me && !n.readAt).length;
  const tab = (name: 'home' | 'club' | 'inbox', label: string, extra?: number) => (
    <button type="button" aria-current={route.name === name ? 'page' : undefined} onClick={() => go({ name })}>
      {label}{extra ? <span className="nav-badge">{extra}</span> : null}
    </button>
  );
  return (
    <nav className="bottom-nav" aria-label="App">
      {tab('home', 'Home')}
      {tab('club', 'Club')}
      {tab('inbox', 'Inbox', unread)}
    </nav>
  );
}

/** Toasts for notifications that land on someone who is not signed in. A signpost, not an action. */
function useToasts() {
  const { state, me } = useStore();
  const seen = useRef<Set<string> | null>(null);
  const [toasts, setToasts] = useState<Array<{ id: string; to: PlayerId; text: string }>>([]);
  useEffect(() => {
    if (!seen.current) { seen.current = new Set(state.notifications.map((n) => n.id)); return; }
    const fresh = state.notifications.filter((n) => !seen.current!.has(n.id));
    fresh.forEach((n) => seen.current!.add(n.id));
    const others = fresh.filter((n) => n.to !== me).map((n) => ({ id: n.id, to: n.to, text: `For ${state.players[n.to].name} · ${n.title}` }));
    if (others.length) setToasts((t) => [...t, ...others].slice(-1));
  }, [state.notifications, state.players, me]);
  useEffect(() => {
    if (!toasts.length) return;
    const t = setTimeout(() => setToasts((x) => x.slice(1)), 4500);
    return () => clearTimeout(t);
  }, [toasts]);
  return [toasts.filter((t) => t.to !== me), (id: string) => setToasts((t) => t.filter((x) => x.id !== id))] as const;
}

function useHashRouting() {
  const { me, route, go } = useStore();
  const pending = useRef<string | null>(typeof window !== 'undefined' ? window.location.hash : null);
  useEffect(() => {
    const onHash = () => { const r = hashToRoute(window.location.hash); if (r) go(r); };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, [go]);
  useEffect(() => {
    if (!me) return;
    if (pending.current) {
      const r = hashToRoute(pending.current);
      pending.current = null;
      if (r && r.name !== 'home') { go(r); return; }
    }
    const h = routeToHash(route);
    if (window.location.hash !== h) window.history.replaceState(null, '', h);
  }, [me, route, go]);
}

function Shell() {
  const [pane, setPane] = useState<{ open: boolean; highlight: PlayerId | null }>({ open: false, highlight: null });
  const { notice, dismissNotice, state, me, route } = useStore();
  const [toasts, dropToast] = useToasts();
  useAutoPlay();
  useHashRouting();
  const live = Object.values(state.rounds).find((r) => r.status === 'active' && r.game);
  const turnName = live?.game ? state.players[live.game.seats[live.game.turn].playerId as PlayerId].name : null;

  return (
    <div className="shell">
      <TopBar onAccount={() => setPane({ open: true, highlight: null })} />
      {notice && (
        <div className="notice" role="status">{notice} <button type="button" onClick={dismissNotice}>OK</button></div>
      )}
      <main className="stagearea">
        <div className="phone" aria-label="Phone">
          <div className="phone-body" key={`${me}:${route.name}`}>
            <PhoneScreen />
          </div>
          <BottomNav />
        </div>
        <AnalyticsPanel />
      </main>
      <div className="toasts" aria-live="polite">
        {toasts.map((t) => (
          <div key={t.id} className="toast">
            <button type="button" className="toast-body" onClick={() => { setPane({ open: true, highlight: t.to }); dropToast(t.id); }}>{t.text}</button>
            <button type="button" className="x" aria-label="Dismiss" onClick={() => dropToast(t.id)}>✕</button>
          </div>
        ))}
      </div>
      <p className="sr-only" aria-live="polite">{turnName ? `${turnName}'s turn` : ''}</p>
      <DemoDrawer />
      <AccountPane open={pane.open} highlight={pane.highlight} onClose={() => setPane({ open: false, highlight: null })} />
    </div>
  );
}

export function App({ tickMs }: { tickMs?: number }) {
  return (
    <StoreProvider tickMs={tickMs}>
      <SessionProvider>
        <Shell />
      </SessionProvider>
    </StoreProvider>
  );
}
