import { useState } from 'react';
import { DAY, HOUR, MINUTE, formatDateTime } from '../domain/time';
import {
  activePlayerDays, balance, currentRound, isBlocked, PLAYERS, type PlayerId,
} from './model';
import type { ScreenProps } from './screens';
import type { Session } from './storage';
import { Modal, PlayerChip, TIME_ZONE } from './widgets';

interface Props {
  props: ScreenProps;
  motion: Session['motion'];
  setMotion: (value: Session['motion']) => void;
  advance: (milliseconds: number) => void;
  switchViewer: (player: PlayerId) => void;
  onClose: () => void;
  reset: () => void;
}

export function DemoControls({ props, motion, setMotion, advance, switchViewer, onClose, reset }: Props) {
  const { state, viewer, now, send, go } = props;
  const live = currentRound(state);
  const window = live?.booking.window;
  const [balanceTarget, setBalanceTarget] = useState<PlayerId>('ananya');
  const [confirmReset, setConfirmReset] = useState(false);
  const notices = state.invites.filter(invite => invite.to === viewer).reverse();
  return <Modal title="Demo controls" onClose={onClose}>
    <section>
      <h3>View as</h3>
      <div className="bd-options bd-roles">
        {(Object.keys(PLAYERS) as PlayerId[]).map(player =>
          <button key={player} aria-pressed={viewer === player} onClick={() => { switchViewer(player); onClose(); }}><PlayerChip player={player} /></button>)}
      </div>
    </section>
    <section>
      <h3>Simulated time</h3>
      <p>{formatDateTime(now, TIME_ZONE)} IST</p>
      <div className="bd-options">
        {window && window.start > now && <button onClick={() => { advance(window.start - now); onClose(); }}>Advance to scheduled start</button>}
        {window && window.end > now && <button onClick={() => { advance(window.end - now); onClose(); }}>Advance to window close</button>}
        <button onClick={() => advance(5 * MINUTE)}>+5 min</button>
        <button onClick={() => advance(HOUR)}>+1 hour</button>
        <button onClick={() => advance(DAY)}>+1 day</button>
      </div>
    </section>
    <section>
      <h3>Local inbox</h3>
      {!notices.length && <p>No messages for {PLAYERS[viewer].name}.</p>}
      {notices.map(notice =>
        <button key={notice.id} onClick={() => { go(`notice/${notice.id}`); onClose(); }}>
          {notice.read ? '' : 'New · '}{notice.kind === 'check-in' ? 'Check-in reminder' : `Invitation from ${PLAYERS[notice.from].name}`}
        </button>)}
    </section>
    <section>
      <h3>Demo fixtures</h3>
      <label><input type="checkbox" checked={state.demo.bonus} disabled={!!state.series}
        onChange={event => send({ type: 'demo', change: { bonus: event.target.checked } })} /> Enable game-funded sweep bonus</label>
      <label>Next game dice
        <select value={state.demo.seed ?? 'guided'} onChange={event => send({
          type: 'demo', change: { seed: event.target.value === 'guided' ? null : Number(event.target.value) },
        })}>
          <option value="guided">Guided story</option>
          <option value="5">Alternate seed 5</option>
          <option value="14">Alternate seed 14</option>
        </select>
      </label>
      <label>Motion
        <select value={motion} onChange={event => setMotion(event.target.value === 'reduced' ? 'reduced' : 'system')}>
          <option value="system">Follow system</option><option value="reduced">Reduced motion</option>
        </select>
      </label>
      <label>Player for gold and club fixtures
        <select value={balanceTarget} onChange={event => setBalanceTarget(event.target.value as PlayerId)}>
          {(Object.keys(PLAYERS) as PlayerId[]).map(player => <option key={player} value={player}>{PLAYERS[player].name}</option>)}
        </select>
      </label>
      <div className="bd-options">
        <button disabled={live?.status === 'active'} onClick={() => {
          const openingBalance = state.demo.balances[balanceTarget] ?? 1000;
          const balances = { ...state.demo.balances, [balanceTarget]: openingBalance - balance(state, balanceTarget) + 50 };
          send({ type: 'demo', change: { balances } });
        }}>Set balance to 50 gold</button>
        <button disabled={live?.status === 'active' || state.demo.balances[balanceTarget] === undefined} onClick={() => {
          const balances = { ...state.demo.balances };
          delete balances[balanceTarget];
          send({ type: 'demo', change: { balances } });
        }}>Restore starting gold</button>
        <button onClick={() => send({ type: 'membership', player: balanceTarget })}>
          {state.club.members.includes(balanceTarget) ? 'Remove from club' : 'Add to club'}
        </button>
        <button aria-pressed={state.muted.includes(viewer)} onClick={() => send({ type: 'mute', player: viewer })}>Mute {PLAYERS[viewer].name}’s reminders</button>
        <button aria-pressed={isBlocked(state, 'riya', 'gunjan')} onClick={() => send({ type: 'block', player: 'riya', other: 'gunjan' })}>Block captain pair</button>
      </div>
      {live?.status === 'active' && <div className="bd-options">
        <button onClick={() => { send({ type: 'void', roundId: live.id }); onClose(); }}>Void live table</button>
        <button onClick={() => { send({ type: 'forfeit', roundId: live.id, loser: 'riya' }); onClose(); }}>Record Riya-side forfeit</button>
      </div>}
    </section>
    <details>
      <summary>Product events · {activePlayerDays(state.events)} active player-days</summary>
      <ul className="bd-events">{state.events.map((event, i) => <li key={i}>{event.day} · {PLAYERS[event.actor].name} · {event.name}</li>)}</ul>
    </details>
    <section>
      <a href="./">Open Badla Rivals</a>
      <a href="?classic=1">Open original singles demo</a>
      {!confirmReset ? <button onClick={() => setConfirmReset(true)}>Reset demo</button>
        : <button className="bd-primary" onClick={reset}>Confirm reset</button>}
    </section>
  </Modal>;
}
