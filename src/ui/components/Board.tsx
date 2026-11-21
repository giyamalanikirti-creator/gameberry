import { KeyboardEvent, useMemo } from 'react';
import type { Tokens } from '../../board/engine';
import {
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
} from '../../board/geometry';

const QUAD_FILL: Record<Quadrant, string> = {
  tl: 'var(--yard-green)',
  tr: 'var(--red)',
  br: 'var(--yard-yellow)',
  bl: 'var(--blue)',
};
const QUAD_SOFT: Record<Quadrant, string> = {
  tl: 'var(--yard-green-soft)',
  tr: 'var(--red-soft)',
  br: 'var(--yard-yellow-soft)',
  bl: 'var(--blue-soft)',
};
const ACTIVE: ReadonlySet<Quadrant> = new Set(['tr', 'bl']);
const START_QUAD: Record<number, Quadrant> = Object.fromEntries(
  (Object.entries(START_OFFSET) as Array<[Quadrant, number]>).map(([q, i]) => [i, q]),
);

export interface BoardProps {
  tokens: Tokens;
  perspective: Color;
  names: Record<Color, string>;
  label: string;
  focus?: Array<{ color: Color; tokenIndex: number }>;
  impact?: { color: Color; pos: number } | null;
  movable?: { color: Color; tokens: number[]; steps: number; onMove: (i: number) => void } | null;
  animate?: boolean;
  compact?: boolean;
}

interface Placed {
  color: Color;
  index: number;
  x: number;
  y: number;
  r: number;
}

function placeTokens(tokens: Tokens): Placed[] {
  const placed: Placed[] = [];
  const byCell = new Map<string, Array<{ color: Color; index: number }>>();
  (['blue', 'red'] as Color[]).forEach((color) => {
    tokens[color].forEach((pos, index) => {
      if (pos === YARD) {
        placed.push({ color, index, ...yardSpots(color)[index], r: 0.42 });
      } else if (pos === FINISH_INDEX) {
        placed.push({ color, index, ...finishSpots(color)[index], r: 0.24 });
      } else {
        const cell = ROUTES[color][pos];
        const key = `${cell.r},${cell.c}`;
        const list = byCell.get(key) ?? [];
        list.push({ color, index });
        byCell.set(key, list);
      }
    });
  });
  for (const [key, list] of byCell) {
    const [r, c] = key.split(',').map(Number);
    const { x, y } = cellCenter({ r, c });
    list.forEach((t, i) => {
      const offset = list.length > 1 ? (i - (list.length - 1) / 2) * 0.32 : 0;
      placed.push({ ...t, x: x + offset, y: y + (list.length > 1 ? offset * 0.4 : 0), r: list.length > 1 ? 0.3 : 0.38 });
    });
  }
  return placed;
}

function Star({ x, y }: { x: number; y: number }) {
  const pts: string[] = [];
  for (let i = 0; i < 10; i++) {
    const rad = i % 2 === 0 ? 0.32 : 0.14;
    const a = (Math.PI / 5) * i - Math.PI / 2;
    pts.push(`${(x + rad * Math.cos(a)).toFixed(3)},${(y + rad * Math.sin(a)).toFixed(3)}`);
  }
  return <polygon points={pts.join(' ')} className="board-star" />;
}

function TokenShape({ color, r }: { color: Color; r: number }) {
  if (color === 'red') {
    const s = r * 1.12;
    return <polygon points={`0,${-s} ${s},0 0,${s} ${-s},0`} className="token-shape token-red" />;
  }
  return <circle r={r} className="token-shape token-blue" />;
}

