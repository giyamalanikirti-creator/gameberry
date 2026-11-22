import { useMemo, useState } from 'react';
import { formatSlot, tomorrowWindow } from '../domain/time';
import type { TimeWindow } from '../domain/types';
import { seriesStatus, theSeries } from '../state/selectors';
import { Card, Gold } from '../ui/kit';
import { Back, Terminal, useMe } from './common';

export function suggestedSlots(now: number, tz: string, hours: number[]): TimeWindow[] {
  const base = hours[0] ?? 21;
  return [tomorrowWindow(now, tz, base, 0), tomorrowWindow(now, tz, base, 30)];
}

/** Screen 2: two format cards, Play now or Pick a time. Sending creates the series. */
export function Challenge() {
  const { state, me, now, tz, dispatch, go } = useMe();
  const op = state.opening;
  const series = theSeries(state);
  const [format, setFormat] = useState<'singles' | 'doubles'>('doubles');
  const [timing, setTiming] = useState<'now' | 'scheduled'>('now');
  const slots = useMemo(() => suggestedSlots(now, tz, state.players[me].usualPlayHours), [now, tz, me, state.players]);
  const [picked, setPicked] = useState<number[]>([0]);
  const [error, setError] = useState<string | null>(null);

  if (me !== op.winnerId && me !== op.loserId) return <Terminal title="Not available" body="Only the two captains can start a Badla." />;
  const st = series ? seriesStatus(state, series.id) : 'none';
  if (st === 'won' || st === 'expired' || st === 'closed') return <Terminal title="This series is over" body="No decider and no new challenge." />;
  const decider = st === 'tied';
  const other = state.players[me === op.winnerId ? op.loserId : op.winnerId];

  const send = () => {
    const r = dispatch({ type: 'SEND_CHALLENGE', format, timing, slots: timing === 'scheduled' ? picked.map((i) => slots[i]) : undefined });
    if (!r.accepted) return setError(r.reason ?? 'Could not send');
    go({ name: 'invite', id: r.ref! });
  };

  const formats = [
    { k: 'singles' as const, title: decider ? 'Singles decider' : 'Badla singles', sub: 'Just the two captains', entry: 200, win: 400 },
    { k: 'doubles' as const, title: 'Badla Doubles', sub: 'Bring backup · 2v2', entry: 100, win: 200 },
  ];

  return (
    <div className="screen">
      <Back />
      <p className="eyebrow">{decider ? 'Private decider · 1-1' : `Badla · you vs ${other.name}`}</p>
      <h1 className="title">{decider ? 'Propose the decider' : me === op.loserId ? 'Take Badla' : 'Go for 2-0'}</h1>
      <fieldset className="choice">
        <legend>Format</legend>
        {formats.map((f) => (
          <label key={f.k} className={`format-card${format === f.k ? ' on' : ''}`}>
            <input type="radio" name="format" checked={format === f.k} onChange={() => setFormat(f.k)} />
            <span className="fc-title">{f.title}</span>
            <span className="fc-sub">{f.sub}</span>
            <span className="fc-price">{f.title} · You pay {f.entry} · Win {f.win} back</span>
            <span className="fc-lines">
              <span>Entry <Gold amount={f.entry} /></span><span>Pot <Gold amount={400} /></span><span>Net win <Gold amount={f.win - f.entry} signed /></span>
            </span>
          </label>
        ))}
      </fieldset>
      <fieldset className="choice">
        <legend>Timing</legend>
        <div className="seg">
          <button type="button" aria-pressed={timing === 'now'} onClick={() => setTiming('now')}>Play now</button>
          <button type="button" aria-pressed={timing === 'scheduled'} onClick={() => setTiming('scheduled')}>Pick a time</button>
        </div>
        {timing === 'now' ? (
          <p className="muted small">When every seat is filled, a 5-minute table opens. Gold moves only when the last player taps Ready.</p>
        ) : (
          <div className="slots">
            {slots.map((w, i) => (
              <label key={w.start} className={`slot${picked.includes(i) ? ' on' : ''}`}>
                <input type="checkbox" checked={picked.includes(i)} onChange={() => setPicked((p) => (p.includes(i) ? p.filter((x) => x !== i) : [...p, i].slice(-2)))} />
                {formatSlot(w, now, tz)} <span className="tz">IST</span>
              </label>
            ))}
            <p className="muted small">Offer up to two slots. {other.name} picks one.</p>
          </div>
        )}
      </fieldset>
      {error && <p className="error" role="alert">{error}</p>}
      <Card tone="quiet">
        <p className="small">{other.name} can accept or pass. Passing closes it quietly and the opening result stays as it is.</p>
      </Card>
      <button type="button" className="btn btn-ember btn-big" onClick={send} disabled={timing === 'scheduled' && picked.length === 0}>
        Send to {other.name} · {format === 'doubles' ? '100' : '200'} gold on start
      </button>
    </div>
  );
}
