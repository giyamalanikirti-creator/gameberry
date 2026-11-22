import { useEffect, useRef, useState, type ReactNode } from 'react';
import { legalTokens, cloneTokens } from '../board/engine';
import { FINISH_INDEX, type Color } from '../board/geometry';
import { buildFrames } from '../board/replay';
import { Board } from '../ui/components/Board';
import { formatDuration, zonedParts, zonedTimeToUtc } from '../domain/time';
import {
  atLabel, counterpart, debtGroups, isPending, ledger, linked, nameOf, PEOPLE,
  rivalsOf, seriesFor, settingsFor, STICKERS, suggestedNow, windowLabel, WINDOW,
  type Card, type Kaat, type Match, type Person, type RivalryState, type Viewer,
} from './model';
import { activeMatch, canInvite, score, tied } from './reducer';
import type { Send } from './Panel';
import type { Route } from './storage';

export interface ScreenProps {
  state: RivalryState;
  viewer: Viewer;
  go: (route: Route) => void;
  send: Send;
  replay: (kaat: Kaat) => void;
}

export function Avatar({ person, small }: { person: Person; small?: boolean }) {
  return <span aria-hidden="true" className={`rv-avatar rv-${person}${small ? ' rv-avatar-mini' : ''}`}>{PEOPLE[person].initials}</span>;
}

export function Modal({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const current = dialog.current;
    current?.showModal();
    return () => current?.close();
  }, []);
  return <dialog className="rv-dialog" ref={dialog} aria-label={title}
    onCancel={e => { e.preventDefault(); onClose(); }} onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
    <div className="rv-dialog-inner">
      <header><h2>{title}</h2><button className="rv-text" aria-label={`Close ${title.toLowerCase()}`} onClick={onClose}>×</button></header>
      {children}
    </div>
  </dialog>;
}

export function Pairline({ pair, state }: { pair: Match['pair']; state: RivalryState }) {
  const relation = ledger(state, ...pair);
  return <div className="rv-versus">
    {pair.map((person, i) => <span key={person} className={i ? 'rv-team-b' : ''}><Avatar person={person} small />{nameOf(person)}</span>)}
    <b aria-hidden="true">VS</b>
    {['Rival', 'Nemesis'].includes(relation.level) && <small className="rv-pair-level">{relation.level}</small>}
  </div>;
}

function DebtList({ state, viewer, go, send, replay }: ScreenProps) {
  const debts = debtGroups(state, viewer);
  if (!debts.length) return null;
  return <section className="rv-stack">
    <h2>{debts.length} {debts.length === 1 ? 'Badla pending' : 'Badlas pending'}</h2>
    {debts.map(({ rival, debt, mutual }) => {
      const pending = state.cards.find(card => card.pair.includes(viewer) && card.pair.includes(rival) && isPending(card));
      const open = !pending && canInvite(state, [viewer, rival]) && state.matches.some(match => match.id === debt.matchId && match.endedAt);
      return <article className="rv-card rv-debt" key={rival}>
        <div className="rv-card-heading"><Avatar person={rival} small /><div><h3>{mutual ? 'Mutual Badla' : `Badla pending on ${nameOf(rival)}`}</h3>
          <p>{debt.kaat.spaces} squares lost · {formatDuration(debt.until - state.now)} left</p></div></div>
        <div className="rv-actions">
          <button className="rv-text" onClick={() => replay(debt.kaat)}>Replay Kaat</button>
          <button className="rv-action" disabled={!open && !pending} onClick={() => {
            if (pending) go({ name: 'invite', id: pending.id });
            else {
              const next = send({ type: 'ask', actor: viewer, debtId: debt.id });
              const card = next.cards.at(-1);
              if (card) go({ name: 'invite', id: card.id });
            }
          }}>{pending ? 'Open Badla' : 'Ask for Badla'}</button>
        </div>
      </article>;
    })}
  </section>;
}

