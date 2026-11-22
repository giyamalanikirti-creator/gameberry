import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { buildFrames } from '../board/replay';
import { Board } from '../ui/components/Board';
import { DAY, HOUR, WINDOW_LENGTH, formatDay, tomorrowWindow } from '../domain/time';
import {
  CAPTAINS, clubPairs, currentRound, isBlocked, isCaptain, lastResult,
  OPENING_ID, PLAYERS, scores, seatFor, seriesStatus, teamName, type DemoState, type Format, type PlayerId, type Round,
} from './model';
import { canPredict, visibleFixture, type Action, type Command } from './reducer';
import { Bonus, GoldReceipt, PlayerChip, Score, Stakes, TIME_ZONE, windowLabel } from './widgets';

export interface ScreenProps {
  state: DemoState;
  viewer: PlayerId;
  now: number;
  go: (route: string) => void;
  send: (action: Command) => DemoState;
  handoff: (player: PlayerId) => void;
  reduced: boolean;
}

const replayCopy = {
  intro: 'Riya was one move from her protected home lane.',
  step: (n: number, total: number) => `Gunjan rolls a 3 and moves ${n} of ${total} spaces.`,
  impact: 'Gunjan lands on Riya’s unprotected square.',
  outro: 'The capture sends Riya’s last token back to the yard.',
};

export function Opening({ state, viewer, reduced, go }: ScreenProps) {
  const replay = useMemo(() => buildFrames(state.opening.replay, replayCopy), [state.opening.replay]);
  const [frame, setFrame] = useState<number | null>(null);
  useEffect(() => {
    if (frame === null || frame >= replay.length - 1) return;
    const next = setTimeout(() => setFrame(frame + 1), replay[frame].durationMs);
    return () => clearTimeout(next);
  }, [frame, replay]);
  const current = replay[frame ?? 0];
  const round = currentRound(state);
  const open = seriesStatus(state) === 'open';
  return <>
    <section className="bd-hero">
      <p className="bd-kicker">Opening singles · First to two</p>
      <h1>Gunjan wins</h1>
      <Score state={state} opening />
      {isCaptain(viewer) && <div className="bd-opening-gold"><span>100 gold entry</span><strong>{viewer === 'gunjan' ? '+100' : '−100'} gold</strong></div>}
      {isCaptain(viewer) && open && !round &&
        <button className="bd-primary" onClick={() => go('challenge')}>{viewer === 'riya' ? 'Take Badla' : 'Go for 2–0'}</button>}
      {round && <button className="bd-primary" onClick={() => go(`round/${round.id}`)}>Open Badla table</button>}
      {!open && !round && <button className="bd-primary" onClick={() => go('lobby')}>View series</button>}
    </section>
    <section className="bd-panel bd-replay">
      <div className="bd-replay-head"><h2>The turning point</h2><button className="bd-small" onClick={() => setFrame(reduced ? replay.length - 1 : 0)}>▶ Replay capture</button></div>
      <Board tokens={current.tokens} focus={current.focus} impact={current.impact} compact animate={!reduced}
        names={{ red: 'Riya', yellow: 'Gunjan' }} perspective={viewer === 'gunjan' ? 'yellow' : 'red'}
        label="Opening singles capture replay" />
      <p className="bd-note" aria-live="polite">{current.caption}</p>
    </section>
    {isCaptain(viewer) && <GoldReceipt state={state} viewer={viewer} roundId={OPENING_ID} />}
  </>;
}

