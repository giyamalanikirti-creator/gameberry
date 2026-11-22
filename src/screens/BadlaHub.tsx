import { useState } from 'react';
import { formatDuration, formatSlot } from '../domain/time';
import type { PlayerId } from '../domain/types';
import { currentRound, liveFixtureForRound, seatFor, seriesRounds, seriesStatus, theSeries } from '../state/selectors';
import { Card, SeriesScore } from '../ui/kit';
import { Terminal, useMe } from './common';

/** Badla settings from the player's own UI: mute alerts, reminders, block. */
function Settings({ seriesId, rival, onClose }: { seriesId: string; rival: PlayerId; onClose: () => void }) {
  const { state, me, dispatch } = useMe();
  const p = state.players[me];
  const muted = p.mutedSeriesIds.includes(seriesId);
  const blocked = p.blockedPlayerIds.includes(rival);
  const [confirmBlock, setConfirmBlock] = useState(false);
  return (
    <Card tone="quiet" className="settings-card">
      <div className="row-between"><h2 className="card-h">Badla settings</h2><button type="button" className="x" aria-label="Close settings" onClick={onClose}>✕</button></div>
      <label className="check"><input type="checkbox" checked={!muted} onChange={(e) => dispatch({ type: 'SET_MUTE', seriesId, muted: !e.target.checked })} /> Badla alerts {muted ? '(muted: cards still show here)' : ''}</label>
      <label className="check"><input type="checkbox" checked={!p.remindersOff} onChange={(e) => dispatch({ type: 'SET_REMINDERS', on: e.target.checked })} /> "Your table is ready" reminders</label>
      <p className="fine">At most two Badla alerts a day. Extra ones wait in the inbox, delivered tomorrow.</p>
      {blocked ? (
        <button type="button" className="link" onClick={() => dispatch({ type: 'BLOCK', playerId: rival, blocked: false })}>Unblock {state.players[rival].name}</button>
      ) : confirmBlock ? (
        <span className="row">
          <span className="small">Block {state.players[rival].name}? This ends the rivalry link.</span>
          <button type="button" className="link danger" onClick={() => { dispatch({ type: 'BLOCK', playerId: rival, blocked: true }); setConfirmBlock(false); }}>Block</button>
          <button type="button" className="link" onClick={() => setConfirmBlock(false)}>Keep</button>
        </span>
      ) : (
        <button type="button" className="link danger" onClick={() => setConfirmBlock(true)}>Block this player</button>
      )}
    </Card>
  );
}

export function BadlaHub() {
  const { state, me, now, tz, go, dispatch } = useMe();
  const [gear, setGear] = useState(false);
  const series = theSeries(state);
  const isCaptain = series?.captainIds.includes(me);
  if (!series) {
    return <Terminal title="No Badla yet" body={state.opening.played ? 'Open the match result to take Badla.' : 'Play a public match first. A close capture can start a Badla.'}>
      {state.opening.played && (me === 'riya' || me === 'gunjan') && <button type="button" className="btn btn-ember" onClick={() => go({ name: 'opening' })}>See the result</button>}
    </Terminal>;
  }
  const r = currentRound(state, series);
  const seated = r ? seatFor(state, r, me) : null;
  if (!isCaptain && !seated) return <Terminal title="No Badla seat" body="When a friend invites you to their side, it appears here." />;
  const rival = series.captainIds.find((p) => p !== me) ?? series.sides.A;
  const st = seriesStatus(state, series.id);
  const fx = r ? liveFixtureForRound(state, r.id) : null;
  const reminderOn = !state.players[me].remindersOff;

  return (
    <div className="screen">
      <div className="row-between">
        <p className="eyebrow">Badla · first to two · {st}</p>
        {isCaptain && <button type="button" className="gear" aria-label="Badla settings" aria-expanded={gear} onClick={() => setGear((g) => !g)}>⚙</button>}
      </div>
      <SeriesScore state={state} seriesId={series.id} big />
      <p className="fine">Rival since {new Intl.DateTimeFormat('en-GB', { timeZone: tz, day: 'numeric', month: 'short' }).format(state.opening.settledAt)} · last capture: 1 square from home</p>
      {gear && <Settings seriesId={series.id} rival={rival as PlayerId} onClose={() => setGear(false)} />}

      {r && r.window && (r.status === 'confirmed' || r.status === 'checkin') && (
        <Card tone="ember" className="fixture-mini">
          <p className="eyebrow">{r.clubVisible ? 'Grudge Night' : 'Badla fixture'}</p>
          <p className="time-big">{formatSlot(r.window, now, tz)} <span className="tz">IST</span></p>
          <p className="countdown num">{r.window.start > now ? `in ${formatDuration(r.window.start - now)}` : 'Check-in open now'}</p>
          <label className="check"><input type="checkbox" checked={reminderOn} onChange={(e) => dispatch({ type: 'SET_REMINDERS', on: e.target.checked })} /> Add reminder (one, at start time)</label>
          <div className="row">
            <button type="button" className="btn btn-ember" onClick={() => go(r.window!.start > now && !r.clubVisible ? { name: 'booked', roundId: r.id } : { name: 'round', id: r.id })}>{r.window.start > now ? 'Open ticket' : 'Go to check-in'}</button>
            {fx && <button type="button" className="btn btn-quiet" onClick={() => go({ name: 'fixture', id: fx.id })}>Club card</button>}
          </div>
        </Card>
      )}
      {r && !(r.window && (r.status === 'confirmed' || r.status === 'checkin')) && (
        <Card>
          <p>{r.isDecider ? 'Decider' : `Round ${r.index}`} · {r.format} · {r.status}</p>
          <button type="button" className="btn btn-quiet" onClick={() => go(r.status === 'settled' ? { name: 'receipt', roundId: r.id } : { name: 'round', id: r.id })}>Open</button>
        </Card>
      )}
      {(st === 'won' || st === 'closed' || st === 'expired') && (
        <button type="button" className="btn btn-ember" onClick={() => go({ name: 'seriesEnd', seriesId: series.id })}>See the series result</button>
      )}
      <ol className="history" aria-label="Rounds">
        {seriesRounds(state, series).map((x, i) => (
          <li key={x.id}>
            <span>{i === 0 ? 'Opening (public match)' : x.isDecider ? 'Decider' : `Round ${x.index}`}</span>
            <span className="muted">{x.status === 'settled' && x.outcome ? `${state.players[series.sides[x.outcome.winnerSide]].name}'s side` : x.status}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}
