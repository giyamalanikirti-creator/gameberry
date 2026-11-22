import { useState } from 'react';
import { PLAYER_IDS } from '../state/seed';
import { useStore } from '../state/store';
import { formatTime, localDateKey } from '../domain/time';
import { activeDays, guardrails, litStages, productEvents, stageOf } from './events';
import { DauInputs, FUNNEL, SNAPS, dauLift, formatDauK, formatLift } from './dau';

const TZ = 'Asia/Kolkata';

function days(start: number): Array<{ key: string; label: string }> {
  return Array.from({ length: 7 }, (_, i) => {
    const at = start + i * 86_400_000;
    return { key: localDateKey(at, TZ), label: new Intl.DateTimeFormat('en-GB', { timeZone: TZ, weekday: 'short', day: 'numeric' }).format(at) };
  });
}

export function AnalyticsPanel() {
  const { state } = useStore();
  const [inputs, setInputs] = useState<DauInputs>(SNAPS.base);
  const ev = productEvents(state).slice().reverse();
  const strip = days(state.opening.settledAt);
  const lit = litStages(state);
  const { lift, extraDau } = dauLift(inputs);
  const snapOf = (Object.keys(SNAPS) as Array<keyof typeof SNAPS>).find((k) => SNAPS[k].participation === inputs.participation && SNAPS[k].extraDays === inputs.extraDays);

  return (
    <div className="analytics" aria-label="Analytics panel">
      <h2 className="an-h">Analytics · product events only</h2>
      <p className="an-claim">The prototype demonstrates a mechanism. The 10% lift is a target to test, not a result.</p>

      <section className="an-card">
        <h3>Active days</h3>
        <table className="days">
          <thead><tr><th scope="col">Player</th>{strip.map((d) => <th key={d.key} scope="col">{d.label}</th>)}</tr></thead>
          <tbody>
            {PLAYER_IDS.map((p) => {
              const set = new Set(activeDays(state, p));
              return (
                <tr key={p}>
                  <th scope="row">{state.players[p].name}</th>
                  {strip.map((d, i) => {
                    const on = set.has(d.key);
                    return (
                      <td key={d.key} className={on ? (i === 0 ? 'day-on' : 'day-inc') : 'day-off'} title={on && i > 0 ? 'Incremental active day' : undefined}>
                        {on ? (i > 0 ? '★' : '●') : '·'}
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
        <p className="fine"><span className="day-inc">★</span> Incremental active day: a product action on a day after the opening game.</p>
      </section>

      <section className="an-card">
        <h3>Funnel · base-case rates</h3>
        <ol className="funnel">
          {FUNNEL.map((f) => (
            <li key={f.id} className={`${lit.has(f.id) ? 'lit' : ''}${f.branch ? ' branch' : ''}`}>
              <span>{f.branch ? '↳ ' : ''}{f.label}</span>
              <span className="num">{f.branch ? 'new' : `${Math.round(f.rate * 100)}%`}</span>
            </li>
          ))}
        </ol>
        <p className="fine">Stages light up as the demo path reaches them. Skipped stages stay grey rather than being assumed.</p>
      </section>

      <section className="an-card">
        <h3>DAU calculator</h3>
        <p className="small">1.5M DAU · 25% DAU/MAU → 7.5 active days per monthly player.</p>
        <label className="slider">
          Participation <span className="num">{Math.round(inputs.participation * 100)}%</span>
          <input type="range" min={0} max={0.6} step={0.01} value={inputs.participation} onChange={(e) => setInputs({ ...inputs, participation: Number(e.target.value) })} />
        </label>
        <label className="slider">
          Net extra days <span className="num">{inputs.extraDays.toFixed(2)}</span>
          <input type="range" min={0} max={4} step={0.01} value={inputs.extraDays} onChange={(e) => setInputs({ ...inputs, extraDays: Number(e.target.value) })} />
        </label>
        <p className="lift"><strong className="num">{formatLift(lift)}</strong> DAU · about <strong className="num">{formatDauK(extraDau)}</strong></p>
        <div className="seg seg-sm">
          {(['low', 'base', 'high'] as const).map((k) => (
            <button key={k} type="button" aria-pressed={snapOf === k} onClick={() => setInputs(SNAPS[k])}>
              {k === 'low' ? 'Low 5.1%' : k === 'base' ? 'Base 10.2%' : 'High 16.9%'}
            </button>
          ))}
        </div>
        <p className="fine">Lift = participants × extra days / 7.5. Illustrative inputs from the case model; replace with Ludo STAR analytics.</p>
        <p className="fine">Test design: average daily unique actives vs a standard-result holdout over four weeks, connected groups assigned together, one person counted once a day across roles. Partners and clubmates who return on a day they would otherwise skip are reported separately.</p>
      </section>

      <section className="an-card">
        <h3>Guardrails</h3>
        <ul className="guard">
          {guardrails(state).map((g) => <li key={g.label}><span>{g.label}</span><span className="num">{g.value}</span></li>)}
        </ul>
      </section>

      <section className="an-card">
        <h3>Event log</h3>
        {ev.length === 0 && <p className="muted small">Sign in and act to see product events.</p>}
        <ol className="log">
          {ev.slice(0, 60).map((e) => (
            <li key={e.id} className={`stage-${stageOf(e.name)}`}>
              <code className="num">{localDateKey(e.at, TZ).slice(5)} {formatTime(e.at, TZ)}</code> <strong>{e.name}</strong>{' '}
              <span className="muted">{JSON.stringify({ ...(e.playerId ? { player: e.playerId } : {}), ...e.detail })}</span>
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}
