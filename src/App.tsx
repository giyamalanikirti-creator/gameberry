import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAutoPlay } from './demo/autoplay';
import { DemoDrawer } from './demo/DemoDrawer';
import { StoryPanel } from './demo/StoryPanel';
import { formatClock, formatTime } from './domain/time';
import type { PlayerId, Route } from './domain/types';
import { BadlaHub } from './screens/BadlaHub';
import { Booked } from './screens/Booked';
import { BookingScreen } from './screens/Booking';
import { Challenge } from './screens/Challenge';
import { Club, FixtureScreen, Inbox } from './screens/Club';
import { hashToRoute, routeToHash } from './screens/common';
import { Home } from './screens/Home';
import { InviteScreen } from './screens/Invite';
import { Opening } from './screens/Opening';
import { PublicMatch } from './screens/PublicMatch';
import { Receipt } from './screens/Receipt';
import { RoundScreen } from './screens/Round';
import { Profile, SeriesEnd } from './screens/SeriesEnd';
import { AccountPane } from './session/AccountPane';
import { SessionProvider } from './session/SessionProvider';
import { balance, pendingActions } from './state/selectors';
import { StoreProvider, useStore } from './state/store';
import { Avatar, Gold } from './ui/kit';
import { LockScreen } from './ui/LockScreen';
import { PaneRequest, Shell, ShellCtx } from './ui/shell';
import { Welcome } from './ui/Welcome';

function TopBar({ onAccount }: { onAccount: () => void }) {
  const { state, me, now, clockOffset } = useStore();
  const diverged = Math.abs(clockOffset) > 60_000;
  const count = me ? pendingActions(state, me, now).length : 0;
  return (
    <header className="topbar">
      <div className="tb-left">
        <span className="wordmark">Badla</span>
        <span className="tb-label">Prototype · simulated time {formatClock(now, 'Asia/Kolkata')} · not affiliated with Gameberry</span>
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
        ) : <span className="tb-name">Signed out</span>}
        <span className="chev" aria-hidden="true">▾</span>
      </button>
    </header>
  );
}

function StatusBar() {
  const { now, me, state } = useStore();
  const tz = me ? state.players[me].timezone : 'Asia/Kolkata';
  return (
    <div className="statusbar" aria-hidden="true">
      <span className="num">{formatTime(now, tz)}</span>
      <span>●●●● LTE ▮</span>
    </div>
  );
}

function PhoneScreen() {
  const { me, route } = useStore();
  if (!me) {
    return (
      <div className="screen signed-out">
        <h1 className="title">Signed out</h1>
        <p className="muted">Pick a player in the account pane at the top right. Each of the five players has their own sign-in, inbox and seat.</p>
      </div>
    );
  }
  switch (route.name) {
    case 'public': return <PublicMatch />;
    case 'opening': return <Opening />;
    case 'challenge': return <Challenge key={`${route.seriesId}${route.timing}`} />;
    case 'invite': return <InviteScreen id={route.id} key={route.id} />;
    case 'round': return <RoundScreen id={route.id} key={route.id} />;
    case 'booked': return <Booked roundId={route.roundId} key={route.roundId} />;
    case 'receipt': return <Receipt roundId={route.roundId} key={route.roundId} />;
    case 'booking': return <BookingScreen id={route.id} key={route.id} />;
    case 'badla': return <BadlaHub />;
    case 'club': return <Club />;
    case 'fixture': return <FixtureScreen id={route.id} key={route.id} />;
    case 'inbox': return <Inbox />;
    case 'seriesEnd': return <SeriesEnd seriesId={route.seriesId} key={route.seriesId} />;
    case 'profile': return <Profile />;
    default: return <Home />;
  }
}

function BottomNav() {
  const { state, me, route, go, now } = useStore();
  if (!me) return null;
  const unread = state.notifications.filter((n) => n.to === me && !n.readAt && (n.deferredTo === null || n.deferredTo <= now)).length;
  const tab = (name: 'home' | 'badla' | 'club' | 'inbox', label: string, extra?: number) => (
    <button type="button" aria-current={route.name === name ? 'page' : undefined} onClick={() => go({ name })}>
      {label}{extra ? <span className="nav-badge">{extra}</span> : null}
    </button>
  );
  return (
    <nav className="bottom-nav" aria-label="App">
      {tab('home', 'Home')}
      {tab('badla', 'Badla')}
      {tab('club', 'Club')}
      {tab('inbox', 'Inbox', unread)}
    </nav>
  );
}

