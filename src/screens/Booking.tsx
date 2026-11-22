import { useMemo, useState } from 'react';
import { formatSlot } from '../domain/time';
import { bookingConfirmedBy, bookingCount, canHostGrudgeNight, liveFixtureForRound, rosterOrInvited } from '../state/selectors';
import { Avatar, Card, Gold, SeriesScore, Waiting } from '../ui/kit';
import { suggestedSlots } from './Challenge';
import { Back, Terminal, sentAt, useMe } from './common';
import { useTarget } from '../ui/shell';

function HostForm({ seriesId }: { seriesId: string }) {
  const { state, me, now, tz, dispatch, go } = useMe();
  const slots = useMemo(() => suggestedSlots(now, tz, state.players[me].usualPlayHours), [now, tz, me, state.players]);
  const [picked, setPicked] = useState<number[]>([0]);
  const [err, setErr] = useState<string | null>(null);
  const offerT = useTarget('grudge-night', 'btn btn-ember btn-big');
  const series = state.series[seriesId];
  if (!series?.captainIds.includes(me) || !canHostGrudgeNight(state, seriesId)) {
    return <Terminal title="Grudge Night isn't available" body="It needs 1-1 after a Doubles round, with all four players in one club. A private decider is still possible." />;
  }
  return (
    <div className="screen">
      <Back />
      <p className="eyebrow">Make it a Grudge Night · decider · club fixture</p>
      <h1 className="title">Book the decider</h1>
      <SeriesScore state={state} seriesId={seriesId} />
      <fieldset className="choice">
        <legend>Offer up to two slots (the other captain picks one)</legend>
        {slots.map((w, i) => (
          <label key={w.start} className={`slot${picked.includes(i) ? ' on' : ''}`}>
            <input type="checkbox" checked={picked.includes(i)} onChange={() => setPicked((p) => (p.includes(i) ? p.filter((x) => x !== i) : [...p, i]))} />
            {formatSlot(w, now, tz)} <span className="tz">IST</span>
          </label>
        ))}
      </fieldset>
      <p className="muted small">2v2, 100 gold a seat, 400 pot. Each captain brings backup. All four confirm the time, the entry and club visibility. The card appears in Chai & Dice Club only after the fourth confirmation.</p>
      {err && <p className="error" role="alert">{err}</p>}
      <button
        type="button"
        {...offerT}
        disabled={picked.length === 0}
        onClick={() => {
          const r = dispatch({ type: 'HOST_GRUDGE_NIGHT', seriesId, slots: picked.map((i) => slots[i]) });
          if (!r.accepted) return setErr(r.reason ?? 'Could not host');
          go({ name: 'booking', id: r.ref! });
        }}
      >
        Offer {picked.length === 1 ? 'this slot' : 'these slots'}
      </button>
      <button type="button" className="btn btn-quiet" onClick={() => go({ name: 'challenge', seriesId })}>Private decider instead</button>
    </div>
  );
}