export function Lobby(props: ScreenProps & { profile: () => void }) {
  const { state, viewer, go, send, profile } = props;
  const live = activeMatch(state);
  const seededRivals = rivalsOf(state, viewer).filter(rival => ledger(state, viewer, rival).settled > 0);
  const cards = [...state.cards].reverse().filter(card => card.pair.includes(viewer) && linked(state, ...card.pair) &&
    (isPending(card) || (card.status === 'passed' && card.from === viewer)))
    .filter((card, i, all) => all.findIndex(other => counterpart(other.pair, viewer) === counterpart(card.pair, viewer)) === i);
  return <div className="rv-stack">
    <button className="rv-account" onClick={profile}>
      <Avatar person={viewer} /><span><strong>{nameOf(viewer)}</strong><small>India · Player profile</small></span><span aria-hidden="true">›</span>
    </button>
    <section className="rv-lobby-hero">
      <div className="rv-dice-decoration" aria-hidden="true"><i /><i /><i /><i /><i /></div>
      <h1>Pick up the dice</h1>
      <p>Get all four tokens home before your opponent.</p>
      <button className="rv-primary" disabled={!!live && !live.pair.includes(viewer)} onClick={() => {
        const next = live ?? activeMatch(send({ type: 'play', actor: viewer }));
        if (next) go({ name: 'table', id: next.id });
      }}>{live ? 'Resume match' : 'Play 1v1'}</button>
      <small>{state.guided ? 'Demo scenario starts late in the match.' : 'Full match · All tokens start in the yard.'}</small>
    </section>
    {cards.length > 0 && <section className="rv-stack">
      <h2>Invitations & appointments</h2>
      {cards.map(card => <button className="rv-card rv-appointment-link" key={card.id} onClick={() => go({ name: 'invite', id: card.id })}>
        <span><strong>{card.kind === 'derby' ? 'Weekly Derby' : `Badla with ${nameOf(counterpart(card.pair, viewer))}`}</strong>
          <small>{card.status === 'open' ? 'Check-in is open' : card.status === 'missed' ? 'Appointment missed' : card.status === 'passed' ? 'They can’t play this time' :
            card.window ? `${windowLabel(card.window, viewer)} · ${formatDuration(card.window.start - state.now)} until start` : card.from === viewer ? 'Waiting for a reply' : 'Incoming invitation'}</small></span>
        <span aria-hidden="true">›</span>
      </button>)}
    </section>}
    {state.series.filter(series => series.pair.includes(viewer) && state.now < series.closes && tied(series) && linked(state, ...series.pair) &&
        !state.cards.some(card => card.seriesId === series.id && isPending(card)))
      .map(series => <article className="rv-card rv-debt" key={series.id}>
        <h2>1–1 with {nameOf(counterpart(series.pair, viewer))}</h2>
        <button className="rv-action" onClick={() => {
          const next = send({ type: 'decider', actor: viewer, seriesId: series.id });
          const card = next.cards.at(-1);
          if (card?.seriesId === series.id) go({ name: 'invite', id: card.id });
        }}>Play the decider?</button>
      </article>)}
    <DebtList {...props} />
    {!live && !cards.length && seededRivals.length > 0 && <section className="rv-stack">
      <h2>Your rivals</h2>
      {seededRivals.map(rival =>
        <button className="rv-card rv-appointment-link" key={rival} onClick={() => go({ name: 'ledger', id: rival })}>
          <Avatar person={rival} small /><span><strong>{nameOf(rival)}</strong><small>{ledger(state, viewer, rival).level}</small></span>
          <span aria-hidden="true">›</span>
        </button>)}
    </section>}
  </div>;
}

const dieDots: Record<number, number[]> = { 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] };
export function Die({ value = 5, tumbling = false }: { value?: number; tumbling?: boolean }) {
  return <span className={`rv-die${tumbling ? ' rv-tumbling' : ''}`} aria-hidden="true">
    {Array.from({ length: 9 }, (_, i) => <i key={i} className={dieDots[value].includes(i) ? 'rv-pip' : ''} />)}
  </span>;
}

