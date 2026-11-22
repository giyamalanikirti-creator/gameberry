import { useEffect, useState } from 'react';
import type { Color } from '../engine/board';
import { distanceOf, gameTokens } from '../engine/rules';
import { diceLabel } from '../engine/dice';
import { formatCountdown, formatSlot } from '../domain/time';
import type { PlayerId, Round, Side, TeamSeat } from '../domain/types';
import {
  balance,
  bookingCount,
  liveSeats,
  rosterIds,
  seatFor,
  seatIsStale,
  seriesStatus,
} from '../state/selectors';
import { Board, TokenMeta } from '../ui/Board';
import { Avatar, Card, SeriesScore, SideBadge, Waiting } from '../ui/kit';
import { Back, Terminal, sentAt, useMe } from './common';

function sideName(state: ReturnType<typeof useMe>['state'], r: Round, side: Side) {
  return `${state.players[state.series[r.seriesId!].sides[side]].name}'s side`;
}

function SeatRow({ seat, r, viewerSide, isCaptainView }: { seat: TeamSeat; r: Round; viewerSide: Side | null; isCaptainView: boolean }) {
  const { state, me, tz, dispatch } = useMe();
  const [pick, setPick] = useState(false);
  const series = state.series[r.seriesId!];
  const p = seat.playerId ? state.players[seat.playerId] : null;
  const ownSide = viewerSide === seat.side;
  const stale = seatIsStale(state, r, seat);
  const canSeeDetail = isCaptainView || ownSide;
  const myCaptainSeat = series.sides[seat.side] === me;
  const inv = seat.inviteId ? state.invites[seat.inviteId] : null;
  const status = stale ? 'Terms changed · Confirm again' : seat.status === 'ready' ? 'Ready' : seat.status === 'accepted' ? 'Confirmed' : seat.status === 'invited' ? 'Invited' : seat.status === 'open' ? (seat.lastPlayerId ? `${state.players[seat.lastPlayerId].name} declined` : 'Open seat') : seat.status;
  const funded = p ? balance(state, p.id) >= r.entryGold : false;
  const friends = state.players[me].friendIds.filter((f) => !rosterIds(state, r).includes(f) && !liveSeats(state, r).some((x) => x.playerId === f));

  return (
    <li className={`seat seat-${seat.status}${stale ? ' seat-stale' : ''}`}>
      <SideBadge side={seat.side} label={`${seat.side === 'A' ? 'A' : 'B'} · ${seat.seatRole}`} />
      {p ? <Avatar state={state} id={p.id} size={32} /> : <span className="seat-empty" aria-hidden="true">+</span>}
      <span className="seat-main">
        <strong>{p ? p.name : 'Partner seat'}{p?.id === me ? ' (you)' : ''}</strong>
        <small>
          {canSeeDetail || r.status === 'checkin' ? status : p ? 'Other team' : 'Open'}
          {canSeeDetail && p && inv && inv.status === 'open' ? ` · sent ${sentAt(inv.sentAt, tz)}` : ''}
          {r.status === 'checkin' && p && canSeeDetail ? ` · ${funded ? 'funded' : `needs ${r.entryGold} gold`}` : ''}
        </small>
      </span>
      {p?.id === me && stale && (
        <button type="button" className="btn btn-ember btn-sm" onClick={() => dispatch({ type: 'RENEW_TERMS', roundId: r.id })}>Confirm again</button>
      )}
      {myCaptainSeat && seat.seatRole === 'partner' && seat.status === 'open' && r.status !== 'active' && (
        pick ? (
          <span className="pick">
            {friends.length === 0 && <small>No friends free</small>}
            {friends.map((f) => (
              <button key={f} type="button" className="btn btn-ember btn-sm" onClick={() => { dispatch({ type: 'INVITE_PARTNER', roundId: r.id, toPlayerId: f }); setPick(false); }}>
                Invite {state.players[f].name}
              </button>
            ))}
          </span>
        ) : (
          <button type="button" className="btn btn-ember btn-sm" onClick={() => setPick(true)}>
            {seat.lastPlayerId ? `Replace ${state.players[seat.lastPlayerId].name}` : 'Invite a partner'}
          </button>
        )
      )}
      {myCaptainSeat && seat.seatRole === 'partner' && (seat.status === 'accepted' || seat.status === 'invited') && r.status !== 'active' && r.status !== 'checkin' && (
        <button type="button" className="btn btn-quiet btn-sm" onClick={() => dispatch({ type: 'REPLACE_PARTNER', seatId: seat.id })}>Replace</button>
      )}
    </li>
  );
}