export function Proposal({ props, decider, grudge }: { props: ScreenProps; decider: boolean; grudge: boolean }) {
  const { state, viewer, now, go, send } = props;
  const prior = lastResult(state);
  const [format, setFormat] = useState<Format>(grudge || prior?.format === 'doubles' ? 'doubles' : 'singles');
  const [mode, setMode] = useState<'now' | 'scheduled'>(grudge ? 'scheduled' : 'now');
  const [selection, setSelection] = useState<string[]>(['tomorrow']);
  const [error, setError] = useState('');
  const allowed = isCaptain(viewer) && !currentRound(state) && (decider ? seriesStatus(state) === 'tied' : seriesStatus(state) === 'open') &&
    (!grudge || clubPairs(state));
  if (!allowed) return <section className="bd-panel"><h1>Booking unavailable</h1><button onClick={() => go('lobby')}>Back to lobby</button></section>;

  const tomorrow = tomorrowWindow(now, TIME_ZONE, 19, 30).start;
  const tomorrowStart = tomorrow <= now + DAY ? tomorrow : now + DAY;
  const options = [
    { id: 'today', label: 'In one hour', start: now + HOUR },
    { id: 'tomorrow', label: 'Tomorrow', start: tomorrowStart },
  ];
  const blocked = isBlocked(state, viewer, viewer === 'riya' ? 'gunjan' : 'riya');
  const pick = (id: string) => setSelection(grudge
    ? (selection.includes(id) ? selection.filter(choice => choice !== id) : [...selection, id])
    : [id]);
  const submit = (event: FormEvent) => {
    event.preventDefault();
    const choices = mode === 'now' ? [] : options.filter(option => selection.includes(option.id)).map(option => option.start);
    const next = send({ type: 'propose', format, mode, choices, club: grudge });
    const round = currentRound(next);
    if (round) go(`round/${round.id}`);
    else setError('That invitation could not be sent. Review the time and player availability.');
  };

  return <form className="bd-panel bd-form" onSubmit={submit}>
    <p className="bd-kicker">{decider ? 'Series decider' : 'Round 2'}</p>
    <h1>{grudge ? 'Host Grudge Night' : decider ? 'Book the decider' : 'Set up Badla'}</h1>
    <Score state={state} />
    {grudge ? <p>The same four players confirm the 100-gold entry, the chosen time and visibility in {state.club.name}.</p>
      : <fieldset><legend>Game format</legend>
        <div className="bd-options">
          <button type="button" aria-pressed={format === 'singles'} onClick={() => setFormat('singles')}>Singles <small>200 gold each</small></button>
          <button type="button" aria-pressed={format === 'doubles'} onClick={() => setFormat('doubles')}>Bring backup · 2v2 <small>100 gold each</small></button>
        </div>
      </fieldset>}
    <Stakes format={format} />
    <p className="bd-note">400 gold in the pot. A loss costs your entry.</p>
    <Bonus state={state} viewer={viewer} at={mode === 'scheduled' ? options.find(option => selection.includes(option.id))?.start ?? now : now} format={format} side={viewer} />
    {!grudge && <fieldset><legend>When to play</legend>
      <div className="bd-options">
        <button type="button" aria-pressed={mode === 'now'} onClick={() => setMode('now')}>Play now</button>
        <button type="button" aria-pressed={mode === 'scheduled'} onClick={() => setMode('scheduled')}>Pick a time</button>
      </div>
    </fieldset>}
    {mode === 'scheduled' && <fieldset><legend>{grudge ? 'Offer one or two slots' : 'Select a slot'}</legend>
      {options.map(option => <label className="bd-slot" key={option.id}>
        <input type={grudge ? 'checkbox' : 'radio'} name="slot" checked={selection.includes(option.id)} onChange={() => pick(option.id)} />
        <span><strong>{option.label}</strong><small>{windowLabel({ start: option.start, end: option.start + WINDOW_LENGTH })}</small></span>
      </label>)}
    </fieldset>}
    {blocked && <p role="status">This pair is blocked. Invitations are unavailable.</p>}
    {error && <p role="alert">{error}</p>}
    <button className="bd-primary" disabled={blocked || (mode === 'scheduled' && !selection.length)}>{grudge ? 'Offer slots' : 'Send challenge'}</button>
  </form>;
}

export function DeciderActions({ state, viewer, go, send }: ScreenProps) {
  if (!isCaptain(viewer) || currentRound(state) || seriesStatus(state) !== 'tied') return null;
  return <section className="bd-panel bd-actions">
    <h2>One each. Play a decider?</h2>
    {clubPairs(state) && <button className="bd-primary" onClick={() => go('grudge')}>Host Grudge Night</button>}
    <button onClick={() => go('decider')}>Private decider</button>
    <button className="bd-quiet" onClick={() => { send({ type: 'leave' }); go('lobby'); }}>Leave series</button>
  </section>;
}