export function Table({ match, props, reduced, tone, playBot }: {
  match: Match; props: ScreenProps; reduced: boolean; tone: (pitch: number) => void; playBot: boolean;
}) {
  const { state, viewer, go, send, replay } = props;
  const { board } = match;
  const [visual, setVisual] = useState(board.tokens);
  const [rolling, setRolling] = useState(false);
  const [animation, setAnimation] = useState(false);
  const [returning, setReturning] = useState<{ color: Color; tokenIndex: number }>();
  const moveBefore = useRef(board.moveAt);
  const captureBefore = useRef(match.kaats.at(-1)?.replay.id);
  const rollTimer = useRef<number>(0);
  const player = match.pair[board.turn === 'red' ? 0 : 1];
  const mine = player === viewer;
  const legal = board.die === null || !mine || animation ? [] : legalTokens(board.tokens, board.turn, board.die);
  const rival = counterpart(match.pair, viewer);
  const theme = settingsFor(state, viewer, rival).theme.includes(viewer);

  useEffect(() => () => clearTimeout(rollTimer.current), []);
  useEffect(() => {
    const move = board.lastMove;
    if (!move || moveBefore.current === board.moveAt) return;
    moveBefore.current = board.moveAt;
    if (reduced) { setVisual(board.tokens); setAnimation(false); return; }
    setAnimation(true);
    setVisual(move.before);
    const timeouts = move.path.map((position, i) => window.setTimeout(() => {
      const tokens = cloneTokens(move.before);
      tokens[move.color][move.tokenIndex] = position;
      setVisual(tokens);
    }, i * 120));
    const duration = move.path.length * 120 + (move.capture ? 430 : 140);
    if (move.capture) {
      const capture = move.capture;
      timeouts.push(window.setTimeout(() => { setReturning(capture); setVisual(move.after); }, move.path.length * 120));
    }
    timeouts.push(window.setTimeout(() => { setVisual(move.after); setReturning(undefined); setAnimation(false); }, duration));
    return () => timeouts.forEach(clearTimeout);
  }, [board.moveAt]);

  useEffect(() => {
    const kaat = match.kaats.at(-1);
    if (!kaat || captureBefore.current === kaat.replay.id || animation) return;
    captureBefore.current = kaat.replay.id;
    const delay = reduced ? 0 : kaat.replay.path.length * 120 + 460;
    const timeout = window.setTimeout(() => replay(kaat), delay);
    return () => clearTimeout(timeout);
  }, [match.kaats.at(-1)?.replay.id]);

  const roll = () => {
    if (!mine || rolling || animation || board.die !== null) return;
    setRolling(true);
    tone(270);
    rollTimer.current = window.setTimeout(() => {
      send({ type: 'roll', actor: viewer, matchId: match.id, rolls: board.rolls });
      setRolling(false);
    }, reduced ? 0 : 600);
  };
  const move = (token: number) => {
    tone(430);
    send({ type: 'move', actor: viewer, matchId: match.id, rolls: board.rolls, token });
  };
  const hint = board.message === 'third-six' ? 'Three sixes. Turn passes.' : board.message === 'no-move' ? 'No legal move. Turn passes.' :
    board.message === 'capture' ? 'Capture. Roll again.' : board.message === 'home' ? 'Token home. Roll again.' : null;
  return <section className={`rv-stack rv-match${theme ? ' rv-theme' : ''}`}>
    <header><p className="rv-eyebrow">{match.mode === 'public' ? '1v1 · Public table simulation' : 'Badla · Coin-free 1v1'}</p>
      <h1>{match.mode === 'public' ? '1v1 table' : 'Badla table'}</h1></header>
    <Pairline pair={match.pair} state={state} />
    <div className="rv-turn" aria-live="polite">
      <strong>{board.winner ? `${nameOf(match.pair[board.winner === 'red' ? 0 : 1])} wins` : mine ? 'Your turn' : `${nameOf(player)}’s turn`}</strong>
      <span>{rolling ? 'Rolling…' : board.die !== null ? `Rolled ${board.die}` : hint ?? (mine ? 'Tap to roll' : playBot ? 'Auto-play' : 'Switch views in Demo controls')}</span>
    </div>
    <Board tokens={visual} perspective={viewer === match.pair[0] ? 'red' : 'yellow'} label="1v1 Ludo board"
      names={{ red: nameOf(match.pair[0]), yellow: nameOf(match.pair[1]) }} animate={!reduced} returning={returning}
      movable={board.die !== null && legal.length ? { color: board.turn, tokens: legal, steps: board.die, onMove: move } : null} />
    {board.winner ? <button className="rv-primary" disabled={animation} onClick={() => go({ name: 'result', id: match.id })}>View result</button>
      : <div className="rv-table-actions">
        <button className="rv-primary rv-roll" disabled={!mine || rolling || animation || board.die !== null} onClick={roll}>
          <Die value={board.lastDie ?? 5} tumbling={rolling} />{rolling ? 'Rolling…' : 'Roll dice'}
        </button>
        {legal.length > 0 && <div className="rv-token-actions">{legal.map(token =>
          <button key={token} onClick={() => move(token)}>Move token {token + 1}</button>)}</div>}
      </div>}
    {match.kaats.length > 0 && !animation && <div className="rv-actions">
      <button onClick={() => replay(match.kaats.at(-1)!)}>Replay Kaat</button>
      {!match.endedAt && board.dice.kind === 'guided' && <button onClick={() => send({ type: 'finishDemo', actor: viewer })}>Finish remaining demo turns</button>}
    </div>}
    <p className="rv-caption">Roll a 6 to leave the yard. Star squares are safe. Finish on an exact roll. No blockades.</p>
  </section>;
}