function Endgame({ r }: { r: Round }) {
  const { state, me, dispatch, go } = useMe();
  const g = r.game!;
  const turnSeat = g.seats[g.turn];
  const myTurn = !g.winnerSide && turnSeat.playerId === me;
  const meta: Partial<Record<Color, TokenMeta>> = {};
  for (const s of g.seats) meta[s.color] = { name: state.players[s.playerId as PlayerId].name, shape: state.players[s.playerId as PlayerId].shape! };
  const mine = g.seats.find((s) => s.playerId === me);
  const name = (id: string) => state.players[id as PlayerId].name;
  const note = g.note;
  const noteText = note
    ? note.kind === 'overshoot'
      ? `${name(g.seats[note.seat].playerId)} rolled ${note.roll} but needs exactly ${note.needed}. Turn passes.`
      : note.kind === 'finished'
        ? `${name(g.seats[note.seat].playerId)} finishes on the exact ${note.roll}.`
        : `${name(g.seats[note.seat].playerId)} moves ${note.roll}, ${note.needed} to go.`
    : 'Match started.';
  const turnText = g.winnerSide
    ? `${sideName(state, r, g.winnerSide).replace("'s side", '')} & partner win`
    : myTurn
      ? g.die === null ? `Your turn · you need exactly ${distanceOf(turnSeat.pos)}` : `You rolled ${g.die}. Tap your token.`
      : `${name(turnSeat.playerId)} needs exactly ${distanceOf(turnSeat.pos)}`;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!myTurn) return;
      if ((e.key === 'r' || e.key === 'R') && g.die === null) dispatch({ type: 'ROLL', roundId: r.id });
      if ((e.key === 'm' || e.key === 'M') && g.die !== null) dispatch({ type: 'MOVE', roundId: r.id });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  const winners = g.winnerSide ? g.seats.filter((s) => s.side === g.winnerSide).map((s) => name(s.playerId)).join(' & ') : '';
  return (
    <div className="endgame">
      <div className="hud" aria-live="polite">
        <span className="hud-turn">{g.winnerSide ? `${winners} win` : turnText}</span>
        <span className="hud-score"><SeriesScore state={state} seriesId={r.seriesId!} /></span>
      </div>
      <ol className="turn-order" aria-label="Turn order">
        {g.seats.map((s, i) => (
          <li key={s.playerId} className={`${i === g.turn && !g.winnerSide ? 'now' : ''} ${s.pos === 56 ? 'done' : ''}`}>
            <Avatar state={state} id={s.playerId as PlayerId} size={22} />
            <span>{name(s.playerId)}</span>
            <small>{s.pos === 56 ? 'home' : `${distanceOf(s.pos)} to go`}</small>
          </li>
        ))}
      </ol>
      <Board
        tokens={gameTokens(g)}
        meta={meta}
        perspective={mine?.color ?? null}
        label={`Quick endgame. ${turnText}`}
        focus={g.moves.length ? [{ color: g.seats[g.moves[g.moves.length - 1].seat].color, tokenIndex: 3 }] : []}
        movable={myTurn && g.die !== null ? { color: turnSeat.color, tokenIndex: 3, steps: g.die, onMove: () => dispatch({ type: 'MOVE', roundId: r.id }) } : null}
        active={g.seats.map((s) => s.color)}
      />
      <p className="note" role="status">{noteText}</p>
      <div className="roll-row">
        <span className="die num" aria-label={g.die ? `Die shows ${g.die}` : 'No die rolled'}>{g.die ?? '–'}</span>
        {g.winnerSide ? (
          rosterIds(state, r).includes(me) ? (
            <button type="button" className="btn btn-ember btn-big" onClick={() => go({ name: 'receipt', roundId: r.id })}>See your result</button>
          ) : null
        ) : myTurn ? (
          g.die === null ? (
            <button type="button" className="btn btn-ember btn-big btn-roll" onClick={() => dispatch({ type: 'ROLL', roundId: r.id })}>Roll</button>
          ) : (
            <button type="button" className="btn btn-ember btn-big btn-roll" onClick={() => dispatch({ type: 'MOVE', roundId: r.id })}>Move {g.die}</button>
          )
        ) : (
          <Waiting who={name(turnSeat.playerId)} what={`Waiting for ${name(turnSeat.playerId)} to ${g.die === null ? 'roll' : 'move'}`} />
        )}
      </div>
      <p className="fine">Quick endgame · demo variant · {diceLabel(g.dice)} · keys: R roll, M move</p>
    </div>
  );
}