export function Lobby(props: ScreenProps) {
  const { state, viewer, go } = props;
  const live = currentRound(state);
  const last = state.rounds.at(-1);
  const status = seriesStatus(state);
  const participant = live && !!seatFor(live, viewer);
  return <>
    <section className="bd-hero">
      <p className="bd-kicker">First to two</p><h1>Badla lobby</h1><Score state={state} />
      {status === 'expired' && <p>The series has closed. Previous games stay settled.</p>}
      {status === 'won' && <p>{Object.entries(scores(state)).find(([, score]) => score === 2)?.[0] === 'riya' ? 'Riya' : 'Gunjan'} wins the series.</p>}
      {participant && <button className="bd-primary" onClick={() => go(`round/${live.id}`)}>
        {live.booking.window && live.status === 'confirmed' ? `Table · ${windowLabel(live.booking.window)}` : 'Open your table'}
      </button>}
      {!live && status === 'open' && isCaptain(viewer) &&
        <button className="bd-primary" onClick={() => go('challenge')}>{viewer === 'riya' ? 'Take Badla' : 'Go for 2–0'}</button>}
      {last?.status === 'expired' && <p>{last.reason === 'missed' ? 'The check-in window closed before everyone joined.' : 'The proposed terms expired.'}</p>}
    </section>
    <DeciderActions {...props} />
    <section className="bd-panel bd-actions">
      <h2>Match history</h2>
      <button onClick={() => go('opening')}>Opening singles · Gunjan won</button>
      {state.rounds.filter(round => ['settled', 'voided'].includes(round.status) && seatFor(round, viewer)).map(round =>
        <button key={round.id} onClick={() => go(`round/${round.id}`)}>Round {round.number} · {round.status === 'voided' ? 'Refund receipt' : 'Gold receipt'}</button>)}
    </section>
  </>;
}

export function Fixture({ props, id }: { props: ScreenProps; id: string }) {
  const { state, viewer, now, go, send } = props;
  const card = visibleFixture(state, id, viewer);
  if (!card) return <section className="bd-panel"><h1>Fixture unavailable</h1><button onClick={() => go('club')}>Back to club</button></section>;
  const { round, window } = card;
  const pick = state.predictions.find(prediction => prediction.fixtureId === id && prediction.player === viewer);
  const mayPick = canPredict(state, id, viewer, now);
  const settled = round.status === 'settled' && round.winner;
  const closed = ['cancelled', 'expired', 'voided'].includes(round.status);
  const nextDay = formatDay(now, TIME_ZONE) !== formatDay(window.start, TIME_ZONE);
  return <>
    <section className="bd-hero">
      <p className="bd-kicker">{state.club.name} · {settled ? 'Final result' : closed ? 'Closed' : 'Scheduled fixture'}</p>
      <h1>Grudge Night</h1>
      <p className="bd-fixture-teams">{teamName(round, 'gunjan')} <span>vs</span> {teamName(round, 'riya')}</p>
      {settled ? <><Score state={state} /><p className="bd-winner">{teamName(round, settled)} win the series 2–1.</p></>
        : <p>Captains tied 1–1 · {windowLabel(window)}</p>}
    </section>
    {settled && <section className="bd-panel">
      <h2>Club predictions</h2>
      <dl className="bd-receipt">{CAPTAINS.map(side => <div key={side}><dt>{teamName(round, side)}</dt>
        <dd>{state.predictions.filter(prediction => prediction.fixtureId === id && prediction.side === side).length}</dd></div>)}</dl>
      {pick && <p className="bd-note">{pick.side === settled ? 'You picked the winners.' : `You picked ${teamName(round, pick.side)}. ${teamName(round, settled)} won.`}</p>}
    </section>}
    {closed && <section className="bd-panel"><h2>Fixture closed</h2>
      <p>{round.status === 'expired' ? 'The table missed its check-in window.' : 'The booking was withdrawn.'} There is no prediction verdict.</p></section>}
    {!settled && !closed && <section className="bd-panel bd-actions">
      <h2>{mayPick ? 'Pick a side' : seatFor(round, viewer) ? 'Your table' : 'Picks are locked'}</h2>
      {mayPick && <><p className="bd-note">Free to pick. You can change your side until the start.</p>
        {CAPTAINS.map(side => <button aria-pressed={pick?.side === side} key={side} onClick={() => send({ type: 'pick', fixtureId: id, side })}>{teamName(round, side)}</button>)}</>}
      {pick && <p className="bd-note" role="status">{mayPick ? `Your pick is in. Result ${nextDay ? 'tomorrow' : 'after the match'}.` : `Your locked pick is ${teamName(round, pick.side)}.`}</p>}
      {seatFor(round, viewer) && <button onClick={() => go(`round/${round.id}`)}>Open your table</button>}
    </section>}
    <button onClick={() => go('club')}>Back to club</button>
    {settled && seatFor(round, viewer) && <button onClick={() => go(`round/${round.id}`)}>View your gold receipt</button>}
  </>;
}

