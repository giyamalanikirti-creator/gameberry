import { useState } from 'react';
import { DAY, HOUR } from '../domain/time';
import { atLabel, dayOf, DEMO_DAY, nameOf, PEOPLE, type RivalryState, type Viewer } from './model';
import type { Action } from './reducer';

export type Send = (action: Action) => RivalryState;

export interface PanelProps {
  state: RivalryState;
  viewer: Viewer;
  setViewer: (viewer: Viewer) => void;
  advance: (to: number) => void;
  send: Send;
  reduced: boolean;
  setReduced: (reduced: boolean) => void;
  reset: () => void;
}

export function Controls({ state, viewer, setViewer, advance, send, reduced, setReduced, reset }: PanelProps) {
  const [confirmReset, setConfirmReset] = useState(false);
  const next = state.cards.filter(card => card.status === 'confirmed' && card.pair.includes(viewer))
    .map(card => card.window!.start).sort((a, b) => a - b)[0];
  return <div className="rv-control-stack">
    <div className="rv-roles" aria-label="Player perspectives">
      {(['riya', 'gunjan'] as const).map(person => <button key={person} className="rv-role"
        aria-pressed={viewer === person} onClick={() => setViewer(person)}>
        <span className={`rv-avatar rv-${person}`} aria-hidden="true">{PEOPLE[person].initials}</span>
        <span>View as {nameOf(person)}</span>
      </button>)}
    </div>
    <fieldset>
      <legend>Demo clock · {atLabel(state.now, viewer)} IST</legend>
      <div className="rv-action-grid">
        <button onClick={() => advance(state.now + HOUR)}>Skip 1 hour</button>
        <button onClick={() => advance(next && dayOf(next, viewer) === dayOf(state.now + DAY, viewer) ? next : state.now + DAY)}>Skip to tomorrow</button>
        <button disabled={!next} onClick={() => advance(next)}>Skip to window</button>
        {state.cards.some(card => card.status === 'open' && card.pair.includes(viewer)) &&
          <button onClick={() => advance(Math.min(...state.cards.filter(card => card.status === 'open' && card.pair.includes(viewer)).map(card => card.window!.end)))}>
            Skip to window close
          </button>}
      </div>
    </fieldset>
    <fieldset>
      <legend>Play options</legend>
      <label><input type="checkbox" checked={state.guided} onChange={e => send({ type: 'setting', key: 'guided', value: e.target.checked, actor: viewer })} />
        Demo dice and starting positions</label>
      <label><input type="checkbox" checked={state.autoGunjan} onChange={e => send({ type: 'setting', key: 'autoGunjan', value: e.target.checked, actor: viewer })} />
        Auto-play Gunjan while viewing Riya</label>
      <label><input type="checkbox" checked={reduced} onChange={e => setReduced(e.target.checked)} /> Reduce motion</label>
      <label><input type="checkbox" checked={state.sound} onChange={e => send({ type: 'setting', key: 'sound', value: e.target.checked, actor: viewer })} /> Sound effects</label>
    </fieldset>
    <div className="rv-control-links">
      <a href="?series=1">Doubles & Grudge Night</a>
      <button className="rv-text" onClick={() => { if (confirmReset) reset(); else setConfirmReset(true); }}>{confirmReset ? 'Confirm reset' : 'Reset demo'}</button>
    </div>
  </div>;
}

const FUNNEL = [
  { name: 'Capture card shown', rate: 65, event: 'badla_card_shown' },
  { name: 'Invite sent', rate: 22, event: 'badla_asked' },
  { name: 'Invite accepted', rate: 60, event: 'invite_response', accepts: true },
  { name: 'Set for tomorrow', rate: 50, event: 'appointment_confirmed', tomorrow: true },
  { name: 'Both turn up', rate: 66, event: 'match_start', checkIn: true },
  { name: 'Played on an otherwise inactive day', rate: 60, event: 'badla_played', incremental: true },
] as const;
const PRESETS = { Low: [22, 1.74], Base: [34, 2.26], High: [45, 2.82] } as const;

export function liftFor(participants: number, days: number) {
  const lift = Math.round(participants * days / 7.5 * 10) / 10;
  return { lift, extraDAU: Math.round(lift * 15) };
}