/** Screens 4, 6 and 7, plus the terminal states of a round. */
export function RoundScreen({ id }: { id: string }) {
  const { state, me, now, tz, dispatch, go } = useMe();
  const [msg, setMsg] = useState<string | null>(null);
  const r = state.rounds[id];
  if (!r || !r.seriesId) return <Terminal title="Not available" body="This round does not exist." />;
  const series = state.series[r.seriesId];
  const viewerSeat = seatFor(state, r, me);
  const isCaptain = series.captainIds.includes(me);
  if (!viewerSeat && !isCaptain) return <Terminal title="Not available" body="You have no seat in this round." />;
  const viewerSide = viewerSeat?.side ?? (series.sides.A === me ? 'A' : series.sides.B === me ? 'B' : null);
  const seats = liveSeats(state, r);
  const filled = seats.filter((s) => s.playerId && (s.status === 'accepted' || s.status === 'ready')).length;
  const need = r.format === 'doubles' ? 4 : 2;
  const booking = r.bookingId ? state.bookings[r.bookingId] : null;
  const act = (res: { accepted: boolean; reason?: string }) => setMsg(res.accepted ? null : res.reason ?? null);

  const header = (
    <>
      <Back />
      <p className="eyebrow">{r.isDecider ? (r.clubVisible ? 'Grudge Night · decider' : 'Decider') : `Round ${r.index}`} · {r.format === 'doubles' ? 'Badla Doubles' : 'Badla singles'} · {r.entryGold} gold a seat</p>
    </>
  );

  if (r.status === 'active' || (r.status === 'settled' && r.game)) {
    return <div className="screen screen-game">{header}<Endgame r={r} /></div>;
  }
  if (r.status === 'settled') {
    return <div className="screen">{header}<Terminal title="Settled" body="This round has a recorded result."><button type="button" className="btn btn-ember" onClick={() => go({ name: 'receipt', roundId: r.id })}>See your result</button></Terminal></div>;
  }
  if (r.status === 'expired' || r.status === 'cancelled' || r.status === 'voided') {
    const canRebook = r.status === 'expired' && isCaptain && !r.rebookedToId && r.window && seriesStatus(state, series.id) !== 'won';
    return (
      <div className="screen">
        {header}
        <Terminal
          title={r.status === 'expired' ? 'This round expired' : r.status === 'voided' ? 'This round was voided' : 'This round was cancelled'}
          body={`${r.closedReason ?? ''}. ${r.status === 'voided' ? 'Every entry was refunded once.' : 'No gold moved.'} The series score is unchanged.`}
        >
          <SeriesScore state={state} seriesId={series.id} />
          {canRebook && <button type="button" className="btn btn-ember" onClick={() => { const res = dispatch({ type: 'REBOOK', roundId: r.id }); if (res.ref) go({ name: 'round', id: res.ref }); }}>Rebook once · Play now</button>}
          {r.rebookedToId && <button type="button" className="btn btn-quiet" onClick={() => go({ name: 'round', id: r.rebookedToId! })}>Go to the rebooked round</button>}
          {isCaptain && !r.rebookedToId && r.status !== 'expired' && seriesStatus(state, series.id) !== 'won' && (
            <button type="button" className="btn btn-quiet" onClick={() => go({ name: 'challenge', seriesId: series.id })}>Send a new challenge</button>
          )}
          <button type="button" className="btn btn-quiet" onClick={() => go({ name: 'home' })}>Home</button>
        </Terminal>
      </div>
    );
  }

  const invOpen = Object.values(state.invites).find((i) => i.roundId === r.id && i.kind === 'challenge' && i.status === 'open');
  const otherCaptain = state.players[series.captainIds.find((p) => p !== me) ?? series.captainIds[0]];
  const notReady = seats.filter((s) => s.status !== 'ready');
  const stale = viewerSeat ? seatIsStale(state, r, viewerSeat) : false;

  return (
    <div className="screen">
      {header}
      <h1 className="title">{r.status === 'checkin' ? 'Waiting table' : r.status === 'proposed' ? 'Challenge sent' : r.status === 'confirmed' ? 'Booked' : `${filled} of ${need} seats filled`}</h1>
      <SeriesScore state={state} seriesId={series.id} />

      {r.status === 'proposed' && invOpen && (
        invOpen.toPlayerId === me
          ? <button type="button" className="btn btn-ember" onClick={() => go({ name: 'invite', id: invOpen.id })}>Answer {state.players[invOpen.fromPlayerId].name}'s challenge</button>
          : <Waiting who={otherCaptain.name} since={sentAt(invOpen.sentAt, tz)} what={`Waiting for ${otherCaptain.name} to accept`} />
      )}

      {r.status === 'checkin' && r.window && (
        <Card tone="ember">
          <p className="countdown num" aria-live="polite">
            {notReady.length === 0 ? 'All ready' : `Waiting for ${notReady.map((s) => state.players[s.playerId!]?.name ?? 'an empty seat').join(', ')} · ${formatCountdown(r.window.end - now)} left`}
          </p>
          <p className="muted small">{r.timing === 'now' ? 'Play now: 5-minute join window.' : `Agreed window ${formatSlot(r.window, now, tz)} IST.`} The round starts, and all {need} entries are debited together, when the last seat taps Ready.</p>
          {r.blockedStart && <p className="error" role="alert">{r.blockedStart.reason}</p>}
          {viewerSeat && viewerSeat.status === 'accepted' && !stale && (
            <button type="button" className="btn btn-ember btn-big" onClick={() => act(dispatch({ type: 'READY', roundId: r.id }))}>Ready · {r.entryGold} gold</button>
          )}
          {viewerSeat?.status === 'ready' && <p className="ok">You're ready. Your gold is taken only when everyone is.</p>}
        </Card>
      )}

      {r.status === 'confirmed' && r.window && (
        <Card>
          <p className="time-big">{formatSlot(r.window, now, tz)} <span className="tz">IST</span></p>
          <p className="muted small">Check-in opens at the start of the window. Nothing is charged before every seat is ready.</p>
        </Card>
      )}

      {booking && r.status === 'filling' && (
        <Card tone="quiet">
          <p>Booking: {booking.status === 'offered' ? 'waiting for a slot to be chosen' : `${bookingCount(state, booking).done} of ${bookingCount(state, booking).need} confirmed`}</p>
          <button type="button" className="btn btn-quiet" onClick={() => go({ name: 'booking', id: booking.id })}>Open booking</button>
        </Card>
      )}

      <ul className="seats" aria-label="Seats">
        {seats.map((s) => <SeatRow key={s.id} seat={s} r={r} viewerSide={viewerSide} isCaptainView={isCaptain} />)}
      </ul>
      <p className="fine">Sides: A = {sideName(state, r, 'A')}, B = {sideName(state, r, 'B')}.</p>

      {msg && <p className="error" role="alert">{msg}</p>}

      {r.singlesSwitch && (
        <Card tone="quiet">
          <p>{state.players[r.singlesSwitch.proposedBy].name} suggests switching to singles · 200 gold each, partner seats dissolve with no debit.</p>
          {isCaptain && r.singlesSwitch.proposedBy !== me && <button type="button" className="btn btn-ember" onClick={() => act(dispatch({ type: 'ACCEPT_SINGLES', roundId: r.id }))}>Agree · singles 200 gold</button>}
        </Card>
      )}

      <div className="stack">
        {isCaptain && r.format === 'doubles' && r.isDecider && !r.singlesSwitch && (
          <button type="button" className="btn btn-quiet" onClick={() => act(dispatch({ type: 'PROPOSE_SINGLES', roundId: r.id }))}>Suggest singles instead · 200 gold</button>
        )}
        {isCaptain && r.timing === 'scheduled' && r.status !== 'checkin' && (
          <button type="button" className="btn btn-quiet" onClick={() => act(dispatch({ type: 'PLAY_NOW_INSTEAD', roundId: r.id }))}>Play now instead</button>
        )}
        {isCaptain && r.status !== 'checkin' && (
          <button type="button" className="btn btn-quiet" onClick={() => act(dispatch({ type: 'CANCEL_ROUND', roundId: r.id }))}>Cancel round · no gold moves</button>
        )}
        {!isCaptain && viewerSeat && (
          <button type="button" className="btn btn-quiet" onClick={() => act(dispatch({ type: 'LEAVE_SERIES', seriesId: series.id }))}>Leave the series · give up my seat</button>
        )}
      </div>
    </div>
  );
}
