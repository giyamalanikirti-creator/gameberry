import { useMemo, useState } from 'react';
import { formatSlot, tomorrowIn, tomorrowWindow, zonedTimeToUtc, WINDOW_LENGTH } from '../domain/time';
import type { PlayerId, TimeWindow } from '../domain/types';
import { hourProfile, pReturn, smartTimeLabel, suggestSlots, usualHour } from '../smart/smartFixture';
import { seriesStatus, theSeries } from '../state/selectors';
import { Gold } from '../ui/kit';
import { useTarget } from '../ui/shell';
import { Term } from '../ui/Term';
import { SmartTag } from './Opening';
import { Back, Terminal, useMe } from './common';

export function suggestedSlots(now: number, tz: string, hours: number[]): TimeWindow[] {
  const base = hours[0] ?? 21;
  return [tomorrowWindow(now, tz, base, 0), tomorrowWindow(now, tz, base, 30)];
}

/** Two mini heat-strips of the 24 hours with the chosen slot's hour highlighted. */
export function HeatStrips({ players, slot, now }: { players: PlayerId[]; slot: TimeWindow; now: number }) {
  const hour = Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', hour: 'numeric', hourCycle: 'h23' }).format(slot.start));
  return (
    <div className="heat">
      {players.map((p) => {
        const prof = hourProfile[p] ?? [];
        const max = Math.max(1, ...prof);
        return (
          <div key={p} className="heat-row">
            <span className="heat-name">{p[0].toUpperCase() + p.slice(1)}</span>
            <span className="heat-cells" aria-label={`${p} usually plays most around ${prof.indexOf(max)}:00`}>
              {prof.map((v, h) => <span key={h} className={`heat-cell${h === hour ? ' on' : ''}`} style={{ opacity: 0.15 + 0.85 * (v / max) }} />)}
            </span>
          </div>
        );
      })}
      <p className="fine heat-axis"><span>00</span><span>12</span><span>23</span></p>
      {pReturn('riya', slot.start) < 0.5 && <p className="small">Tomorrow is a day Riya usually skips.</p>}
      <p className="fine">Booked for {smartTimeLabel(slot, now)}.</p>
    </div>
  );
}

/** Simple picker: today, tomorrow or the day after; 30-minute slots 12:00–23:30. */
export function TimePicker({ now, tz, onPick }: { now: number; tz: string; onPick: (w: TimeWindow) => void }) {
  const [day, setDay] = useState(1);
  const [time, setTime] = useState('21:00');
  const days = ['Today', 'Tomorrow', 'Day after'];
  const times = Array.from({ length: 24 }, (_, i) => `${String(12 + Math.floor(i / 2)).padStart(2, '0')}:${i % 2 ? '30' : '00'}`);
  const build = () => {
    let [y, m, d] = tomorrowIn(now - 86_400_000, tz);
    for (let i = 0; i < day; i++) [y, m, d] = tomorrowIn(zonedTimeToUtc(y, m, d, 12, 0, tz), tz);
    const [hh, mm] = time.split(':').map(Number);
    const start = zonedTimeToUtc(y, m, d, hh, mm, tz);
    return { start, end: start + WINDOW_LENGTH };
  };
  const w = build();
  return (
    <div className="picker">
      <div className="seg" role="group" aria-label="Day">
        {days.map((d, i) => <button key={d} type="button" aria-pressed={day === i} onClick={() => setDay(i)}>{d}</button>)}
      </div>
      <label className="field">Time
        <select value={time} onChange={(e) => setTime(e.target.value)}>{times.map((t) => <option key={t}>{t}</option>)}</select>
      </label>
      <button type="button" className="btn btn-quiet" disabled={w.start <= now} onClick={() => onPick(w)}>Use {formatSlot(w, now, tz)}</button>
    </div>
  );
}