export function KaatReplay({ kaat, viewer, reduced }: { kaat: Kaat; viewer: Person; reduced: boolean }) {
  const [index, setIndex] = useState(0);
  const frames = buildFrames(kaat.replay, {
    intro: 'The capture starts here.',
    step: (step, total) => `Step ${step} of ${total}`,
    impact: 'The token lands on an unprotected square.',
    outro: `${nameOf(kaat.victim)}’s token returns to the yard.`,
  });
  const i = reduced ? frames.length - 1 : index;
  useEffect(() => {
    if (reduced || index >= frames.length - 1) return;
    const timer = setTimeout(() => setIndex(index + 1), index === 0 ? 450 : 240);
    return () => clearTimeout(timer);
  }, [index, reduced, frames.length]);
  const frame = frames[i];
  const names = kaat.replay.color === 'red'
    ? { red: nameOf(kaat.attacker), yellow: nameOf(kaat.victim) } : { yellow: nameOf(kaat.attacker), red: nameOf(kaat.victim) };
  const progress = Math.round(kaat.spaces * Math.max(0, i - 1) / Math.max(1, frames.length - 2));
  return <div className={`rv-kaat${frame.impact ? ' rv-kaat-impact' : ''}`}>
    <h3>{kaat.victim === viewer ? `${nameOf(kaat.attacker)} sent you back ${kaat.spaces} squares` : `You sent ${nameOf(kaat.victim)} back ${kaat.spaces} squares`}</h3>
    <Board tokens={frame.tokens} names={names} focus={frame.focus} impact={frame.impact} compact animate={!reduced}
      returning={i === frames.length - 1 && !reduced ? kaat.replay.capture ?? undefined : undefined}
      perspective={names.red === nameOf(viewer) ? 'red' : 'yellow'} label="Kaat capture replay board" />
    <div className="rv-kaat-caption"><p aria-live="polite">{frame.caption}</p><strong aria-hidden="true">−{progress}</strong></div>
  </div>;
}

