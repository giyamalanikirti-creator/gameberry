import type { PlayerId, Route, State } from '../domain/types';
import { PendingItem } from '../state/selectors';
import { useStore } from '../state/store';
import { formatTime } from '../domain/time';

export function useMe() {
  const store = useStore();
  if (!store.me) throw new Error('screen rendered without a session');
  return { ...store, me: store.me as PlayerId, tz: store.state.players[store.me].timezone };
}

export function routeForPending(s: State, item: PendingItem): Route {
  switch (item.kind) {
    case 'invite': {
      const inv = s.invites[item.ref];
      return inv.kind === 'bookingSlot' ? { name: 'booking', id: s.rounds[inv.roundId].bookingId! } : { name: 'invite', id: item.ref };
    }
    case 'slot':
    case 'booking':
      return { name: 'booking', id: item.ref };
    case 'fixture':
      return { name: 'fixture', id: item.ref };
    case 'receipt':
      return { name: 'receipt', roundId: item.ref };
    default:
      return { name: 'round', id: item.ref };
  }
}

export function routeToHash(r: Route): string {
  switch (r.name) {
    case 'invite': return `#/invite/${r.id}`;
    case 'round': return `#/round/${r.id}`;
    case 'fixture': return `#/fixture/${r.id}`;
    case 'receipt': return `#/receipt/${r.roundId}`;
    case 'booking': return `#/booking/${r.id}`;
    case 'challenge': return '#/challenge';
    case 'opening': return '#/opening';
    case 'club': return '#/club';
    case 'inbox': return '#/inbox';
    default: return '#/';
  }
}

export function hashToRoute(h: string): Route | null {
  const m = h.replace(/^#\/?/, '').split('/');
  const [k, id] = m;
  switch (k) {
    case 'invite': return id ? { name: 'invite', id } : null;
    case 'round': return id ? { name: 'round', id } : null;
    case 'fixture': return id ? { name: 'fixture', id } : null;
    case 'receipt': return id ? { name: 'receipt', roundId: id } : null;
    case 'booking': return id ? { name: 'booking', id } : null;
    case 'challenge': return { name: 'challenge', seriesId: null };
    case 'opening': return { name: 'opening' };
    case 'club': return { name: 'club' };
    case 'inbox': return { name: 'inbox' };
    case '': return { name: 'home' };
    default: return null;
  }
}

export function sentAt(at: number, tz: string) {
  return formatTime(at, tz);
}

export function Back({ to = { name: 'home' } as Route, label = 'Home' }: { to?: Route; label?: string }) {
  const { go } = useStore();
  return (
    <button type="button" className="back" onClick={() => go(to)}>
      <span aria-hidden="true">‹</span> {label}
    </button>
  );
}

export function Terminal({ title, body, children }: { title: string; body: string; children?: React.ReactNode }) {
  return (
    <div className="terminal">
      <h2>{title}</h2>
      <p className="muted">{body}</p>
      <div className="stack">{children}</div>
    </div>
  );
}