/** Screen 9. */
export function BookingScreen({ id }: { id: string }) {
  const { state, me, now, tz, dispatch, go } = useMe();
  const [choice, setChoice] = useState(0);
  const [err, setErr] = useState<string | null>(null);
  const chooseT = useTarget('choose-slot', 'btn btn-ember btn-big');
  const confirmT = useTarget('confirm-booking', 'btn btn-ember btn-big');
  if (id.startsWith('new:')) return <HostForm seriesId={id.slice(4)} />;
  const b = state.bookings[id];
  if (!b) return <Terminal title="Not available" body="This booking does not exist." />;
  const r = state.rounds[b.roundId];
  const series = state.series[r.seriesId!];
  const roster = rosterOrInvited(state, r);
  if (!roster.includes(me)) return <Terminal title="Not available" body="This booking is for the four players in the decider." />;
  const isCaptain = series.captainIds.includes(me);
  const host = state.players[b.hostId];
  const chooser = state.players[series.captainIds.find((p) => p !== b.hostId)!];
  const count = bookingCount(state, b);
  const fixture = liveFixtureForRound(state, r.id);
  const act = (res: { accepted: boolean; reason?: string }) => setErr(res.accepted ? null : res.reason ?? null);

  if (b.status === 'withdrawn') {
    return (
      <Terminal title="This booking was withdrawn" body="The slot and any club listing are closed. Open the round to see what happens next.">
        <button type="button" className="btn btn-quiet" onClick={() => go({ name: 'round', id: r.id })}>Open the round</button>
      </Terminal>
    );
  }

  return (
    <div className="screen">
      <Back />
      <p className="eyebrow">{r.clubVisible ? 'Grudge Night' : 'Decider'} · hosted by {host.name}</p>
      <h1 className="title">Book the decider</h1>
      <SeriesScore state={state} seriesId={series.id} />

      {b.status === 'offered' && (
        me === chooser.id ? (
          <fieldset className="choice">
            <legend>{host.name} offered {b.proposedSlots.length === 1 ? 'a slot' : 'two slots'}. Pick one:</legend>
            {b.proposedSlots.map((w, i) => (
              <label key={w.start} className={`slot${choice === i ? ' on' : ''}`}>
                <input type="radio" name="slot" checked={choice === i} onChange={() => setChoice(i)} /> {formatSlot(w, now, tz)} <span className="tz">IST</span>
              </label>
            ))}
            <button type="button" {...chooseT} onClick={() => act(dispatch({ type: 'CHOOSE_SLOT', bookingId: b.id, slotIndex: choice }))}>
              Choose · confirm 100 gold entry
            </button>
          </fieldset>
        ) : (
          <Waiting who={chooser.name} since={sentAt(r.createdAt, tz)} what={`Waiting for ${chooser.name} to choose a slot`} />
        )
      )}

      {b.chosenSlot !== null && (
        <Card tone="ember">
          <p className="time-big">{formatSlot(b.proposedSlots[b.chosenSlot], now, tz)} <span className="tz">IST</span></p>
          <p className="small">Doubles · entry <Gold amount={100} /> · {r.clubVisible ? 'listed in Chai & Dice Club as Grudge Night' : 'private'}</p>
          <p className="countdown num">{count.done} of {count.need} confirmed</p>
          <ul className="confirm-list">
            {roster.map((p) => (
              <li key={p}><Avatar state={state} id={p} size={22} /> {state.players[p].name} {bookingConfirmedBy(state, b, p) ? <span className="ok">confirmed</span> : <span className="muted">waiting</span>}</li>
            ))}
          </ul>
          {b.status === 'chosen' && !bookingConfirmedBy(state, b, me) && (
            <button type="button" {...confirmT} onClick={() => act(dispatch({ type: 'CONFIRM_BOOKING', bookingId: b.id }))}>
              Confirm · 100 gold entry{r.clubVisible ? ' · club-visible' : ''}
            </button>
          )}
          {fixture && (
            <button type="button" className="btn btn-quiet" onClick={() => go({ name: 'fixture', id: fixture.id })}>See the club fixture</button>
          )}
        </Card>
      )}
      {err && <p className="error" role="alert">{err}</p>}
      <div className="stack">
        {isCaptain && <button type="button" className="btn btn-quiet" onClick={() => act(dispatch({ type: 'PLAY_NOW_INSTEAD', roundId: r.id }))}>Play now instead</button>}
        {isCaptain && fixture && <button type="button" className="btn btn-quiet" onClick={() => act(dispatch({ type: 'WITHDRAW_LISTING', fixtureId: fixture.id }))}>Keep it private · withdraw the club listing</button>}
        <button type="button" className="btn btn-quiet" onClick={() => go({ name: 'round', id: r.id })}>Open the round</button>
        <button type="button" className="btn btn-quiet" onClick={() => act(dispatch({ type: 'LEAVE_SERIES', seriesId: series.id }))}>Leave series</button>
      </div>
    </div>
  );
}
