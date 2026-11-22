import { useState } from 'react';
import { FINISH_INDEX } from '../board/geometry';
import { formatCountdown, WINDOW_LENGTH } from '../domain/time';
import {
  balance, CAPTAINS, currentRound, entryFor, FRIENDS, isBlocked, isCaptain, PLAYERS, rival,
  seatFor, seriesStatus, teamName, terminal, type PlayerId, type Round,
} from './model';
import { actionFor, DeciderActions, ParticipantChip, type ScreenProps } from './screens';
import { BoardView, Bonus, GoldReceipt, PlayerChip, Score, Stakes, windowLabel } from './widgets';

function ContinueAs({ player, handoff }: { player: PlayerId; handoff: ScreenProps['handoff'] }) {
  return <button className="bd-small bd-handoff" onClick={() => handoff(player)}>Continue as {PLAYERS[player].name}</button>;
}

function RoundSeatList({ round, state }: { round: Round; state: ScreenProps['state'] }) {
  const status = (player: PlayerId) => {
    const seat = seatFor(round, player)!;
    if (round.game) return round.game.pawns.find(pawn => pawn.player === player)?.position === FINISH_INDEX ? 'Home' : 'On board';
    if (round.status === 'check-in' && balance(state, player) < entryFor(round.format)) return 'Needs more gold';
    if (seat.ready) return 'Ready';
    if (round.status === 'check-in') return 'Awaiting check-in';
    if (round.status === 'proposed' && round.proposer === player) return 'Proposed';
    if (seat.consent === round.revision) return 'Confirmed';
    if (seat.consent !== null) return 'Review updated roster';
    return 'Awaiting response';
  };
  return <div className="bd-team-grid">
    {CAPTAINS.map(side => <section className={`bd-team bd-team-${side}`} key={side} aria-label={`Team ${PLAYERS[side].name}`}>
      <h3>Team {PLAYERS[side].name}</h3>
      {round.seats.filter(seat => seat.side === side).map(seat =>
        <div className="bd-seat" key={seat.player}><PlayerChip player={seat.player} seat={seat} /><small>{status(seat.player)}</small></div>)}
      {round.format === 'doubles' && round.seats.filter(seat => seat.side === side).length === 1 &&
        <div className="bd-seat"><strong>Open seat</strong><small>Partner needed</small></div>}
    </section>)}
  </div>;
}

