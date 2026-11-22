import { useCallback, useEffect, useRef, useState } from 'react';
import { formatDateTime } from '../domain/time';
import { DemoControls } from './DemoControls';
import { balance, currentRound, lastResult, PLAYERS, seatFor, type PlayerId } from './model';
import { reconcile, reduce, type Command } from './reducer';
import { RoundScreen } from './RoundScreen';
import { ClubScreen, Fixture, Lobby, Notice, Opening, Proposal, type ScreenProps } from './screens';
import { freshSession, parseRoute, readSession, writeSession, type Session } from './storage';
import { PlayerChip, TIME_ZONE } from './widgets';
import './badla.css';

function chooseRoute(session: Session, viewer: PlayerId, handoff: boolean) {
  const live = currentRound(session.state);
  if (handoff && live && seatFor(live, viewer)) return `round/${live.id}`;
  if (session.route.startsWith('round/')) {
    const current = session.state.rounds.find(round => round.id === session.route.split('/')[1]);
    if (current && seatFor(current, viewer)) return session.route;
  }
  if (handoff) {
    const round = lastResult(session.state);
    if (round && seatFor(round, viewer)) return `round/${round.id}`;
  }
  if (viewer === 'dev' || viewer === 'meera') return 'club';
  return session.route === 'opening' || session.route.startsWith('fixture/') ? session.route : 'lobby';
}

