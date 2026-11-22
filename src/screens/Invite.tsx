import { useEffect, useRef, useState } from 'react';
import { formatSlot } from '../domain/time';
import { seriesScore } from '../state/selectors';
import { Avatar, Card, Gold, PriceSheet, SeriesScore, Waiting } from '../ui/kit';
import { Back, Terminal, sentAt, useMe } from './common';
import { TimePicker } from './Challenge';
import { suggestSlots } from '../smart/smartFixture';
import type { PlayerId, TimeWindow } from '../domain/types';
import { useTarget } from '../ui/shell';

/** Screens 3 and 5: the recipient's own invitation, or a read-only card in anyone else's session. */
export function InviteScreen({ id }: { id: string }) {
  const { state, me, now, tz, dispatch, go, peek } = useMe();
  const inv = state.invites[id];
  const [slot, setSlot] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [suggest, setSuggest] = useState(false);
  const acceptT = useTarget('accept-challenge', 'btn btn-ember btn-big');
  const joinT = useTarget('join-side', 'btn btn-ember btn-big');
  const logged = useRef(false);
  const mine = inv?.toPlayerId === me;

  useEffect(() => {
    if (!inv || logged.current || !mine) return;
    logged.current = true;
    if (inv.kind === 'partner') dispatch({ type: 'LOG', name: 'partner_invite_view', roundId: inv.roundId, seriesId: inv.seriesId ?? undefined });
  }, [inv, mine, dispatch]);

  if (!inv) return <Terminal title="Not available" body="This invitation does not exist." />;
  const r = state.rounds[inv.roundId];
  const from = state.players[inv.fromPlayerId];
  const to = state.players[inv.toPlayerId];
  const booking = r.bookingId ? state.bookings[r.bookingId] : null;
  const series = inv.seriesId ? state.series[inv.seriesId] : null;

  if (!mine) {
    return (
      <div className="screen">
        <Back />
        <Card tone="quiet">
          <p className="eyebrow">Read-only</p>
          <h1 className="card-h">This invitation is for {to.name}</h1>
          {inv.fromPlayerId === me && inv.status === 'open' && <Waiting who={to.name} since={sentAt(inv.sentAt, tz)} what={`Waiting for ${to.name} to accept`} />}
          {inv.status !== 'open' && <p className="muted">Status: {inv.status}.</p>}
          <p className="muted small">Only {to.name} can answer it, from {to.name}'s own session.</p>
          <button type="button" className="btn btn-quiet" onClick={() => go({ name: 'round', id: r.id })}>Open the round</button>
        </Card>
      </div>
    );
  }

  if (inv.status !== 'open') {
    return (
      <Terminal title={`This invitation is ${inv.status}`} body={inv.status === 'expired' ? 'It ran out before anyone answered. Nothing was charged.' : 'It can no longer be accepted from here.'}>
        <button type="button" className="btn btn-quiet" onClick={() => go({ name: 'round', id: r.id })}>See the round as it stands</button>
        <button type="button" className="btn btn-quiet" onClick={() => go({ name: 'home' })}>Home</button>
      </Terminal>
    );
  }

  const respond = (accept: boolean, customSlot?: TimeWindow) => {
    const res = inv.kind === 'challenge'
      ? dispatch({ type: 'RESPOND_CHALLENGE', inviteId: inv.id, accept, slotIndex: booking ? slot : undefined, customSlot })
      : dispatch({ type: 'RESPOND_PARTNER', inviteId: inv.id, accept });
    if (!res.accepted) return setError(res.reason ?? 'Could not respond');
    const after = peek().state.rounds[r.id];
    go(!accept ? { name: 'home' } : after.status === 'confirmed' && !after.clubVisible ? { name: 'booked', roundId: r.id } : { name: 'round', id: r.id });
  };

  if (inv.kind === 'partner') {
    const sc = seriesScore(state, series!.id);
    const side = state.seats[inv.seatId!].side;
    const mine = sc[side];
    const theirs = sc[side === 'A' ? 'B' : 'A'];
    const otherCap = state.players[series!.sides[side === 'A' ? 'B' : 'A']];
    const line = mine < theirs
      ? `${from.name} is down ${mine}-${theirs} to ${otherCap.name}. Join ${from.possessive} side?`
      : mine > theirs
        ? `${from.name} is ${mine}-${theirs} up on ${otherCap.name}. Help ${from.possessive === 'his' ? 'him' : 'her'} close it out?`
        : `${from.name} and ${otherCap.name} are level. Join ${from.possessive} side?`;
    return (
      <div className="screen">
        <Back />
        <p className="eyebrow">Partner Assist · Badla Doubles</p>
        <div className="invite-from"><Avatar state={state} id={from.id} size={48} /><h1 className="title">{line}</h1></div>
        <p className="big-price">Entry <Gold amount={100} />. Win <Gold amount={200} /> back.</p>
        <SeriesScore state={state} seriesId={series!.id} />
        <p className="muted small">The gold is only taken when all four seats tap Ready. You can decline and nothing happens.</p>
        <PriceSheet format="doubles" compact />
        {error && <p className="error" role="alert">{error}</p>}
        <button type="button" {...joinT} onClick={() => respond(true)}>Join {from.name}'s side · 100 gold on start</button>
        <button type="button" className="btn btn-quiet" onClick={() => respond(false)}>Decline</button>
      </div>
    );
  }

  return (
    <div className="screen">
      <Back />
      <p className="eyebrow">{r.isDecider ? 'Decider' : 'Badla challenge'} · {r.format === 'doubles' ? 'Doubles' : 'Singles'} · {r.timing === 'now' ? 'Play now' : 'Scheduled'}</p>
      <div className="invite-from"><Avatar state={state} id={from.id} size={48} /><h1 className="title">{from.name} wants Badla.</h1></div>
      {series && <SeriesScore state={state} seriesId={series.id} />}
      <p className="big-price">You pay <Gold amount={r.entryGold} /> · pot <Gold amount={400} /> · win <Gold amount={r.format === 'doubles' ? 200 : 400} /> back</p>
      <PriceSheet format={r.format} compact />
      {booking && (
        <fieldset className="choice">
          <legend>Pick a slot</legend>
          {booking.proposedSlots.map((w, i) => (
            <label key={w.start} className={`slot${slot === i ? ' on' : ''}`}>
              <input type="radio" name="slot" checked={slot === i} onChange={() => setSlot(i)} /> {formatSlot(w, now, tz)} <span className="tz">IST</span>
            </label>
          ))}
        </fieldset>
      )}
      <p className="muted small">Passing closes this quietly. The opening result stays exactly as it is.</p>
      {error && <p className="error" role="alert">{error}</p>}
      <button type="button" {...acceptT} onClick={() => respond(true)}>Accept · {r.entryGold} gold on start</button>
      {booking && (
        <button type="button" className="btn btn-quiet" aria-expanded={suggest} onClick={() => setSuggest((x) => !x)}>Suggest another time</button>
      )}
      {booking && suggest && (
        <div className="stack">
          {suggestSlots(now, [inv.fromPlayerId, me] as PlayerId[]).slice(0, 3).filter((x) => !booking.proposedSlots.some((p) => p.start === x.slot.start)).slice(0, 2).map((x) => (
            <button key={x.slot.start} type="button" className="slot" onClick={() => respond(true, x.slot)}>Suggest {formatSlot(x.slot, now, tz)} <span className="tz">IST</span></button>
          ))}
          <TimePicker now={now} tz={tz} onPick={(w) => respond(true, w)} />
          <p className="fine">{from.name} confirms the new time before anything is booked.</p>
        </div>
      )}
      <button type="button" className="link" onClick={() => respond(false)}>Pass</button>
    </div>
  );
}