function PendingTable({ props, round }: { props: ScreenProps; round: Round }) {
  const { state, viewer, now, send, handoff, go } = props;
  const seat = seatFor(round, viewer)!;
  const offer = round.status === 'proposed';
  const filling = round.status === 'filling';
  const checking = round.status === 'check-in';
  const window = round.booking.window;
  const isProposer = round.proposer === viewer;
  const captain = isCaptain(viewer);
  const terms = actionFor(round);
  const isInvitedPartner = filling && !captain && seat.consent !== round.revision;
  const pendingPartner = round.seats.find(item => !isCaptain(item.player) && item.consent !== round.revision && item.player !== viewer);
  const vacantSide = CAPTAINS.find(side => round.seats.filter(item => item.side === side).length < 2);
  const needsPartner = filling && captain && !round.booking.club && round.format === 'doubles' &&
    !round.seats.some(item => item.side === viewer && item.player !== viewer);
  const balanceShort = balance(state, viewer) < entryFor(round.format);
  const nextReady = round.seats.find(item => !item.ready && item.player !== viewer);
  const nextApproval = round.seats.find(item => item.consent !== round.revision && item.player !== viewer &&
    (!isCaptain(item.player) || round.booking.mode === 'scheduled'));
  const booked = round.status === 'confirmed';
  const canConfirm = seat.consent !== round.revision && (!captain || (round.seats.length === 4 && round.booking.mode === 'scheduled'));
  const nextToConfirm = round.booking.club ? nextApproval?.player
    : vacantSide && vacantSide !== viewer ? vacantSide : (pendingPartner ?? nextApproval)?.player;

  return <>
    <section className="bd-hero">
      <p className="bd-kicker">{round.booking.club ? 'Club decider' : round.number === 3 ? 'Private decider' : 'Round 2'}</p>
      <h1>{round.booking.club ? 'Grudge Night' : round.format === 'doubles' ? 'Badla Doubles' : 'Badla Singles'}</h1>
      <Score state={state} />
      {isInvitedPartner && <p>{seat.side === 'riya' && round.number === 2 ? 'Riya is down 0–1 to Gunjan. Join her side?' : `Join ${PLAYERS[seat.side].name} for ${round.number === 3 ? 'the decider' : 'a chance to sweep'}?`} Entry 100 gold. Win 200 back.</p>}
      {window ? <p>{round.booking.mode === 'scheduled' ? windowLabel(window) : 'Play now · five-minute join window'}</p> :
        !round.booking.club && <p>{round.booking.choices[0] ? windowLabel({ start: round.booking.choices[0], end: round.booking.choices[0] + WINDOW_LENGTH }) : 'Play now · five minutes once confirmed'}</p>}
      {checking && window && <p className="bd-countdown">{round.seats.filter(item => item.ready).length}/{round.seats.length} ready · {formatCountdown(window.end - now)} left</p>}
      {booked && <p className="bd-note">Your booking is confirmed. Check-in opens at the start.</p>}
    </section>
    <section className="bd-panel">
      <h2>{checking ? 'Check in' : 'Table seats'}</h2>
      <RoundSeatList round={round} state={state} />
      {round.declined.length > 0 && <p className="bd-note">{round.declined.map(player => PLAYERS[player].name).join(', ')} declined or withdrew. A captain can choose a replacement.</p>}
      <Stakes format={round.format} />
      <Bonus state={state} viewer={viewer} at={window?.start ?? round.booking.choices[0] ?? now} format={round.format} side={seat.side} />
      <p className="bd-note">Entries are charged together when everyone checks in.</p>
    </section>
    <section className="bd-panel bd-actions">
      {offer && isProposer && <>
        <h2>Invitation sent to {PLAYERS[rival(round.proposer)].name}</h2>
        <ContinueAs player={rival(round.proposer)} handoff={handoff} />
      </>}
      {offer && !isProposer && captain && <>
        <h2>{PLAYERS[round.proposer].name} invited you</h2>
        {round.booking.club ? <>
          <p>Choose a slot. All four players will then confirm the entry and club visibility.</p>
          {round.booking.choices.filter(start => start > now).map(start =>
            <button key={start} onClick={() => send({ type: 'selectTime', start, ...terms })}>
              Choose {windowLabel({ start, end: start + WINDOW_LENGTH })}
            </button>)}
        </> : <button className="bd-primary" onClick={() => send({ type: 'accept', ...terms })}>Accept challenge</button>}
        <button className="bd-quiet" onClick={() => { send({ type: 'pass', ...terms }); go('lobby'); }}>Pass</button>
      </>}
      {offer && !captain && <p>Waiting for the captains to agree on a time.</p>}
      {filling && needsPartner && <>
        <h2>Invite a partner</h2>
        <p>Choose one friend for Team {PLAYERS[viewer].name}.</p>
        {FRIENDS.filter(friend => !seatFor(round, friend) && !isBlocked(state, viewer, friend)).map(friend =>
          <button key={friend} onClick={() => send({ type: 'invite', player: friend, roundId: round.id })}>Invite {PLAYERS[friend].name}</button>)}
      </>}
      {filling && round.booking.club && <p>Club visibility · {state.club.name} will see the fixture after all four confirmations.</p>}
      {filling && canConfirm && <>
        <button className="bd-primary" onClick={() => send({ type: isInvitedPartner && !round.booking.club ? 'accept' : 'confirm', ...terms })}>
          {round.booking.club ? 'Confirm time, entry & club visibility' : isInvitedPartner && seat.consent === null ? 'Accept partner invite' : captain && seat.consent === null ? 'Confirm time & entry' : 'Confirm updated table'}
        </button>
        {isInvitedPartner && <button className="bd-quiet" onClick={() => { send({ type: 'pass', ...terms }); go('lobby'); }}>Decline partner invite</button>}
      </>}
      {filling && nextToConfirm && <ContinueAs player={nextToConfirm} handoff={handoff} />}
      {checking && <>
        <h2>{seat.ready ? 'You’re ready' : 'Ready to play?'}</h2>
        {balanceShort && <p role="status">You need {entryFor(round.format)} gold. Your balance is {balance(state, viewer)} gold.</p>}
        {!seat.ready && <button className="bd-primary" disabled={balanceShort} onClick={() => send({ type: 'ready', ...terms })}>Ready · {entryFor(round.format)} gold entry</button>}
        {nextReady && <ContinueAs player={nextReady.player} handoff={handoff} />}
      </>}
      {booked && round.booking.club && <>
        <button onClick={() => go(`fixture/fixture-${round.id}`)}>View club fixture</button>
        <ContinueAs player="dev" handoff={handoff} />
      </>}
      {(captain || !offer) && !(offer && !isProposer) &&
        <button className="bd-quiet" onClick={() => send({ type: 'cancel', roundId: round.id })}>{captain ? 'Cancel invitation or booking' : 'Withdraw from table'}</button>}
      <button className="bd-quiet" onClick={() => go('lobby')}>Back to lobby</button>
    </section>
  </>;
}

