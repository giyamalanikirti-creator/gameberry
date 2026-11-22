import { useCallback, useEffect, useRef, useState } from 'react';
import { botMove } from './ludo';
import {
  counterpart, debtGroups, inWindow, linked, nameOf, PEOPLE, timeLabel,
  type Kaat, type Person, type Push, type RivalryState, type Viewer,
} from './model';
import { Controls, Metrics, type PanelProps } from './Panel';
import { activeMatch, reduce, type Action } from './reducer';
import { Avatar, Invitation, KaatReplay, Ledger, Lobby, Modal, Profile, Result, Rivals, Table, type ScreenProps } from './Screens';
import { initialSession, loadSession, saveSession, type Route } from './storage';
import './rivalry.css';

function pushName(state: RivalryState, push: Push) {
  const pair = state.cards.find(card => card.id === push.cardId)?.pair;
  if (push.kind === 'ready' && push.sender) return `${nameOf(push.sender)} is ready`;
  return pair ? `Your Badla with ${nameOf(counterpart(pair, push.actor))} is open` : 'Your Badla window is open';
}

export function RivalryApp() {
  const [session, setSession] = useState(loadSession);
  const current = useRef(session);
  const [drawer, setDrawer] = useState(false);
  const [profile, setProfile] = useState(false);
  const [kaat, setKaat] = useState<Kaat | null>(null);
  const [lock, setLock] = useState<string | null>(null);
  const [hiddenBanner, setHiddenBanner] = useState<string | null>(null);
  const [systemMotion, setSystemMotion] = useState(() => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false);
  const main = useRef<HTMLElement>(null);
  const audio = useRef<AudioContext | null>(null);

  const commit = useCallback((next: typeof session) => {
    current.current = next;
    setSession(next);
    saveSession(next);
  }, []);
  const send = useCallback((action: Action) => {
    const snapshot = current.current;
    const next = reduce(snapshot.state, action);
    if (next !== snapshot.state) commit({ ...snapshot, state: next });
    return next;
  }, [commit]);

  const go = useCallback((route: Route, viewer?: Viewer, record = true) => {
    const snapshot = current.current;
    const actor = viewer ?? snapshot.viewer;
    const screen = route.name;
    const state = record && (screen === 'lobby' || screen === 'result' || screen === 'ledger' || screen === 'invite')
      ? reduce(snapshot.state, { type: 'view', actor, screen, id: route.id })
      : snapshot.state;
    commit({ ...snapshot, state, route, viewer: actor });
    requestAnimationFrame(() => main.current?.focus());
  }, [commit]);

  const tone = (pitch: number) => {
    if (!current.current.state.sound || typeof AudioContext === 'undefined') return;
    try {
      const context = audio.current ??= new AudioContext();
      if (context.state === 'suspended') void context.resume().catch(() => undefined);
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.frequency.value = pitch;
      oscillator.connect(gain);
      gain.connect(context.destination);
      gain.gain.setValueAtTime(.045, context.currentTime);
      gain.gain.exponentialRampToValueAtTime(.001, context.currentTime + .13);
      oscillator.start();
      oscillator.stop(context.currentTime + .14);
    } catch { /* A preview can disable web audio. */ }
  };

  const replay = (capture: Kaat) => {
    send({ type: 'view', actor: current.current.viewer, screen: 'kaat', id: capture.replay.id });
    setKaat(capture);
    tone(135);
  };

  const { state, viewer, route } = session;
  const reduced = systemMotion || session.reduced;
  const active = activeMatch(state);
  const onTurn = active?.pair[active.board.turn === 'red' ? 0 : 1];
  const automated = !!onTurn && onTurn !== viewer && (onTurn === 'ananya' || onTurn === 'shruti' || (viewer === 'riya' && state.autoGunjan && onTurn === 'gunjan'));
  const banner = [...state.pushes].reverse().find(push => push.actor === viewer && !push.read && push.id !== hiddenBanner &&
    state.cards.some(card => card.id === push.cardId && card.status === 'open' && linked(state, ...card.pair)));
  const lockPush = state.pushes.find(push => push.id === lock && push.actor === viewer);

  useEffect(() => {
    const query = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    const onChange = () => setSystemMotion(query?.matches ?? false);
    query?.addEventListener('change', onChange);
    return () => query?.removeEventListener('change', onChange);
  }, []);
  useEffect(() => {
    if (current.current.state.events.length === 0 && current.current.route.name === 'lobby') send({ type: 'view', actor: current.current.viewer, screen: 'lobby' });
  }, [send]);

  useEffect(() => {
    if (!banner) return;
    const timer = setTimeout(() => setHiddenBanner(banner.id), 4000);
    return () => clearTimeout(timer);
  }, [banner?.id]);

  useEffect(() => {
    if (!automated || !onTurn || !active || route.name !== 'table' || kaat || drawer) return;
    const { board, id } = active;
    const timer = setTimeout(() => {
      const token = botMove(board);
      send({ actor: onTurn, type: token === undefined ? 'roll' : 'move', token, matchId: id, rolls: board.rolls });
    }, reduced ? 250 : board.die === null ? 850 : 730);
    return () => clearTimeout(timer);
  }, [automated, onTurn, active?.id, active?.board.rolls, active?.board.die, route.name, kaat, drawer, reduced, send]);

  useEffect(() => {
    const pending = state.cards.find(card => card.pair.includes(viewer) && linked(state, ...card.pair) &&
      (card.status === 'asked' && card.from === viewer || card.status === 'open' && card.ready.includes(viewer) && card.ready.length === 1) &&
      (['ananya', 'shruti'].includes(counterpart(card.pair, viewer)) || (viewer === 'riya' && state.autoGunjan && counterpart(card.pair, viewer) === 'gunjan')));
    if (!pending) return;
    const actor = counterpart(pending.pair, viewer);
    const timer = setTimeout(() => {
      if (pending.status === 'asked') send({ type: 'respond', actor, id: pending.id, response: 'tomorrow' });
      else send({ type: 'ready', actor, id: pending.id });
    }, 2300);
    return () => clearTimeout(timer);
  }, [state.cards, state.autoGunjan, viewer, send]);

  const setViewer = (actor: Viewer) => {
    setDrawer(false);
    setProfile(false);
    setKaat(null);
    setLock(null);
    setHiddenBanner(null);
    if (actor === viewer) return;
    const incoming = [...state.cards].reverse().find(card => card.pair.includes(actor) && linked(state, ...card.pair) &&
      (card.status === 'asked' && card.from !== actor || card.status === 'proposed' && !card.confirmed.includes(actor)));
    const table = active?.pair.includes(actor) ? active : undefined;
    const appointment = route.name === 'invite' && state.cards.find(card => card.id === route.id && card.pair.includes(actor) && linked(state, ...card.pair));
    const result = (route.name === 'result' || route.name === 'table') && state.matches.find(match => match.id === route.id && match.pair.includes(actor) && match.endedAt);
    if (incoming) go({ name: 'invite', id: incoming.id }, actor);
    else if (table) go({ name: 'table', id: table.id }, actor);
    else if (result) go({ name: 'result', id: result.id }, actor);
    else if (appointment) go({ name: 'invite', id: appointment.id }, actor, false);
    else go({ name: 'lobby' }, actor);
  };

  const advance = (to: number) => {
    const before = current.current.state;
    const next = send({ type: 'clock', actor: viewer, to });
    const push = next.pushes.find(item => item.actor === viewer && item.kind === 'window' && !before.pushes.some(previous => previous.id === item.id));
    setDrawer(false);
    if (push) { setHiddenBanner(null); setLock(push.id); }
  };

  const openPush = (push: Push) => {
    const next = send({ type: 'openPush', actor: viewer, id: push.id });
    const card = next.cards.find(item => item.id === push.cardId && item.pair.includes(viewer) && linked(next, ...item.pair));
    setLock(null);
    setHiddenBanner(push.id);
    if (card && card.status === 'open' && inWindow(next, card)) go({ name: 'invite', id: card.id });
    else go({ name: 'inbox' });
  };

  const reset = () => {
    const fresh = initialSession();
    fresh.state = reduce(fresh.state, { type: 'view', actor: 'riya', screen: 'lobby' });
    commit(fresh);
    setDrawer(false);
    setLock(null);
    setKaat(null);
    setHiddenBanner(null);
  };

  const props: ScreenProps = { state, viewer, go, send, replay };
  const panels: PanelProps = { state, viewer, setViewer, advance, send, reduced, reset, setReduced: value => commit({ ...current.current, reduced: value }) };
  const content = () => {
    if (route.name === 'table' || route.name === 'result') {
      const table = state.matches.find(match => match.id === route.id && match.pair.includes(viewer));
      if (table?.cancelled) return <section className="rv-card"><h1>Table closed</h1><button onClick={() => go({ name: 'lobby' })}>Back to lobby</button></section>;
      if (table) return route.name === 'result' && table.endedAt
        ? <Result props={props} match={table} />
        : <Table key={`${table.id}/${viewer}`} props={props} match={table} reduced={reduced} tone={tone} playBot={automated} />;
    }
    if (route.name === 'invite') {
      const card = state.cards.find(item => item.id === route.id && item.pair.includes(viewer));
      if (card && linked(state, ...card.pair)) return <Invitation key={`${card.id}/${viewer}`} card={card} props={props} />;
      return <section className="rv-card"><h1>Badla unavailable</h1><button onClick={() => go({ name: 'lobby' })}>Back to lobby</button></section>;
    }
    if (route.name === 'rivals') return <Rivals {...props} />;
    if (route.name === 'ledger' && route.id && Object.hasOwn(PEOPLE, route.id) && route.id !== viewer)
      return <Ledger props={props} rival={route.id as Person} />;
    if (route.name === 'inbox') {
      const incoming = [...state.cards].reverse().filter(card => card.pair.includes(viewer) && card.status === 'asked' && card.from !== viewer && linked(state, ...card.pair));
      const pushes = [...state.pushes].reverse().filter(push => push.actor === viewer);
      return <section className="rv-stack"><h1>Inbox</h1>
        {!incoming.length && !pushes.length && <p>No local notifications for {nameOf(viewer)}.</p>}
        {incoming.map(card => <button key={card.id} onClick={() => go({ name: 'invite', id: card.id })}>{nameOf(card.from)} wants Badla</button>)}
        {pushes.map(push => {
          const card = state.cards.find(item => item.id === push.cardId);
          const available = card && card.status === 'open' && linked(state, ...card.pair);
          return <button key={push.id} disabled={!available} onClick={() => openPush(push)}>
            {available ? pushName(state, push) : 'Badla notification expired'}
          </button>;
        })}
      </section>;
    }
    return <Lobby {...props} profile={() => setProfile(true)} />;
  };

  const unread = state.cards.filter(card => card.pair.includes(viewer) && card.status === 'asked' && card.from !== viewer && linked(state, ...card.pair)).length +
    state.pushes.filter(push => push.actor === viewer && !push.read && state.cards.some(card => card.id === push.cardId && card.status === 'open')).length;
  return <div className={`rv-app${reduced ? ' rv-reduced' : ''}`}>
    <div className="rv-workbench">
      <section className="rv-phone" aria-label="Playable Badla prototype">
        <div className="rv-status"><time>{timeLabel(state.now, viewer)}</time><span aria-hidden="true" className="rv-notch" /><span>DEMO</span></div>
        <header className="rv-top">
          <button className="rv-wordmark rv-text" aria-label="Badla lobby" onClick={() => go({ name: 'lobby' })}><span aria-hidden="true" />Badla</button>
          <button className="rv-top-controls" aria-label={`Demo controls, viewing as ${nameOf(viewer)}`} onClick={() => setDrawer(true)}>
            <Avatar person={viewer} small /><span><strong>{nameOf(viewer)}</strong><small>Demo controls</small></span>
          </button>
        </header>
        {banner && !lock && <div className="rv-banner" role="status"><button onClick={() => openPush(banner)}>{pushName(state, banner)}</button>
          <button className="rv-text" aria-label="Dismiss notification" onClick={() => setHiddenBanner(banner.id)}>×</button></div>}
        <main tabIndex={-1} className="rv-screen" ref={main}>{content()}</main>
        <nav aria-label="Game navigation" className="rv-nav">
          {(['lobby', 'rivals', 'inbox'] as const).map(tab => <button key={tab} aria-current={route.name === tab || (tab === 'rivals' && route.name === 'ledger') ? 'page' : undefined}
            onClick={() => go({ name: tab })}>{tab[0].toUpperCase() + tab.slice(1)}{tab === 'inbox' && unread > 0 && <span className="rv-badge">{unread}</span>}
              {tab === 'rivals' && debtGroups(state, viewer).length > 0 && <span className="rv-dot"><span className="sr-only">Badla pending</span></span>}</button>)}
        </nav>
        <p className="rv-affiliation">Concept prototype · Not affiliated with Gameberry</p>
      </section>
      <aside className="rv-sidebar" aria-label="PM panel">
        <header><h2>PM panel</h2><p>See how a Badla appointment creates a return day.</p></header>
        <section className="rv-metric rv-desktop-controls"><h2>Demo controls</h2><Controls {...panels} /></section>
        <Metrics state={state} viewer={viewer} />
      </aside>
    </div>
    {drawer && <Modal title="Demo controls" onClose={() => setDrawer(false)}><Controls {...panels} /></Modal>}
    {profile && <Modal title="Player profile" onClose={() => setProfile(false)}><Profile state={state} viewer={viewer} /></Modal>}
    {kaat && <Modal title="Kaat replay" onClose={() => setKaat(null)}><KaatReplay key={kaat.replay.id} kaat={kaat} viewer={viewer} reduced={reduced} /></Modal>}
    {lockPush && <Modal title="Lock screen" onClose={() => setLock(null)}>
      <div className="rv-lock"><time>{timeLabel(state.now, viewer)}</time><p>Demo notification for {nameOf(viewer)}</p>
        <button className="rv-action" onClick={() => openPush(lockPush)}>{pushName(state, lockPush)}</button>
      </div>
    </Modal>}
  </div>;
}