export function Result({ props, match }: { props: ScreenProps; match: Match }) {
  const { state, viewer, go, send, replay } = props;
  const winner = match.pair[match.board.winner === 'red' ? 0 : 1];
  const card = state.cards.find(card => card.id === match.cardId);
  const series = card && seriesFor(state, card);
  const debt = debtGroups(state, viewer).find(item => item.debt.matchId === match.id)?.debt;
  const replays = match.kaats.find(kaat => kaat.replay.id === debt?.kaat.replay.id) ?? match.kaats.at(-1);
  const existingDecider = series && [...state.cards].reverse().find(item => item.seriesId === series.id && item.kind === 'decider' && isPending(item));
  return <div className="rv-stack">
    <section className="rv-card rv-result">
      <p className="rv-eyebrow">{match.mode === 'badla' ? 'Badla result' : '1v1 result'}</p>
      <Avatar person={winner} />
      <h1>{viewer === winner ? 'You won!' : `${nameOf(winner)} wins`}</h1>
      <Pairline pair={match.pair} state={state} />
      {series && <strong className="rv-score">{nameOf(match.pair[0])} {score(series, match.pair[0])}–{score(series, match.pair[1])} {nameOf(match.pair[1])}</strong>}
      <p>{match.pair.map((person, i) => `${nameOf(person)}: ${match.board.tokens[i === 0 ? 'red' : 'yellow'].filter(p => p === FINISH_INDEX).length}/4 home`).join(' · ')}</p>
    </section>
    {debt && <article className="rv-card rv-debt">
      <h2>Settle it?</h2>
      <p>{nameOf(debt.rival)} sent you back {debt.kaat.spaces} squares.</p>
      <div className="rv-actions">
        <button className="rv-action" onClick={() => {
          const next = send({ type: 'ask', actor: viewer, debtId: debt.id });
          const invite = [...next.cards].reverse().find(item => item.debtId === debt.id && isPending(item));
          if (invite) go({ name: 'invite', id: invite.id });
        }}>Ask for Badla</button>
        <button onClick={() => go({ name: 'lobby' })}>Later</button>
      </div>
    </article>}
    {replays && <button onClick={() => replay(replays)}>Replay Kaat · {replays.spaces} squares</button>}
    {series && winner === viewer && <article className="rv-card">
      <h2>Leave a sticker</h2>
      {match.sticker ? <p className="rv-sticker">{match.sticker}</p> : <div className="rv-actions">{STICKERS.map(sticker =>
        <button key={sticker} onClick={() => send({ type: 'sticker', actor: viewer, matchId: match.id, sticker })}>{sticker}</button>)}</div>}
    </article>}
    {series && tied(series) && linked(state, ...series.pair) && state.now < series.closes && <article className="rv-card rv-debt">
      <h2>One each</h2>
      <button className="rv-action" onClick={() => {
        if (existingDecider) go({ name: 'invite', id: existingDecider.id });
        else {
          const next = send({ type: 'decider', actor: viewer, seriesId: series.id });
          const invite = next.cards.at(-1);
          if (invite?.kind === 'decider' && invite.seriesId === series.id) go({ name: 'invite', id: invite.id });
        }
      }}>{existingDecider ? 'View decider' : 'Play the decider?'}</button>
    </article>}
    <div className="rv-actions"><button onClick={() => go({ name: 'lobby' })}>Back to lobby</button>
      <button onClick={() => go({ name: 'ledger', id: counterpart(match.pair, viewer) })}>View rivalry ledger</button></div>
  </div>;
}

function inputTime(at: number, viewer: Person) {
  const p = zonedParts(at, PEOPLE[viewer].zone);
  const [month, day, hour, minute] = [p.month, p.day, p.hour, p.minute].map(value => String(value).padStart(2, '0'));
  return `${p.year}-${month}-${day}T${hour}:${minute}`;
}

