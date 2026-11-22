import { useEffect, useRef } from 'react';
import type { PlayerId, State } from '../domain/types';
import { seriesRounds, seriesScore, seriesStatus, seriesWinner } from '../state/selectors';
import { Avatar, Card, Gold } from '../ui/kit';
import { useReducedMotion } from '../ui/motion';
import { useShell } from '../ui/shell';
import { Terminal, useMe } from './common';

function Confetti() {
  const pieces = Array.from({ length: 28 }, (_, i) => i);
  return (
    <div className="confetti" aria-hidden="true">
      {pieces.map((i) => <span key={i} style={{ left: `${(i * 37) % 100}%`, animationDelay: `${(i % 7) * 60}ms`, background: ['#ffd166', '#ff6b1a', '#2a9d8f', '#3a86ff', '#e63946'][i % 5] }} />)}
    </div>
  );
}

export function rivalRecord(s: State, a: PlayerId, b: PlayerId) {
  let wa = 0;
  let wb = 0;
  for (const series of Object.values(s.series)) {
    if (!series.captainIds.includes(a) || !series.captainIds.includes(b)) continue;
    for (const r of seriesRounds(s, series)) {
      if (r.status !== 'settled' || !r.outcome) continue;
      if (series.sides[r.outcome.winnerSide] === a) wa++; else wb++;
    }
  }
  return [wa, wb] as const;
}

/** Flow 7: every series ending gets its own screen and a gold receipt. */
export function SeriesEnd({ seriesId }: { seriesId: string }) {
  const { state, me, tz, go, dispatch } = useMe();
  const { flash } = useShell();
  const reduced = useReducedMotion();
  const series = state.series[seriesId];
  const logged = useRef(false);
  useEffect(() => {
    if (!series || logged.current) return;
    logged.current = true;
    dispatch({ type: 'LOG', name: 'series_end_view', seriesId });
  }, [series, seriesId, dispatch]);
  if (!series) return <Terminal title="Not available" body="No such series." />;
  const st = seriesStatus(state, seriesId);
  const sc = seriesScore(state, seriesId);
  const w = seriesWinner(state, seriesId);
  const roundIds = new Set(series.roundIds);
  const net = state.wallet.filter((e) => e.playerId === me && e.roundId && roundIds.has(e.roundId)).reduce((t, e) => t + e.amount, 0);
  const lines = state.wallet.filter((e) => e.playerId === me && e.roundId && roundIds.has(e.roundId));
  const [a, b] = series.captainIds;
  const [ra, rb] = rivalRecord(state, a, b);
  const winnerName = w ? state.players[series.sides[w]].name : null;
  const sweep = w && (sc.A === 0 || sc.B === 0);

  const title = st === 'won' ? (sweep ? `Series sweep · ${winnerName} 2-0` : `${winnerName} wins the series ${Math.max(sc.A, sc.B)}‑${Math.min(sc.A, sc.B)}`)
    : st === 'closed' ? `${state.players[series.closedBy!]?.name ?? 'A captain'} left the series`
      : st === 'expired' ? 'The series expired' : 'Series in progress';
  const sub = st === 'won' ? 'First to two. The rivalry card keeps the record.'
    : st === 'closed' ? 'No score change after leaving. Settled rounds stay settled.'
      : st === 'expired' ? 'Seven days passed without a decider. Prior rounds stay settled.' : '';

  return (
    <div className="screen series-end">
      {st === 'won' && !reduced && <Confetti />}
      <p className="eyebrow">Series result</p>
      <h1 className="title">{title}</h1>
      <p className="muted">{sub}</p>
      <Card tone="gold">
        <p className="eyebrow">Your gold receipt · whole series</p>
        <ul className="receipt-lines">
          {lines.map((e) => <li key={e.id}><span>{e.roundId === state.opening.roundId ? 'Opening' : state.rounds[e.roundId!]?.isDecider ? 'Decider' : `Round ${state.rounds[e.roundId!]?.index}`} · {e.kind}</span><Gold amount={e.amount} signed /></li>)}
        </ul>
        <p className="receipt-net">Net <Gold amount={net} signed /></p>
      </Card>
      <Card className="rival-card">
        <p className="eyebrow">Rivalry</p>
        <div className="rival-row">
          <span><Avatar state={state} id={a} size={36} /> {state.players[a].name} <strong className="num">{ra}</strong></span>
          <span className="muted">–</span>
          <span><strong className="num">{rb}</strong> {state.players[b].name} <Avatar state={state} id={b} size={36} /></span>
        </div>
        <p className="small">Last capture: Gunjan sent Riya home 1 square from the finish.</p>
        <p className="fine">Rival since {new Intl.DateTimeFormat('en-GB', { timeZone: tz, day: 'numeric', month: 'short' }).format(state.opening.settledAt)}</p>
      </Card>
      <button type="button" className="btn btn-ember btn-big" onClick={() => flash('A new series starts from your next close public match. Not wired in this prototype.')}>Start a new series</button>
      <button type="button" className="btn btn-quiet" onClick={() => go({ name: 'home' })}>Back to home</button>
    </div>
  );
}

export function Profile() {
  const { state, me, go } = useMe();
  const p = state.players[me];
  const rivals = (['gunjan', 'riya'] as PlayerId[]).filter((x) => x !== me && Object.values(state.series).some((s) => s.captainIds.includes(me) && s.captainIds.includes(x)));
  return (
    <div className="screen">
      <div className="hello"><Avatar state={state} id={me} size={56} /><div><p className="eyebrow">Profile</p><h1>{p.name}</h1><p className="muted small">Level {p.level} · {p.handle}</p></div></div>
      <Card>
        <h2 className="card-h">Rivals</h2>
        {rivals.length === 0 && <p className="muted">No rivals yet. A Badla series against someone makes them one.</p>}
        <ol className="rivals">
          {rivals.slice(0, 3).map((x) => {
            const [mine, theirs] = rivalRecord(state, me, x);
            return <li key={x}><Avatar state={state} id={x} size={30} /> {state.players[x].name} <span className="num">{mine}–{theirs}</span> <button type="button" className="link" onClick={() => go({ name: 'badla' })}>Open</button></li>;
          })}
        </ol>
      </Card>
    </div>
  );
}