/** In-app banner for the signed-in player ("Riya wants Badla"). */
function Banner({ dismissed, dismiss }: { dismissed: Set<string>; dismiss: (id: string) => void }) {
  const { state, me, now, go, dispatch } = useStore();
  if (!me) return null;
  // Only alerts that can still be acted on: a closed table or answered invite never re-surfaces.
  const live = (r: Route) =>
    r.name === 'invite' ? state.invites[r.id]?.status === 'open'
      : r.name === 'round' ? ['checkin', 'filling', 'proposed'].includes(state.rounds[r.id]?.status ?? '')
        : r.name === 'booking' ? ['offered', 'chosen'].includes(state.bookings[r.id]?.status ?? '')
          : r.name === 'fixture' ? state.fixtures[r.id]?.status === 'listed' : false;
  const n = state.notifications.filter((x) => x.to === me && !x.readAt && !dismissed.has(x.id) && (x.deferredTo === null || x.deferredTo <= now) && live(x.route)).pop();
  if (!n) return null;
  return (
    <div className="banner" role="status">
      <button type="button" className="banner-body" onClick={() => { dispatch({ type: 'READ_NOTIFICATION', id: n.id }); dismiss(n.id); go(n.route); }}>
        <strong>{n.title}</strong>{n.body && <span>{n.body}</span>}
      </button>
      <button type="button" className="x" aria-label="Dismiss" onClick={() => dismiss(n.id)}>✕</button>
    </div>
  );
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

function ShellView() {
  const store = useStore();
  const { state, me, ui, setUi, restart, notice, dismissNotice, setClockOffset, clockOffset, now, demo } = store;
  const [pane, setPane] = useState<{ open: boolean } & PaneRequest>({ open: false });
  const [lockFor, setLockFor] = useState<PlayerId | null>(null);
  const [handoffTo, setHandoffTo] = useState<PlayerId | null>(null);
  const [timeCard, setTimeCard] = useState<string | null>(null);
  const [highlight, setHighlight] = useState<string | null>(null);
  const [flashes, setFlashes] = useState<Array<{ id: number; text: string; to?: PlayerId }>>([]);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const seen = useRef<Set<string> | null>(null);
  useAutoPlay();
  useHashRouting();

  const flash = useCallback((text: string, to?: PlayerId) => {
    const id = Date.now() + Math.random();
    setFlashes((f) => [...f.slice(-1), { id, text, to }]);
    setTimeout(() => setFlashes((f) => f.filter((x) => x.id !== id)), 4000);
  }, []);

  const openPane = useCallback((req: PaneRequest = {}) => setPane({ open: true, ...req }), []);
  const handoff = useCallback((p: PlayerId, afterRoute: Route | null = null) => {
    setLockFor(null);
    setHandoffTo(p);
    setTimeout(() => { setHandoffTo(null); setPane({ open: true, signInAs: p, highlight: p, afterRoute }); }, 600);
  }, []);
  const shell: Shell = useMemo(() => ({ openPane, showLock: setLockFor, handoff, highlight, setHighlight, flash }), [openPane, handoff, highlight, flash]);

  // Toasts for alerts that land on someone else's (locked) phone: tap to see that phone.
  useEffect(() => {
    if (!seen.current) { seen.current = new Set(state.notifications.map((n) => n.id)); return; }
    const fresh = state.notifications.filter((n) => !seen.current!.has(n.id));
    fresh.forEach((n) => seen.current!.add(n.id));
    for (const n of fresh) if (n.to !== me && n.deferredTo === null) flash(`For ${state.players[n.to].name} · ${n.title}`, n.to);
  }, [state.notifications, state.players, me, flash]);

  const timeJump = (label: string, to: number) => {
    setTimeCard(label);
    setTimeout(() => {
      setClockOffset(clockOffset + (to - now));
      demo({ type: 'DEMO_NOTE', name: 'story_time_jump', detail: { to: label } });
      setTimeCard(null);
    }, 650);
  };

  return (
    <ShellCtx.Provider value={shell}>
      <div className="shell">
        <a className="skip" href="#phone">Skip to content</a>
        <TopBar onAccount={() => openPane()} />
        {notice && <div className="notice" role="status">{notice} <button type="button" onClick={dismissNotice}>OK</button></div>}
        <main className="stagearea">
          <div className="phone" id="phone" aria-label="Phone">
            <StatusBar />
            <Banner dismissed={dismissed} dismiss={(id) => setDismissed((s) => new Set(s).add(id))} />
            <div className="phone-body" key={`${me}`}>
              <PhoneScreen />
            </div>
            <BottomNav />
            {lockFor && (
              <LockScreen
                player={lockFor}
                onClose={() => setLockFor(null)}
                onUnlock={(r) => { setLockFor(null); setPane({ open: true, signInAs: lockFor, highlight: lockFor, afterRoute: r }); }}
              />
            )}
            {handoffTo && (
              <div className="handoff" role="status"><Avatar state={state} id={handoffTo} size={56} /><p>Now on {state.players[handoffTo].name}'s phone</p></div>
            )}
            {timeCard && <div className="handoff time-card" role="status"><span className="clock-anim" aria-hidden="true">🕘</span><p>{timeCard}</p></div>}
          </div>
          <StoryPanel onTimeJump={timeJump} />
        </main>
        <div className="toasts" aria-live="polite" hidden={!!lockFor}>
          {flashes.map((t) => (
            <div key={t.id} className="toast">
              {t.to ? (
                <button type="button" className="toast-body" onClick={() => { setLockFor(t.to!); setFlashes((f) => f.filter((x) => x.id !== t.id)); }}>{t.text}</button>
              ) : <span className="toast-body">{t.text}</span>}
            </div>
          ))}
        </div>
        <DemoDrawer />
        <AccountPane
          open={pane.open}
          highlight={pane.highlight ?? null}
          startWith={pane.signInAs ?? null}
          afterRoute={pane.afterRoute ?? null}
          onClose={() => setPane({ open: false })}
        />
        {!ui.welcomeSeen && (
          <Welcome
            onGuided={() => { restart({ mode: 'guided' }); handoff('riya', { name: 'home' }); }}
            onFree={() => { setUi({ welcomeSeen: true, mode: 'free' }); openPane(); }}
          />
        )}
      </div>
    </ShellCtx.Provider>
  );
}

export function App({ tickMs }: { tickMs?: number }) {
  return (
    <StoreProvider tickMs={tickMs}>
      <SessionProvider>
        <ShellView />
      </SessionProvider>
    </StoreProvider>
  );
}