export function Invitation({ card, props }: { card: Card; props: ScreenProps }) {
  const { state, viewer, send, go } = props;
  const series = seriesFor(state, card);
  const rival = counterpart(card.pair, viewer);
  const settings = settingsFor(state, ...card.pair);
  const [alternative, setAlternative] = useState(false);
  const [slot, setSlot] = useState(() => inputTime(Math.max(suggestedNow(state, series) + 30 * 60_000, state.now + 60_000), viewer));
  const [error, setError] = useState('');
  const nextTime = suggestedNow(state, series);
  const myReady = card.ready.includes(viewer);
  const change = (response: 'now' | 'tomorrow' | 'pass') => {
    const next = send({ type: 'respond', actor: viewer, id: card.id, response });
    const current = next.cards.find(item => item.id === card.id);
    if (current?.matchId) go({ name: 'table', id: current.matchId });
    else if (next === state) setError('That table or window is unavailable. Choose another option.');
  };
  return <div className="rv-stack">
    <article className="rv-card rv-debt">
      <p className="rv-eyebrow">{card.kind === 'derby' ? 'Weekly Derby' : card.kind === 'decider' ? 'Series decider' : 'Badla'}</p>
      <h1>{card.status === 'asked' && card.from !== viewer ? `${nameOf(rival)} wants Badla` : `Badla with ${nameOf(rival)}`}</h1>
      <Pairline pair={card.pair} state={state} />
      <strong className="rv-score">{nameOf(viewer)} {score(series, viewer)}–{score(series, rival)} {nameOf(rival)}</strong>
      {card.window && <p>{windowLabel(card.window, viewer)}</p>}
    </article>
    <article className="rv-card rv-stack">
      {card.status === 'asked' && (card.from === viewer
        ? <><h2>Invitation sent</h2><p>{nameOf(rival)} can play now, choose a time tomorrow or pass.</p></>
        : <><h2>Choose how to settle it</h2>
          <button className="rv-action" onClick={() => change('now')}>Play now</button>
          <button disabled={nextTime <= state.now} onClick={() => change('tomorrow')}>Kal Milte Hain · {windowLabel({ start: nextTime, end: nextTime + WINDOW }, viewer)}</button>
          <button className="rv-text" onClick={() => change('pass')}>Pass</button></>)}
      {card.status === 'passed' && <p>{card.from === viewer ? `${nameOf(rival)} can’t play this time.` : 'You passed on this invitation.'}</p>}
      {['proposed', 'confirmed'].includes(card.status) && <>
        <h2>{card.status === 'confirmed' ? 'Appointment booked' : 'Confirm the appointment'}</h2>
        <p>{card.status === 'confirmed' ? `Check-in opens in ${formatDuration(card.window!.start - state.now)}.` :
          `${nameOf(card.proposedBy!)} proposed this two-hour window.`}</p>
        {card.status === 'proposed' && (card.confirmed.includes(viewer) ? <p>Waiting for {nameOf(rival)} to confirm.</p> :
          <button className="rv-action" onClick={() => send({ type: 'confirm', actor: viewer, id: card.id, start: card.window!.start })}>Confirm appointment</button>)}
        {!card.changes.includes(viewer) && card.kind !== 'derby' && <button onClick={() => setAlternative(!alternative)}>Suggest another time</button>}
        {alternative && !card.changes.includes(viewer) && <form className="rv-stack" onSubmit={e => {
          e.preventDefault();
          const [year, month, day, hour, minute] = slot.split(/[-T:]/).map(Number);
          const start = zonedTimeToUtc(year, month, day, hour, minute, PEOPLE[viewer].zone);
          const next = send({ type: 'propose', actor: viewer, id: card.id, start });
          if (next === state) setError('Choose a future two-hour window before the series ends.');
          else { setError(''); setAlternative(false); }
        }}>
          <label>Start time (IST)<input type="datetime-local" value={slot} required onChange={e => setSlot(e.target.value)} /></label>
          <button type="submit">Send new time</button>
        </form>}
      </>}
      {card.status === 'open' && <>
        <h2>Check-in is open</h2><p>{card.ready.length}/2 ready · {formatDuration(card.window!.end - state.now)} left</p>
        {myReady && <p>{card.ready.length === 2 ? 'Both ready. Finish the other active table, then join.' : `Waiting for ${nameOf(rival)}.`}</p>}
        <button className="rv-action" disabled={myReady && card.ready.length < 2} onClick={() => {
          const next = send({ type: 'ready', actor: viewer, id: card.id });
          const current = next.cards.find(item => item.id === card.id);
          if (current?.matchId) go({ name: 'table', id: current.matchId });
          else if (next === state && !myReady) setError('This table is currently unavailable.');
        }}>{myReady ? card.ready.length === 2 ? 'Join table' : 'You’re ready' : 'I’m ready'}</button>
      </>}
      {card.status === 'missed' && <>
        <h2>Appointment missed</h2>
        {settings.cooldown > state.now ? <p>Private cooldown until {atLabel(settings.cooldown, viewer)} IST.</p> :
          settings.misses === 1 && nextTime > state.now ? <button onClick={() => {
            const next = send({ type: 'reschedule', actor: viewer, id: card.id });
            if (next !== state) go({ name: 'invite', id: next.cards.at(-1)!.id });
          }}>Reschedule once</button> : <p>The check-in window has ended.</p>}
      </>}
      {card.status === 'closed' && <p>This invitation is closed.</p>}
      {(card.status === 'playing' || card.status === 'settled') && <button className="rv-primary" onClick={() =>
        go({ name: card.status === 'playing' ? 'table' : 'result', id: card.matchId })}>{card.status === 'playing' ? 'Join table' : 'View result'}</button>}
      {error && <p role="alert">{error}</p>}
    </article>
    <button onClick={() => go({ name: 'lobby' })}>Back to lobby</button>
  </div>;
}