export function ClubScreen({ state, viewer, go }: ScreenProps) {
  const list = state.fixtures.flatMap(item => {
    const card = visibleFixture(state, item.id, viewer);
    const withdrawn = card?.round.status === 'cancelled';
    const hasPick = state.predictions.some(prediction => prediction.fixtureId === item.id && prediction.player === viewer);
    return card && (!withdrawn || hasPick) ? [card] : [];
  }).reverse();
  return <>
    <section className="bd-hero"><p className="bd-kicker">Club</p><h1>{state.club.name}</h1>
      <p>{state.club.members.includes(viewer) ? 'Grudge Night fixtures and results' : 'Club fixtures are available to members.'}</p>
    </section>
    {state.club.members.includes(viewer) && !list.length && <section className="bd-panel"><h2>No fixtures yet</h2><p>A Grudge Night appears here once all four players confirm.</p></section>}
    {list.map(({ fixture, round, window }) => <section className="bd-panel bd-actions" key={fixture.id}>
      <h2>Grudge Night</h2>
      <p>{teamName(round, 'gunjan')} vs {teamName(round, 'riya')}</p>
      <p className="bd-note">{round.status === 'settled' ? 'Result available' : ['cancelled', 'expired', 'voided'].includes(round.status) ? 'Fixture closed' : `1–1 · ${windowLabel(window)}`}</p>
      <button className={round.status === 'settled' ? 'bd-primary' : ''} onClick={() => go(`fixture/${fixture.id}`)}>{round.status === 'settled' ? 'Open result' : 'Open fixture'}</button>
    </section>)}
  </>;
}

export function actionFor(round: Round) {
  return { roundId: round.id, revision: round.revision } satisfies Pick<Extract<Action, { revision: number }>, 'roundId' | 'revision'>;
}

export function Notice({ props, id }: { props: ScreenProps; id: string }) {
  const { state, viewer, go, send } = props;
  const item = state.invites.find(invite => invite.id === id && invite.to === viewer);
  const round = state.rounds.find(round => round.id === item?.roundId);
  const eligible = !!item && !!round && !!seatFor(round, viewer) && (item.kind === 'captain'
    ? round.status === 'proposed' : item.kind === 'partner'
      ? round.status === 'filling' : ['check-in', 'active'].includes(round.status));
  useEffect(() => {
    if (item && !item.read) send({ type: 'readInvite', inviteId: item.id });
  }, [item, send]);
  return <section className="bd-panel bd-actions">
    <h1>{eligible ? item.kind === 'check-in' ? 'Your table is ready for check-in' : `Invitation from ${PLAYERS[item.from].name}` : 'This notification has expired'}</h1>
    <button className="bd-primary" onClick={() => go(eligible ? `round/${round.id}` : 'lobby')}>{eligible ? 'Open table' : 'Back to lobby'}</button>
  </section>;
}

export function ParticipantChip({ round, viewer }: { round: Round; viewer: PlayerId }) {
  const seat = seatFor(round, viewer);
  return seat ? <p className="bd-note"><PlayerChip player={viewer} /> · Team {PLAYERS[seat.side].name}</p> : null;
}
