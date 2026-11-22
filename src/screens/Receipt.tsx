import { useEffect, useRef } from 'react';
import { canHostGrudgeNight, seatFor, seriesScore, seriesStatus, seriesWinner } from '../state/selectors';
import { Card, Gold, SeriesScore } from '../ui/kit';
import { Back, Terminal, useMe } from './common';
import { useTarget } from '../ui/shell';
import { Term } from '../ui/Term';

/** Screen 8: four different receipts from one round. Reads only the signed-in player's own. */
export function Receipt({ roundId }: { roundId: string }) {
  const { state, me, dispatch, go } = useMe();
  const r = state.rounds[roundId];
  const seat = r ? seatFor(state, r, me) : null;
  const logged = useRef(false);
  const grudgeT = useTarget('grudge-night', 'btn btn-ember btn-big');

  useEffect(() => {
    if (!r || !seat || r.status !== 'settled' || logged.current) return;
    logged.current = true;
    dispatch({ type: 'LOG', name: 'receipt_view', roundId: r.id, seriesId: r.seriesId ?? undefined });
  }, [r, seat, dispatch]);

  if (!r || r.status !== 'settled' || !r.seriesId) return <Terminal title="Not available" body="There is no settled result here." />;
  if (!seat) return <Terminal title="Receipts are private" body="Only the player who sat in this round can open their receipt." />;
  const series = state.series[r.seriesId];
  const won = r.outcome!.winnerSide === seat.side;
  const lines = state.wallet.filter((e) => e.roundId === r.id && e.playerId === me);
  const entry = lines.filter((e) => e.kind === 'entry').reduce((a, e) => a + e.amount, 0);
  const payout = lines.filter((e) => e.kind === 'payout').reduce((a, e) => a + e.amount, 0);
  const bonus = lines.filter((e) => e.kind === 'bonus').reduce((a, e) => a + e.amount, 0);
  const net = entry + payout + bonus;
  const sc = seriesScore(state, series.id);
  const captain = state.players[series.sides[seat.side]];
  const st = seriesStatus(state, series.id);
  const seriesWon = seriesWinner(state, series.id);
  const assist = Object.values(state.assists).find((a) => a.roundId === r.id && a.playerId === me);
  const saved = state.seatSaves.includes(`${r.id}:${me}`);
  const isCaptain = seat.seatRole === 'captain';
  const winners = r.game!.seats.filter((s) => s.side === r.outcome!.winnerSide).map((s) => state.players[s.playerId as 'riya'].name).join(' & ');

  let headline: string;
  if (seriesWon) headline = seriesWon === seat.side ? `${winners} win the series ${Math.max(sc.A, sc.B)}-${Math.min(sc.A, sc.B)}` : `${winners} take the series ${Math.max(sc.A, sc.B)}-${Math.min(sc.A, sc.B)}`;
  else if (assist) headline = `You helped ${captain.name} take it to ${sc.A}-${sc.B}`;
  else if (!isCaptain && st === 'tied') headline = `One each. Defend the series with ${captain.name}?`;
  else if (isCaptain && st === 'tied') headline = won ? 'One each. Badla taken.' : 'One each. The decider is yours to book.';
  else headline = won ? 'You win the round' : `${winners} win the round`;

  return (
    <div className="screen">
      <Back />
      <p className="eyebrow">Your receipt · {r.isDecider ? 'Decider' : `Round ${r.index}`} · {r.format}</p>
      <h1 className="title">{headline.replace(/(\d)-(\d)/g, '$1\u2011$2')}</h1>
      <SeriesScore state={state} seriesId={series.id} big />

      {assist && (
        <Card tone="ember" className="assist">
          <p className="eyebrow">Partner Assist</p>
          <p className="assist-line">You helped <strong>{captain.name}</strong> take it to {assist.seriesScoreAfter}.</p>
          <p className="small">Your finish on the exact roll made it one each. An assist records that you were there; it carries no gold and no skill claim.</p>
        </Card>
      )}

      <Card>
        <dl className="receipt">
          <dt>Entry</dt><dd><Gold amount={entry} /></dd>
          <dt>Pot</dt><dd><Gold amount={r.entryGold * (r.format === 'doubles' ? 4 : 2)} /></dd>
          <dt>Gross payout</dt><dd><Gold amount={payout} /></dd>
          {bonus ? <><dt>Sweep bonus</dt><dd><Gold amount={bonus} /></dd></> : null}
          <dt className="strong">Net change</dt><dd className="strong"><Gold amount={net} signed /></dd>
        </dl>
        <p className="fine">Proposed pilot values. Balance is the sum of your ledger entries.</p>
      </Card>

      {!isCaptain && st === 'tied' && (
        saved ? <p className="ok">Seat saved for the decider. Your captain will see it.</p> : (
          <button type="button" className="btn btn-ember btn-big" onClick={() => dispatch({ type: 'SAVE_SEAT', roundId: r.id })}>Save my seat for the decider</button>
        )
      )}

      {isCaptain && st === 'tied' && (
        <div className="stack">
          <p className="small">One each. Play the <Term t="decider">decider</Term>:</p>
          {canHostGrudgeNight(state, series.id) && (
            <button type="button" {...grudgeT} onClick={() => go({ name: 'booking', id: `new:${series.id}` })}>Make it a Grudge Night</button>
          )}
          <button type="button" className="btn btn-quiet" onClick={() => go({ name: 'challenge', seriesId: series.id, timing: 'now' })}>Private decider now</button>
          <button type="button" className="btn btn-quiet" onClick={() => go({ name: 'challenge', seriesId: series.id, timing: 'scheduled' })}>Book the decider</button>
          {!canHostGrudgeNight(state, series.id) && <p className="fine"><Term t="Grudge Night">Grudge Night</Term> needs a club both captains share.</p>}
          {state.seatSaves.filter((k) => k.startsWith(`${r.id}:`)).map((k) => (
            <p key={k} className="small muted">{state.players[k.split(':')[1] as 'ananya'].name} saved a seat for the decider.</p>
          ))}
        </div>
      )}
      {st !== 'tied' && st !== 'open' && (
        <button type="button" className="btn btn-ember btn-big" onClick={() => go({ name: 'seriesEnd', seriesId: series.id })}>See the series result</button>
      )}
      <button type="button" className="btn btn-quiet" onClick={() => go({ name: 'home' })}>Home</button>
    </div>
  );
}
