import { KeyboardEvent, useMemo } from 'react';
import {
  COLOR_QUADRANT,
  Color,
  FINISH_INDEX,
  LANES,
  LOOP,
  Quadrant,
  ROUTES,
  SAFE_LOOP_INDICES,
  START_OFFSET,
  YARD,
  YARD_ORIGIN,
  cellCenter,
  finishSpots,
  yardSpots,
} from '../engine/board';
import type { Tokens } from '../engine/rules';
import { Shape } from './kit';

const QUAD_COLOR: Record<Quadrant, Color> = { bl: 'red', tl: 'teal', tr: 'amber', br: 'blue' };
const fill = (c: Color) => `var(--seat-${c})`;
const ROTATE: Record<Quadrant, number> = { bl: 0, tl: -90, tr: 180, br: 90 };
const START_QUAD: Record<number, Quadrant> = Object.fromEntries((Object.entries(START_OFFSET) as Array<[Quadrant, number]>).map(([q, i]) => [i, q]));

export interface TokenMeta {
  name: string;
  shape: string;
}

export interface BoardProps {
  tokens: Tokens;
  meta: Partial<Record<Color, TokenMeta>>;
  /** Rotate so this colour's yard sits bottom-left. */
  perspective?: Color | null;
  label: string;
  focus?: Array<{ color: Color; tokenIndex: number }>;
  impact?: { color: Color; pos: number } | null;
  movable?: { color: Color; tokenIndex: number; steps: number; onMove: () => void } | null;
  still?: boolean;
  /** Colours to draw at full strength; others are muted. */
  active?: Color[];
}

interface Placed { color: Color; index: number; x: number; y: number; r: number }

function place(tokens: Tokens): Placed[] {
  const out: Placed[] = [];
  const byCell = new Map<string, Array<{ color: Color; index: number }>>();
  for (const color of Object.keys(tokens) as Color[]) {
    tokens[color]!.forEach((pos, index) => {
      if (pos === YARD) out.push({ color, index, ...yardSpots(color)[index], r: 0.42 });
      else if (pos === FINISH_INDEX) out.push({ color, index, ...finishSpots(color)[index], r: 0.22 });
      else {
        const cell = ROUTES[color][pos];
        const key = `${cell.r},${cell.c}`;
        byCell.set(key, [...(byCell.get(key) ?? []), { color, index }]);
      }
    });
  }
  for (const [key, list] of byCell) {
    const [r, c] = key.split(',').map(Number);
    const { x, y } = cellCenter({ r, c });
    list.forEach((t, i) => {
      const off = list.length > 1 ? (i - (list.length - 1) / 2) * 0.32 : 0;
      out.push({ ...t, x: x + off, y: y + off * 0.4, r: list.length > 1 ? 0.3 : 0.38 });
    });
  }
  return out;
}

function Star({ x, y, light }: { x: number; y: number; light?: boolean }) {
  const pts: string[] = [];
  for (let i = 0; i < 10; i++) {
    const rad = i % 2 === 0 ? 0.32 : 0.14;
    const a = (Math.PI / 5) * i - Math.PI / 2;
    pts.push(`${(x + rad * Math.cos(a)).toFixed(3)},${(y + rad * Math.sin(a)).toFixed(3)}`);
  }
  return <polygon points={pts.join(' ')} className={light ? 'b-star b-star-light' : 'b-star'} />;
}

