import type { PlayerId, Route } from '../domain/types';
import { formatDay, formatTime } from '../domain/time';
import { useStore } from '../state/store';
import { useTarget } from './shell';

/** A player's locked phone with their pushes. Tapping a push unlocks into that player's own session. */
export function LockScreen({ player, onUnlock, onClose }: { player: PlayerId; onUnlock: (route: Route) => void; onClose: () => void }) {
  const { state, now, me } = useStore();
  const pushT = useTarget('accept-challenge', 'push-card');
  const tz = state.players[player].timezone;
  const pushes = state.notifications
    .filter((n) => n.to === player && !n.readAt && (n.deferredTo === null || n.deferredTo <= now))
    .slice()
    .reverse();
  return (
    <div className="lock" role="dialog" aria-label={`${state.players[player].name}'s phone, locked`}>
      <p className="lock-owner">{state.players[player].name}'s phone</p>
      <p className="lock-time num">{formatTime(now, tz).replace(/\s?[ap]m$/, '')}</p>
      <p className="lock-date">{formatDay(now, tz)}</p>
      <div className="lock-pushes">
        {pushes.length === 0 && <p className="lock-empty">No notifications</p>}
        {pushes.map((n, i) => (
          <button key={n.id} type="button" {...(i === 0 ? pushT : { className: 'push-card' })} onClick={() => onUnlock(n.route)}>
            <span className="push-app">LUDO · Badla · {formatTime(n.createdAt, tz)}</span>
            <strong>{n.title}</strong>
            {n.body && <span>{n.body}</span>}
          </button>
        ))}
      </div>
      <p className="lock-hint">Tap a notification to unlock as {state.players[player].name}</p>
      {me && <button type="button" className="lock-back" onClick={onClose}>Back to {state.players[me].name}'s phone</button>}
    </div>
  );
}