function Calculator() {
  const [participants, setParticipants] = useState<number>(34);
  const [days, setDays] = useState<number>(2.26);
  const { lift, extraDAU } = liftFor(participants, days);
  return <section className="rv-metric">
    <h2>DAU calculator</h2>
    <div className="rv-lift"><strong>+{lift.toFixed(1)}%</strong><span>+{extraDAU}K daily users</span></div>
    <p className="rv-caption">1.5M DAU · 25% DAU/MAU · 7.5 active days per month</p>
    <div className="rv-presets">{Object.entries(PRESETS).map(([label, [share, extra]]) => <button key={label}
      aria-pressed={share === participants && extra === days} onClick={() => { setParticipants(share); setDays(extra); }}>{label}</button>)}</div>
    <label>Monthly players reached <strong>{participants}%</strong>
      <input type="range" min="0" max="70" value={participants} onChange={e => setParticipants(Number(e.target.value))} />
    </label>
    <label>Extra active days per participant <strong>{days.toFixed(2)}</strong>
      <input type="range" min="0" max="5" step=".01" value={days} onChange={e => setDays(Number(e.target.value))} />
    </label>
    <p className="rv-caption">Illustrative inputs from the case model. Replace with Ludo STAR analytics.</p>
  </section>;
}

export function Metrics({ state, viewer }: { state: RivalryState; viewer: Viewer }) {
  const badlaPlayed = state.matches.filter(match => match.mode === 'badla' && match.endedAt &&
    state.cards.some(card => card.id === match.cardId && card.window && card.visit.includes(viewer) &&
      state.activities.some(activity => activity.incremental && activity.person === viewer && activity.date === dayOf(card.window!.start, viewer))));
  return <div className="rv-metrics">
    <section className="rv-metric">
      <h2>{nameOf(viewer)}’s active days</h2>
      <ol className="rv-days">{Array.from({ length: 7 }, (_, i) => {
        const date = dayOf(DEMO_DAY + i * DAY, viewer);
        const entry = state.activities.find(activity => activity.person === viewer && activity.date === date);
        return <li key={date} className={entry?.incremental ? 'rv-incremental' : entry ? 'rv-active-day' : undefined}
          aria-label={`Day ${i + 1}${entry ? entry.incremental ? ', incremental active day' : ', active' : ', inactive'}`} title={date}>
          <strong>{i + 1}</strong><span aria-hidden="true">{entry ? '✓' : '·'}</span>
        </li>;
      })}</ol>
      <p className="rv-caption">{state.activities.some(entry => entry.person === viewer && entry.incremental)
        ? 'Incremental active day · created by Badla' : 'An appointment adds a day when the player opens it on their return.'}</p>
    </section>
    <section className="rv-metric">
      <h2>Appointment funnel</h2>
      <ul className="rv-funnel">{FUNNEL.map(stage => {
        const reached = 'incremental' in stage ? !!badlaPlayed.length : 'checkIn' in stage
          ? state.cards.some(card => card.ready.length === 2)
          : state.events.some(event => event.name === stage.event &&
            (!('accepts' in stage) || event.detail?.response !== 'pass') &&
            (!('tomorrow' in stage) || event.detail?.tomorrow === true));
        return <li key={stage.name} className={reached ? 'rv-reached' : ''}>
          <span aria-hidden="true">{reached ? '✓' : '○'}</span><span>{stage.name}</span><strong>{stage.rate}%</strong>
        </li>;
      })}</ul>
    </section>
    <Calculator />
    <section className="rv-metric">
      <h2>Event log</h2>
      {!state.events.length && <p className="rv-caption">Play a match to see events here.</p>}
      <ol className="rv-events">{state.events.slice(-60).reverse().map((event, i) =>
        <li key={state.events.length - i}><time>{atLabel(event.at, event.actor)}</time><span>{nameOf(event.actor)}</span>
          <strong>{event.name}</strong>{event.detail && <code>{Object.entries(event.detail).map(([key, value]) => `${key}=${value}`).join(' · ')}</code>}</li>)}</ol>
    </section>
  </div>;
}