export function Board({ tokens, meta, perspective, label, focus = [], impact, movable, still, active }: BoardProps) {
  const q: Quadrant = perspective ? COLOR_QUADRANT[perspective] : 'bl';
  const angle = ROTATE[q];
  const placed = useMemo(() => place(tokens), [tokens]);
  const on = (c: Color) => !active || active.includes(c);
  const impactAt = impact ? cellCenter(ROUTES[impact.color][impact.pos]) : null;
  const key = (e: KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); movable?.onMove(); }
  };

  return (
    <svg viewBox="-0.3 -0.3 15.6 15.6" className={`board${still ? ' board-still' : ''}`} role="img" aria-label={label}>
      <rect x={-0.3} y={-0.3} width={15.6} height={15.6} rx={0.5} className="b-frame" />
      <g transform={angle ? `rotate(${angle} 7.5 7.5)` : undefined}>
        <rect x={0} y={0} width={15} height={15} className="b-bg" />
        {(Object.keys(YARD_ORIGIN) as Quadrant[]).map((qq) => {
          const o = YARD_ORIGIN[qq];
          const c = QUAD_COLOR[qq];
          return (
            <g key={qq} opacity={on(c) ? 1 : 0.4}>
              <rect x={o.c} y={o.r} width={6} height={6} fill={fill(c)} />
              <rect x={o.c + 0.8} y={o.r + 0.8} width={4.4} height={4.4} rx={0.5} className="b-yard-inner" />
              {[[2, 2], [4, 2], [2, 4], [4, 4]].map(([dx, dy]) => <circle key={`${dx}${dy}`} cx={o.c + dx} cy={o.r + dy} r={0.6} fill={fill(c)} opacity={0.35} />)}
            </g>
          );
        })}
        {LOOP.map((cell, i) => {
          const sq = START_QUAD[i];
          const safe = SAFE_LOOP_INDICES.has(i);
          return (
            <g key={i}>
              <rect x={cell.c} y={cell.r} width={1} height={1} className="b-cell" fill={sq ? fill(QUAD_COLOR[sq]) : safe ? 'var(--b-safe)' : 'var(--b-cell)'} opacity={sq && !on(QUAD_COLOR[sq]) ? 0.45 : 1} />
              {safe && <Star {...cellCenter(cell)} light={!!sq} />}
            </g>
          );
        })}
        {(Object.keys(LANES) as Quadrant[]).map((qq) =>
          LANES[qq].map((cell, i) => (
            <rect key={`${qq}${i}`} x={cell.c} y={cell.r} width={1} height={1} className="b-cell" fill={fill(QUAD_COLOR[qq])} opacity={on(QUAD_COLOR[qq]) ? 0.9 : 0.35} />
          )),
        )}
        <polygon points="6,6 6,9 7.5,7.5" fill={fill('teal')} className="b-centre" />
        <polygon points="6,6 9,6 7.5,7.5" fill={fill('amber')} className="b-centre" />
        <polygon points="9,6 9,9 7.5,7.5" fill={fill('blue')} className="b-centre" />
        <polygon points="6,9 9,9 7.5,7.5" fill={fill('red')} className="b-centre" />
        {impactAt && <circle cx={impactAt.x} cy={impactAt.y} r={0.9} className="b-impact" />}
        {placed.map((t) => {
          const m = meta[t.color];
          const canMove = movable && movable.color === t.color && movable.tokenIndex === t.index;
          const focused = focus.some((f) => f.color === t.color && f.tokenIndex === t.index);
          const body = (
            <>
              {(focused || canMove) && <circle r={t.r + 0.24} className={canMove ? 'tok-ring tok-ring-go' : 'tok-ring'} />}
              <g fill={fill(t.color)} stroke="#fff" strokeWidth={0.09} transform="translate(0 0.08)" opacity={0.35}><Shape shape={m?.shape ?? 'circle'} size={t.r} /></g>
              <g fill={fill(t.color)} stroke="#fff" strokeWidth={0.09}><Shape shape={m?.shape ?? 'circle'} size={t.r} /></g>
              <text className="tok-label" fontSize={t.r * 1.05} dy="0.35em" transform={angle ? `rotate(${-angle})` : undefined}>{m?.name[0] ?? ''}</text>
            </>
          );
          const style = { transform: `translate(${t.x}px, ${t.y}px)` };
          return canMove ? (
            <g key={`${t.color}${t.index}`} className="tok tok-go" style={style} role="button" tabIndex={0}
              aria-label={`Move ${m?.name ?? t.color}'s token ${movable!.steps} ${movable!.steps === 1 ? 'square' : 'squares'}`}
              onClick={movable!.onMove} onKeyDown={key}>
              {body}
            </g>
          ) : (
            <g key={`${t.color}${t.index}`} className="tok" style={style} aria-hidden="true">{body}</g>
          );
        })}
      </g>
    </svg>
  );
}