export function SeriesApp() {
  const [initial] = useState(() => {
    const saved = readSession();
    return { ...saved, session: { ...saved.session, route: parseRoute(location.hash) ?? saved.session.route } };
  });
  const [session, setSession] = useState(initial.session);
  const [invalid, setInvalid] = useState(initial.invalid);
  const [drawer, setDrawer] = useState(false);
  const [real, setReal] = useState(Date.now);
  const [systemReduced, setSystemReduced] = useState(() => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false);
  const current = useRef(session);
  const main = useRef<HTMLElement>(null);
  const routeBefore = useRef(session.route);
  const initialLinkOpened = useRef(false);

  const commit = useCallback((next: Session) => {
    if (next === current.current) return;
    current.current = next;
    setSession(next);
    if (!invalid) writeSession(next);
  }, [invalid]);

  const send = useCallback((command: Command) => {
    const snapshot = current.current;
    const time = Date.now();
    const state = reduce(snapshot.state, { ...command, actor: snapshot.viewer, at: time + snapshot.offset });
    if (state !== snapshot.state) commit({ ...snapshot, state });
    setReal(time);
    return state;
  }, [commit]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      const snapshot = current.current;
      const time = Date.now();
      const state = reconcile(snapshot.state, time + snapshot.offset);
      if (state !== snapshot.state) commit({ ...snapshot, state });
      setReal(time);
    }, 500);
    return () => window.clearInterval(timer);
  }, [commit]);

  const navigate = useCallback((route: string, fromHistory = false) => {
    const snapshot = current.current;
    const time = Date.now();
    const state = route.startsWith('fixture/')
      ? reduce(snapshot.state, { type: 'openFixture', actor: snapshot.viewer, at: time + snapshot.offset, fixtureId: route.split('/')[1] })
      : reconcile(snapshot.state, time + snapshot.offset);
    if (!fromHistory && snapshot.route !== route) history.pushState(null, '', `#${route}`);
    if (snapshot.route !== route || snapshot.state !== state) commit({ ...snapshot, route, state });
    setReal(time);
  }, [commit]);

  useEffect(() => {
    if (!initialLinkOpened.current) {
      initialLinkOpened.current = true;
      const route = parseRoute(location.hash);
      if (route?.startsWith('fixture/')) navigate(route, true);
    }
    const onHash = () => navigate(parseRoute(location.hash) ?? 'opening', true);
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, [navigate]);

  useEffect(() => {
    const query = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    const update = () => setSystemReduced(query?.matches ?? false);
    query?.addEventListener('change', update);
    return () => query?.removeEventListener('change', update);
  }, []);

  useEffect(() => {
    if (routeBefore.current !== session.route) main.current?.focus();
    routeBefore.current = session.route;
  }, [session.route]);

  const switchViewer = (viewer: PlayerId, handoff: boolean) => {
    const snapshot = current.current;
    const route = chooseRoute(snapshot, viewer, handoff);
    if (route !== snapshot.route) history.pushState(null, '', `#${route}`);
    commit({ ...snapshot, viewer, route });
  };

  const advance = (milliseconds: number) => {
    const snapshot = current.current;
    const time = Date.now();
    const offset = snapshot.offset + Math.max(milliseconds, 0);
    const state = reconcile(snapshot.state, time + offset);
    commit({ ...snapshot, state, offset });
    setReal(time);
  };

  const reset = () => {
    const time = Date.now();
    const next = freshSession(time);
    commit(next);
    writeSession(next);
    setReal(time);
    setInvalid(false);
    setDrawer(false);
    history.replaceState(null, '', location.pathname + location.search);
  };

  const { state, viewer, route } = session;
  const now = real + session.offset;
  const unread = state.invites.filter(invite => invite.to === viewer && !invite.read).length;
  const go = (target: string) => navigate(target);
  const props: ScreenProps = {
    state, viewer, now, go, send, handoff: player => switchViewer(player, true),
    reduced: session.motion === 'reduced' || systemReduced,
  };
  const [screen, ...segments] = route.split('/');
  const id = segments.join('/');
  const currentScreen = () => {
    switch (screen) {
      case 'round': return <RoundScreen key={id} id={id} props={props} />;
      case 'challenge': return <Proposal key={screen} props={props} decider={false} grudge={false} />;
      case 'decider': return <Proposal key={screen} props={props} decider grudge={false} />;
      case 'grudge': return <Proposal key={screen} props={props} decider grudge />;
      case 'lobby': return <Lobby {...props} />;
      case 'club': return <ClubScreen {...props} />;
      case 'fixture': return <Fixture props={props} id={id} />;
      case 'notice': return <Notice props={props} id={id} />;
      default: return <Opening {...props} />;
    }
  };

  return <div className={`bd-app${props.reduced ? ' bd-reduced' : ''}`}>
    <a className="skip" href="#badla-main" onClick={event => { event.preventDefault(); main.current?.focus(); }}>Skip to content</a>
    <header className="bd-top">
      <div className="bd-brand"><span aria-hidden="true">◆</span> Badla</div>
      <button className="bd-demo bd-small" onClick={() => setDrawer(true)}>Demo controls{unread > 0 && <span className="bd-unread">{unread}<span className="sr-only"> unread</span></span>}</button>
      <div className="bd-identity" aria-label={`Viewing as ${PLAYERS[viewer].name}`}>
        <PlayerChip player={viewer} />
        <strong><span aria-hidden="true">◉</span> {balance(state, viewer).toLocaleString('en-IN')} gold</strong>
      </div>
      <nav aria-label="Badla navigation">
        <button aria-current={screen === 'opening' ? 'page' : undefined} onClick={() => go('opening')}>Opening</button>
        <button aria-current={screen === 'lobby' ? 'page' : undefined} onClick={() => go('lobby')}>Lobby</button>
        <button aria-current={screen === 'club' || screen === 'fixture' ? 'page' : undefined} onClick={() => go('club')}>Club</button>
      </nav>
    </header>
    <main id="badla-main" className="bd-main" ref={main} tabIndex={-1}>
      {invalid && <section className="bd-panel" role="status"><p>The saved series couldn’t be restored.</p><button onClick={reset}>Reset saved demo</button></section>}
      {currentScreen()}
    </main>
    <footer className="bd-footer"><span>Playable concept</span><time dateTime={new Date(now).toISOString()}>{formatDateTime(now, TIME_ZONE)} IST</time></footer>
    {drawer && <DemoControls props={props} motion={session.motion}
      setMotion={motion => commit({ ...current.current, motion })} advance={advance} switchViewer={player => switchViewer(player, false)}
      onClose={() => setDrawer(false)} reset={reset} />}
  </div>;
}