/** Screen 2: format, then Play now or Pick a time (Smart Fixture first in variant D). */
export function Challenge() {
  const { state, me, now, tz, dispatch, go, route } = useMe();
  const op = state.opening;
  const series = theSeries(state);
  const variant = state.settings.variant;
  const [format, setFormat] = useState<'singles' | 'doubles'>('singles');
  const [timing, setTiming] = useState<'now' | 'scheduled'>(route.name === 'challenge' && route.timing ? route.timing : 'scheduled');
  const [custom, setCustom] = useState<TimeWindow | null>(null);
  const [showPicker, setShowPicker] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const other = me === op.winnerId ? op.loserId : op.winnerId;
  const smart = useMemo(() => suggestSlots(now, [me, other] as PlayerId[]), [now, me, other]);
  const sendT = useTarget('send-challenge', 'btn btn-ember btn-big');

  if (me !== op.winnerId && me !== op.loserId) return <Terminal title="Not available" body="Only the two players from the match can start a Badla." />;
  const st = series ? seriesStatus(state, series.id) : 'none';
  if (st === 'won' || st === 'expired' || st === 'closed') return <Terminal title="This series is over" body="No decider and no new challenge." />;
  const decider = st === 'tied';
  const otherName = state.players[other].name;
  const best = smart[0];
  const alts = smart.slice(1, 3);
  const chosen: TimeWindow = custom ?? best.slot;
  const entry = format === 'doubles' ? 100 : 200;

  const send = (slot?: TimeWindow) => {
    const r = dispatch({ type: 'SEND_CHALLENGE', format, timing, slots: timing === 'scheduled' ? [slot ?? chosen] : undefined });
    if (!r.accepted) return setError(r.reason ?? 'Could not send');
    go({ name: 'invite', id: r.ref! });
  };

  return (
    <div className="screen">
      <Back />
      <p className="eyebrow">{decider ? <>Private <Term t="decider">decider</Term> · 1-1</> : `Set up Badla · you vs ${otherName}`}</p>
      <h1 className="title">{decider ? 'Book the decider' : me === op.loserId ? 'Take Badla' : 'Go for 2-0'}</h1>
      <fieldset className="choice">
        <legend>Format</legend>
        {([
          { k: 'singles' as const, title: decider ? 'Singles decider' : 'Badla singles', sub: 'Just the two of you', e: 200, w: 400 },
          { k: 'doubles' as const, title: 'Bring backup · 2v2', sub: 'Each of you invites one friend', e: 100, w: 200 },
        ]).map((f) => (
          <label key={f.k} className={`format-card${format === f.k ? ' on' : ''}`}>
            <input type="radio" name="format" checked={format === f.k} onChange={() => setFormat(f.k)} />
            <span className="fc-title">{f.title}</span>
            <span className="fc-sub">{f.sub}</span>
            <span className="fc-lines"><span><Term t="entry">Entry</Term> <Gold amount={f.e} /></span><span><Term t="pot">Pot</Term> <Gold amount={400} /></span><span>Net win <Gold amount={f.w - f.e} signed /></span></span>
          </label>
        ))}
      </fieldset>
      <div className="seg" role="group" aria-label="Timing">
        <button type="button" aria-pressed={timing === 'now'} onClick={() => setTiming('now')}>Play now</button>
        <button type="button" aria-pressed={timing === 'scheduled'} onClick={() => setTiming('scheduled')}>Pick a time</button>
      </div>

      {timing === 'now' ? (
        <>
          <p className="muted small">A 5-minute table opens when every seat is filled. Play now adds session time, not an extra active day.</p>
          {error && <p className="error" role="alert">{error}</p>}
          <button type="button" {...sendT} onClick={() => send()}>Send to {otherName} · {entry} gold on start</button>
        </>
      ) : (
        <>
          {variant === 'D' && !custom && (
            <div className="smart-card">
              <SmartTag why="Each slot is scored by how likely you both show up at that hour and how much of an extra day it is for each of you.">
                <HeatStrips players={[me, other] as PlayerId[]} slot={best.slot} now={now} />
              </SmartTag>
              <p className="smart-line">You both usually play around {String(usualHour([me, other] as PlayerId[])).padStart(2, '0')}:00. Book {smartTimeLabel(best.slot, now)}?</p>
              <span className={`confidence c-${best.confidence.toLowerCase()}`}>{best.confidence} chance you both show up</span>
              {error && <p className="error" role="alert">{error}</p>}
              <button type="button" {...sendT} onClick={() => send(best.slot)}>Send · {smartTimeLabel(best.slot, now)} · {entry} gold on start</button>
            </div>
          )}
          <fieldset className="choice">
            <legend>{variant === 'D' && !custom ? 'Or one of these' : 'Pick a time'}</legend>
            {(variant === 'D' ? alts : smart.slice(0, 3)).map((s) => (
              <button key={s.slot.start} type="button" className="slot" onClick={() => send(s.slot)}>
                {formatSlot(s.slot, now, tz)} <span className="tz">IST</span>
              </button>
            ))}
            {custom && (
              <button type="button" className="slot on" onClick={() => send(custom)}>
                Send · {formatSlot(custom, now, tz)} <span className="tz">IST</span>
              </button>
            )}
            <button type="button" className="link" onClick={() => setShowPicker((p) => !p)} aria-expanded={showPicker}>Choose another time</button>
            {showPicker && <TimePicker now={now} tz={tz} onPick={(w) => { setCustom(w); setShowPicker(false); }} />}
          </fieldset>
          {error && variant !== 'D' && <p className="error" role="alert">{error}</p>}
        </>
      )}
      <p className="fine">{otherName} can accept, suggest another time or pass. Passing closes it quietly. Gold only moves when every seat taps Ready in the <Term t="check-in window">check-in window</Term>.</p>
    </div>
  );
}