export function Rivals({ state, viewer, go }: ScreenProps) {
  return <div className="rv-stack">
    <h1>Rivals</h1><p className="rv-caption">Your private head-to-head records.</p>
    {rivalsOf(state, viewer).map(person => {
      const entry = ledger(state, viewer, person);
      return <button className="rv-card rv-appointment-link" key={person} onClick={() => go({ name: 'ledger', id: person })}>
        <Avatar person={person} /><span><strong>{nameOf(person)}</strong>
          <small>{entry.level}{entry.level === 'Rival' ? ` · ${entry.settled} of 7 to Nemesis` : ` · ${entry.settled} settled Badlas`}</small></span><span aria-hidden="true">›</span>
      </button>;
    })}
  </div>;
}

export function Ledger({ props, rival }: { props: ScreenProps; rival: Person }) {
  const { state, viewer, send, go, replay } = props;
  const entry = ledger(state, viewer, rival);
  const pair = settingsFor(state, viewer, rival);
  const available = linked(state, viewer, rival);
  const derbyActive = pair.derby.length === 2 && available;
  const derbyInvite = state.cards.find(card => card.kind === 'derby' && card.pair.includes(viewer) && card.pair.includes(rival) && isPending(card));
  const next = entry.settled < 1 ? 1 : entry.settled < 3 ? 3 : 7;
  return <div className="rv-stack">
    <section className="rv-card rv-ledger-hero">
      <p className="rv-eyebrow">Rivalry ledger</p><Avatar person={rival} /><h1>{nameOf(rival)}</h1>
      <p className={`rv-level rv-level-${entry.level.toLowerCase()}`}>{entry.level}</p>
      <p>{entry.settled} settled Badlas</p>
      {entry.level !== 'Nemesis' && <>
        <progress max={next} value={entry.settled} aria-label="Rivalry level progress" />
        <p className="rv-caption">{next - entry.settled} more to {next === 1 ? 'Acquaintance' : next === 3 ? 'Rival' : 'Nemesis'}</p>
      </>}
    </section>
    <section className="rv-card">
      <h2>Head-to-head</h2>
      <dl className="rv-stats">
        <div><dt>Matches</dt><dd>{entry.played}</dd></div>
        <div><dt>Wins / losses</dt><dd>{entry.wins} / {entry.losses}</dd></div>
        <div><dt>Captures given</dt><dd>{entry.given}</dd></div>
        <div><dt>Captures taken</dt><dd>{entry.taken}</dd></div>
      </dl>
      <p>{entry.streakBy && entry.count > 0 ? `${entry.streakBy === viewer ? 'You' : nameOf(entry.streakBy)} · ${entry.count} in a row` : 'No current streak'}</p>
      {entry.sticker && <p className="rv-sticker">{entry.sticker}</p>}
      {entry.lastKaat && <button onClick={() => replay(entry.lastKaat!)}>Replay last Kaat</button>}
    </section>
    {entry.level === 'Nemesis' && <section className="rv-card">
      <h2>Nemesis unlocks</h2>
      <button aria-pressed={pair.theme.includes(viewer)} onClick={() => send({ type: 'pairSetting', key: 'theme', actor: viewer, rival })}>Rivalry board theme</button>
      <p>Weekly Derby · Sunday 21:00–23:00 IST</p>
      <button disabled={!available} aria-pressed={pair.derby.includes(viewer)} onClick={() => send({ type: 'pairSetting', key: 'derby', actor: viewer, rival })}>
        {pair.derby.includes(viewer) ? 'Leave weekly Derby' : 'Join weekly Derby'}
      </button>
      {pair.derby.length === 1 && <p>Both rivals must opt in.</p>}
      {derbyActive && derbyInvite?.window && <button onClick={() => go({ name: 'invite', id: derbyInvite.id })}>
        Next Derby · {windowLabel(derbyInvite.window, viewer)}
      </button>}
    </section>}
    <section className="rv-card">
      <h2>Player settings</h2>
      {pair.cooldown > state.now && <p>Private cooldown until {atLabel(pair.cooldown, viewer)} IST.</p>}
      <div className="rv-actions">{(['muted', 'blocked'] as const).map(key => <button aria-pressed={pair[key].includes(viewer)} key={key}
        onClick={() => send({ type: 'pairSetting', key, actor: viewer, rival })}>{key === 'muted' ? 'Mute' : 'Block'} {nameOf(rival)}</button>)}</div>
    </section>
    <button onClick={() => go({ name: 'rivals' })}>Back to Rivals</button>
  </div>;
}

export function Profile({ state, viewer }: { state: RivalryState; viewer: Viewer }) {
  const entries = rivalsOf(state, viewer).map(person => ledger(state, viewer, person));
  const total = entries.reduce((counts, entry) => ({ played: counts.played + entry.played, wins: counts.wins + entry.wins,
    captures: counts.captures + entry.given, settled: counts.settled + entry.settled }), { played: 0, wins: 0, captures: 0, settled: 0 });
  return <div className="rv-stack rv-profile">
    <div className="rv-profile-name"><Avatar person={viewer} /><div><h3>{nameOf(viewer)}</h3><p>India · {PEOPLE[viewer].id}</p></div></div>
    <div className="rv-profile-die"><Die /><span>Classic die</span></div>
    <h3>Player stats</h3>
    <dl className="rv-stats">
      <div><dt>Matches won</dt><dd>{total.wins} of {total.played}</dd></div>
      <div><dt>Win rate</dt><dd>{total.played ? `${Math.round(total.wins / total.played * 100)}%` : '—'}</dd></div>
      <div><dt>Captures</dt><dd>{total.captures}</dd></div>
      <div><dt>Settled Badlas</dt><dd>{total.settled}</dd></div>
    </dl>
  </div>;
}
