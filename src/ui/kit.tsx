import { ReactNode } from 'react';
import type { PlayerId, Side, State } from '../domain/types';
import { balance, seriesScore } from '../state/selectors';

export const SEAT_COLOR: Record<string, string> = {
  red: 'var(--seat-red)',
  teal: 'var(--seat-teal)',
  amber: 'var(--seat-amber)',
  blue: 'var(--seat-blue)',
};

export function Shape({ shape, size = 1 }: { shape: string | null; size?: number }) {
  const s = size;
  switch (shape) {
    case 'diamond':
      return <polygon points={`0,${-s} ${s},0 0,${s} ${-s},0`} />;
    case 'square':
      return <rect x={-s * 0.8} y={-s * 0.8} width={s * 1.6} height={s * 1.6} rx={s * 0.25} />;
    case 'triangle':
      return <polygon points={`0,${-s} ${s * 0.95},${s * 0.75} ${-s * 0.95},${s * 0.75}`} strokeLinejoin="round" />;
    default:
      return <circle r={s * 0.9} />;
  }
}

export function Avatar({ state, id, size = 36, badge }: { state: State; id: PlayerId; size?: number; badge?: number }) {
  const p = state.players[id];
  const fill = p.color ? SEAT_COLOR[p.color] : 'var(--club-grey)';
  return (
    <span className="avatar" style={{ width: size, height: size }} aria-hidden="true">
      <svg viewBox="-1.2 -1.2 2.4 2.4" width={size} height={size}>
        <g fill={fill} stroke="#fff" strokeWidth={0.14}><Shape shape={p.shape ?? 'circle'} /></g>
        <text y="0.36" textAnchor="middle" fontSize="1" fontWeight="800" fill="#fff">{p.name[0]}</text>
      </svg>
      {badge ? <span className="avatar-badge">{badge}</span> : null}
    </span>
  );
}

export function Gold({ amount, signed }: { amount: number; signed?: boolean }) {
  const txt = `${signed && amount > 0 ? '+' : amount < 0 ? '−' : ''}${Math.abs(amount).toLocaleString('en-IN')}`;
  return (
    <span className="gold num" aria-label={`${txt} gold`}>
      <span className="gold-coin" aria-hidden="true">●</span>
      {txt}
    </span>
  );
}

export function Balance({ state, id }: { state: State; id: PlayerId }) {
  return <Gold amount={balance(state, id)} />;
}

/** The published price, one line each: entry, pot, net win. */
export function PriceSheet({ format, compact }: { format: 'singles' | 'doubles' | 'all'; compact?: boolean }) {
  const rows = [
    { k: 'opening', label: 'Opening singles', entry: 100, pot: 200, gross: 200 },
    { k: 'singles', label: 'Badla singles (incl. decider)', entry: 200, pot: 400, gross: 400 },
    { k: 'doubles', label: 'Badla Doubles (incl. Grudge Night)', entry: 100, pot: 400, gross: 200 },
  ].filter((r) => format === 'all' || r.k === format);
  return (
    <div className={`price${compact ? ' price-compact' : ''}`}>
      <table>
        <thead>
          <tr><th scope="col">Match</th><th scope="col">Entry</th><th scope="col">Pot</th><th scope="col">Win</th><th scope="col">Lose</th></tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.k}>
              <th scope="row">{r.label}</th>
              <td className="num">{r.entry}</td>
              <td className="num">{r.pot}</td>
              <td className="num win">+{r.gross - r.entry}</td>
              <td className="num">−{r.entry}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="fine">Proposed pilot values, not live Ludo STAR economics. Gold only; no League credit.</p>
    </div>
  );
}

/** Series score as two numbers with the captains' avatars. */
export function SeriesScore({ state, seriesId, big }: { state: State; seriesId: string; big?: boolean }) {
  const series = state.series[seriesId];
  const sc = seriesScore(state, seriesId);
  const order: Side[] = ['B', 'A'];
  return (
    <div className={`series-score${big ? ' big' : ''}`} aria-label={`Series: ${state.players[series.sides.B].name} ${sc.B}, ${state.players[series.sides.A].name} ${sc.A}`}>
      {order.map((side, i) => (
        <span key={side} className="ss-side">
          {i === 1 && <span className="ss-dash" aria-hidden="true">–</span>}
          <Avatar state={state} id={series.sides[side]} size={big ? 34 : 24} />
          <span className="ss-name">{state.players[series.sides[side]].name}</span>
          <strong className="ss-num num">{sc[side]}</strong>
        </span>
      ))}
    </div>
  );
}

export function SideBadge({ side, label }: { side: Side; label?: string }) {
  return <span className={`side-badge side-${side}`}>{label ?? `Side ${side}`}</span>;
}

export function Card({ children, tone, className = '' }: { children: ReactNode; tone?: 'ember' | 'quiet' | 'gold'; className?: string }) {
  return <section className={`card${tone ? ` card-${tone}` : ''} ${className}`}>{children}</section>;
}

export function Waiting({ who, since, what }: { who: string; since?: string; what?: string }) {
  return (
    <p className="waiting" role="status">
      <span className="dot-pulse" aria-hidden="true" /> {what ?? `Waiting for ${who}`}
      {since ? <span className="mono"> · sent {since}</span> : null}
    </p>
  );
}