export function Board({ tokens, perspective, names, label, focus = [], impact, movable, animate = true, compact }: BoardProps) {
  const flip = perspective === 'red';
  const placed = useMemo(() => placeTokens(tokens), [tokens]);

  const impactPoint = impact ? cellCenter(ROUTES[impact.color][impact.pos]) : null;
  const isFocus = (c: Color, i: number) => focus.some((f) => f.color === c && f.tokenIndex === i);

  const onKey = (e: KeyboardEvent, i: number) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      movable?.onMove(i);
    }
  };

  return (
    <svg
      viewBox="0 0 15 15"
      className={`board${compact ? ' board-compact' : ''}${animate ? '' : ' board-still'}`}
      role="img"
      aria-label={label}
    >
      <g transform={flip ? 'rotate(180 7.5 7.5)' : undefined}>
        <rect x={0} y={0} width={15} height={15} rx={0.4} className="board-bg" />

        {(Object.keys(YARD_ORIGIN) as Quadrant[]).map((q) => {
          const o = YARD_ORIGIN[q];
          const active = ACTIVE.has(q);
          return (
            <g key={q} className={active ? 'yard' : 'yard yard-idle'}>
              <rect x={o.c + 0.08} y={o.r + 0.08} width={5.84} height={5.84} rx={0.5} fill={QUAD_FILL[q]} />
              <rect x={o.c + 1} y={o.r + 1} width={4} height={4} rx={0.45} className="yard-inner" />
              {[[2, 2], [4, 2], [2, 4], [4, 4]].map(([dx, dy]) => (
                <circle key={`${dx}${dy}`} cx={o.c + dx} cy={o.r + dy} r={0.55} fill={QUAD_SOFT[q]} />
              ))}
            </g>
          );
        })}

        {LOOP.map((cell, i) => {
          const startQ = START_QUAD[i];
          const fill = startQ ? QUAD_FILL[startQ] : 'var(--cell)';
          return (
            <g key={`t${i}`}>
              <rect x={cell.c + 0.04} y={cell.r + 0.04} width={0.92} height={0.92} rx={0.12} fill={fill} className="cell" opacity={startQ && !ACTIVE.has(startQ) ? 0.55 : 1} />
              {SAFE_LOOP_INDICES.has(i) && !startQ && <Star {...cellCenter(cell)} />}
            </g>
          );
        })}

        {(Object.keys(LANES) as Quadrant[]).map((q) =>
          LANES[q].map((cell, i) => (
            <rect
              key={`l${q}${i}`}
              x={cell.c + 0.04}
              y={cell.r + 0.04}
              width={0.92}
              height={0.92}
              rx={0.12}
              fill={QUAD_FILL[q]}
              opacity={ACTIVE.has(q) ? 0.85 : 0.4}
              className="cell"
            />
          )),
        )}

        {/* Centre finish: four triangles */}
        <polygon points="6,6 6,9 7.5,7.5" fill={QUAD_FILL.tl} opacity={0.5} />
        <polygon points="6,6 9,6 7.5,7.5" fill={QUAD_FILL.tr} />
        <polygon points="9,6 9,9 7.5,7.5" fill={QUAD_FILL.br} opacity={0.5} />
        <polygon points="6,9 9,9 7.5,7.5" fill={QUAD_FILL.bl} />

        {impactPoint && <circle cx={impactPoint.x} cy={impactPoint.y} r={0.85} className="impact" />}

        {placed.map((t) => {
          const canMove = movable && movable.color === t.color && movable.tokens.includes(t.index);
          const focused = isFocus(t.color, t.index);
          const name = names[t.color];
          const common = {
            className: `token${canMove ? ' token-movable' : ''}${focused ? ' token-focus' : ''}`,
            style: { transform: `translate(${t.x}px, ${t.y}px)` },
          };
          const body = (
            <>
              {(focused || canMove) && <circle r={t.r + 0.22} className="token-ring" />}
              <TokenShape color={t.color} r={t.r} />
              <text className="token-label" fontSize={t.r * 1.05} transform={flip ? 'rotate(180)' : undefined} dy="0.35em">
                {name[0]}
              </text>
            </>
          );
          if (canMove) {
            return (
              <g
                key={`${t.color}${t.index}`}
                {...common}
                role="button"
                tabIndex={0}
                aria-label={`Move ${name}'s token ${movable!.steps} ${movable!.steps === 1 ? 'step' : 'steps'}`}
                onClick={() => movable!.onMove(t.index)}
                onKeyDown={(e) => onKey(e, t.index)}
              >
                {body}
              </g>
            );
          }
          return (
            <g key={`${t.color}${t.index}`} {...common} aria-hidden="true">
              {body}
            </g>
          );
        })}
      </g>
    </svg>
  );
}

export function TokenLegend({ names }: { names: Record<Color, string> }) {
  return (
    <p className="legend">
      <span className="legend-item">
        <svg viewBox="-1 -1 2 2" aria-hidden="true"><circle r={0.8} className="token-shape token-blue" /></svg>
        {names.blue} · blue circle
      </span>
      <span className="legend-item">
        <svg viewBox="-1 -1 2 2" aria-hidden="true"><polygon points="0,-0.9 0.9,0 0,0.9 -0.9,0" className="token-shape token-red" /></svg>
        {names.red} · red diamond
      </span>
      <span className="legend-item">
        <svg viewBox="-0.4 -0.4 0.8 0.8" aria-hidden="true"><Star x={0} y={0} /></svg>
        safe square
      </span>
    </p>
  );
}