function Match({ props, round, showResult }: { props: ScreenProps; round: Round; showResult: () => void }) {
  const { state, viewer, send, handoff, reduced } = props;
  const game = round.game!;
  const pawn = game.pawns[game.turn];
  const finished = round.status === 'settled';
  const myTurn = !finished && pawn.player === viewer;
  const roll = () => send({ type: 'roll', roundId: round.id, rolls: game.rolls });
  const move = () => {
    const next = send({ type: 'move', roundId: round.id, rolls: game.rolls });
    if (next.rounds.some(item => item.id === round.id && item.status === 'settled')) showResult();
  };
  const note = game.note && (game.note.kind === 'overshot'
    ? `${PLAYERS[game.note.player].name} rolled ${game.note.roll} and needed ${game.note.remaining}. Turn passes.`
    : game.note.kind === 'finished' ? `${PLAYERS[game.note.player].name} brought their token home.`
      : `${PLAYERS[game.note.player].name} moved ${game.note.roll}. ${game.note.remaining} to home.`);
  return <section className="bd-panel bd-match">
    <header><p className="bd-kicker">Quick endgame · Demo variant</p><h1>{round.booking.club ? 'Grudge Night' : round.format === 'doubles' ? 'Badla Doubles' : 'Badla Singles'}</h1></header>
    <Score state={state} />
    <div className="bd-turn" aria-live="polite" aria-atomic="true">
      <strong>{finished ? `${teamName(round, round.winner!)} win` : `${PLAYERS[pawn.player].name}’s turn`}</strong>
      <span>{finished ? 'Final move' : game.die === null ? `${FINISH_INDEX - pawn.position} to home` : `Rolled ${game.die}`}</span>
    </div>
    <div className="bd-match-actions">
      {finished ? <button className="bd-primary" onClick={showResult}>View result</button>
        : myTurn ? game.die === null
          ? <button className="bd-primary" onClick={roll}>Roll dice</button>
          : <button className="bd-primary" onClick={move}>Move token {game.die} {game.die === 1 ? 'step' : 'steps'}</button>
        : <ContinueAs player={pawn.player} handoff={handoff} />}
    </div>
    <BoardView game={game} viewer={viewer} animate={!reduced} move={myTurn && game.die !== null ? move : undefined} />
    <p className="bd-note" aria-live="polite">{note ?? (game.die === null ? 'Roll an exact number to reach home.' : 'Tap the highlighted token to move.')}</p>
    <h2>Turn order</h2>
    <ol className="bd-turn-order">{game.pawns.map(item => <li key={item.player} aria-current={item.player === pawn.player && !finished ? 'step' : undefined}>
      <PlayerChip player={item.player} seat={item} /><small>{item.position === FINISH_INDEX ? 'Home' : `Team ${PLAYERS[item.side].name}`}</small>
    </li>)}</ol>
  </section>;
}

function Result({ props, round }: { props: ScreenProps; round: Round }) {
  const { state, viewer, send, go, handoff } = props;
  const assist = state.assists.find(item => item.player === viewer && item.roundId === round.id);
  const roundAssist = state.assists.find(item => item.roundId === round.id);
  const tiedRound = round.number === 2 && round.winner === 'riya';
  const boardScores = tiedRound ? 'Series level at 1–1' : round.number === 2 ? 'Series sweep · 2–0' : 'Series final · 2–1';
  const viewerSeat = seatFor(round, viewer)!;
  return <>
    <section className="bd-hero">
      <p className="bd-kicker">{assist ? 'Partner Assist' : boardScores}</p>
      <h1>{assist ? 'You helped Riya level the series' : `${teamName(round, round.winner!)} ${round.format === 'doubles' ? 'win' : 'wins'}`}</h1>
      {round.number === 2 ? <div className="bd-result-score" aria-label={boardScores}>{tiedRound ? '1–1' : '2–0'}</div> : <Score state={state} />}
      {assist && <p>You helped Riya take it to 1–1.</p>}
      {tiedRound && !isCaptain(viewer) && !assist && <p>One each. Defend the series with Gunjan?</p>}
      {round.reason === 'forfeit' && <p>The table recorded a forfeit.</p>}
      {assist && seriesStatus(state) === 'tied' && <button className="bd-primary" disabled={assist.saved}
        onClick={() => send({ type: 'saveSeat', roundId: round.id })}>{assist.saved ? 'Seat interest saved' : 'Save my seat for the decider'}</button>}
      {assist?.saved && <p className="bd-note">Confirm again once the time and price are agreed.</p>}
    </section>
    <GoldReceipt state={state} viewer={viewer} roundId={round.id} />
    <DeciderActions {...props} />
    {tiedRound && roundAssist && roundAssist.player !== viewer && !roundAssist.saved && !currentRound(state) && seriesStatus(state) === 'tied' &&
      <ContinueAs player={roundAssist.player} handoff={handoff} />}
    {tiedRound && !isCaptain(viewer) && seriesStatus(state) === 'tied' && <ContinueAs player={viewerSeat.side} handoff={handoff} />}
    {round.booking.club && <button onClick={() => go(`fixture/fixture-${round.id}`)}>View club result</button>}
    <button onClick={() => go('lobby')}>Back to lobby</button>
  </>;
}

export function RoundScreen({ props, id }: { props: ScreenProps; id: string }) {
  const { state, viewer, go } = props;
  const [finalBoard, setFinalBoard] = useState(false);
  const round = state.rounds.find(round => round.id === id);
  if (!round || !seatFor(round, viewer)) return <section className="bd-panel"><h1>Table unavailable</h1><button onClick={() => go('lobby')}>Back to lobby</button></section>;
  if (round.status === 'active' || (round.status === 'settled' && finalBoard)) {
    return <Match props={props} round={round} showResult={() => setFinalBoard(round.status === 'active')} />;
  }
  if (round.status === 'settled') return <Result props={props} round={round} />;
  if (!terminal(round)) return <PendingTable props={props} round={round} />;
  const heading = round.status === 'voided' ? 'Round voided' : round.reason === 'missed' ? 'Check-in closed' : round.status === 'expired' ? 'Invitation expired' : 'Table closed';
  return <>
    <section className="bd-hero"><h1>{heading}</h1><Score state={state} />
      <ParticipantChip round={round} viewer={viewer} />
      <p>{round.status === 'voided' ? 'Every entry was refunded. The series score is unchanged.' : 'No entries were charged for this round.'}</p>
    </section>
    {round.status === 'voided' && <GoldReceipt state={state} viewer={viewer} roundId={round.id} />}
    <DeciderActions {...props} />
    <button onClick={() => go('lobby')}>Back to lobby</button>
  </>;
}
