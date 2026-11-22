import { KeyboardEvent, useMemo } from 'react';
import {
  BoardColor,
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
  tl: 'var(--b-green)',
  tr: 'var(--b-yellow)',
  br: 'var(--b-blue)',
  bl: 'var(--b-red)',
};
const QUAD_DEEP: Record<Quadrant, string> = {
  tl: 'var(--b-green-deep)',
  tr: 'var(--b-yellow-deep)',
  br: 'var(--b-blue-deep)',
  bl: 'var(--b-red-deep)',
};
const START_QUAD: Record<number, Quadrant> = Object.fromEntries(
  (Object.entries(START_OFFSET) as Array<[Quadrant, number]>).map(([q, i]) => [i, q]),
);

export interface BoardProps {
  tokens: Partial<Record<BoardColor, number[]>>;
  perspective: Color;
  names: Partial<Record<BoardColor, string>>;
  label: string;
  focus?: Array<{ color: BoardColor; tokenIndex: number }>;
  impact?: { color: BoardColor; pos: number } | null;
  movable?: { color: BoardColor; tokens: number[]; steps: number; onMove: (i: number) => void } | null;
  animate?: boolean;
  returning?: { color: BoardColor; tokenIndex: number };
  compact?: boolean;
}

interface Placed {
  color: BoardColor;
  index: number;
  x: number;
  y: number;
  r: number;
}

function placeTokens(tokens: BoardProps['tokens']): Placed[] {
  const placed: Placed[] = [];
  const byCell = new Map<string, Array<{ color: BoardColor; index: number }>>();
  (Object.keys(tokens) as BoardColor[]).forEach((color) => {
    tokens[color]?.forEach((pos, index) => {
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

function Star({ x, y, light }: { x: number; y: number; light?: boolean }) {
  const pts: string[] = [];
  for (let i = 0; i < 10; i++) {
    const rad = i % 2 === 0 ? 0.32 : 0.14;
    const a = (Math.PI / 5) * i - Math.PI / 2;
    pts.push(`${(x + rad * Math.cos(a)).toFixed(3)},${(y + rad * Math.sin(a)).toFixed(3)}`);
  }
  return <polygon points={pts.join(' ')} className={light ? 'board-star board-star-light' : 'board-star'} />;
}

/** Original coin-style pawns with one shape per yard. */
function TokenShape({ color, r }: { color: BoardColor; r: number }) {
  if (color === 'green' || color === 'blue') {
    const s = r * 1.12;
    const points = color === 'green' ? `0,${-s} ${s},${s * 0.72} ${-s},${s * 0.72}`
      : `${-r},${-r} ${r},${-r} ${r},${r} ${-r},${r}`;
    return (
      <>
        <polygon points={points} transform="translate(0 0.1)" className="token-base" strokeLinejoin="round" />
        <polygon points={points} className={`token-shape token-${color}`} strokeLinejoin="round" />
      </>
    );
  }
  if (color === 'yellow') {
    const s = r * 1.15;
    return (
      <>
        <polygon points={`0,${-s + 0.1} ${s},0.1 0,${s + 0.1} ${-s},0.1`} className="token-base" strokeLinejoin="round" />
        <polygon points={`0,${-s} ${s},0 0,${s} ${-s},0`} className="token-shape token-yellow" strokeLinejoin="round" />
      </>
    );
  }
  return (
    <>
      <circle r={r} cy={0.1} className="token-base" />
      <circle r={r} className="token-shape token-red" />
    </>
  );
}

export function Board({ tokens, perspective, names, label, focus = [], impact, movable, returning, animate = true, compact }: BoardProps) {
  const flip = perspective === 'yellow';
  const placed = useMemo(() => placeTokens(tokens), [tokens]);

  const impactPoint = impact ? cellCenter(ROUTES[impact.color][impact.pos]) : null;
  const isFocus = (c: BoardColor, i: number) => focus.some((f) => f.color === c && f.tokenIndex === i);

  const onKey = (e: KeyboardEvent, i: number) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      movable?.onMove(i);
    }
  };

  return (
    <svg
      viewBox="-0.35 -0.35 15.7 15.7"
      className={`board${compact ? ' board-compact' : ''}${animate ? '' : ' board-still'}`}
      role={movable ? 'group' : 'img'}
      aria-label={label}
    >
      <defs>
        <radialGradient id="coin-red" cx="0.35" cy="0.3" r="0.8">
          <stop offset="0" stopColor="#ff8a80" />
          <stop offset="0.55" stopColor="#e53935" />
          <stop offset="1" stopColor="#a51d1d" />
        </radialGradient>
        <radialGradient id="coin-yellow" cx="0.35" cy="0.3" r="0.8">
          <stop offset="0" stopColor="#fff3b0" />
          <stop offset="0.55" stopColor="#f6b61c" />
          <stop offset="1" stopColor="#c27c00" />
        </radialGradient>
      </defs>
      <rect x={-0.35} y={-0.35} width={15.7} height={15.7} rx={0.45} className="board-frame" />
      <g transform={flip ? 'rotate(180 7.5 7.5)' : undefined}>
        <rect x={0} y={0} width={15} height={15} className="board-bg" />

        {(Object.keys(YARD_ORIGIN) as Quadrant[]).map((q) => {
          const o = YARD_ORIGIN[q];
          return (
            <g key={q} className="yard">
              <rect x={o.c} y={o.r} width={6} height={6} fill={QUAD_FILL[q]} />
              <rect x={o.c + 0.8} y={o.r + 0.8} width={4.4} height={4.4} rx={0.45} fill={QUAD_DEEP[q]} className="yard-inner" />
              {[[2, 2], [4, 2], [2, 4], [4, 4]].map(([dx, dy]) => (
                <circle key={`${dx}${dy}`} cx={o.c + dx} cy={o.r + dy} r={0.6} className="yard-spot" />
              ))}
            </g>
          );
        })}

        {LOOP.map((cell, i) => {
          const startQ = START_QUAD[i];
          const safe = SAFE_LOOP_INDICES.has(i) && !startQ;
          const fill = startQ ? QUAD_FILL[startQ] : safe ? 'var(--b-safe)' : 'var(--b-cell)';
          return (
            <g key={`t${i}`}>
              <rect x={cell.c} y={cell.r} width={1} height={1} fill={fill} className="cell" />
              {(safe || startQ) && <Star {...cellCenter(cell)} light={!!startQ} />}
            </g>
          );
        })}

        {(Object.keys(LANES) as Quadrant[]).map((q) =>
          LANES[q].map((cell, i) => (
            <rect
              key={`l${q}${i}`}
              x={cell.c}
              y={cell.r}
              width={1}
              height={1}
              fill={QUAD_FILL[q]}
              className="cell"
            />
          )),
        )}

        {/* Centre finish: four triangles */}
        <polygon points="6,6 6,9 7.5,7.5" fill={QUAD_FILL.tl} className="centre" />
        <polygon points="6,6 9,6 7.5,7.5" fill={QUAD_FILL.tr} className="centre" />
        <polygon points="9,6 9,9 7.5,7.5" fill={QUAD_FILL.br} className="centre" />
        <polygon points="6,9 9,9 7.5,7.5" fill={QUAD_FILL.bl} className="centre" />
        <rect x={0} y={0} width={15} height={15} className="board-edge" />

        {impactPoint && <circle cx={impactPoint.x} cy={impactPoint.y} r={0.85} className="impact" />}

        {placed.map((t) => {
          const canMove = movable && movable.color === t.color && movable.tokens.includes(t.index);
          const focused = isFocus(t.color, t.index);
          const name = names[t.color] ?? t.color;
          const common = {
            className: `token${canMove ? ' token-movable' : ''}${focused ? ' token-focus' : ''}${returning?.color === t.color && returning.tokenIndex === t.index ? ' token-returning' : ''}`,
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
                <circle r={0.85} fill="transparent" />
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
        <svg viewBox="-1 -1 2 2" aria-hidden="true"><circle r={0.8} className="token-shape token-red" /></svg>
        {names.red} · red circle
      </span>
      <span className="legend-item">
        <svg viewBox="-1 -1 2 2" aria-hidden="true"><polygon points="0,-0.9 0.9,0 0,0.9 -0.9,0" className="token-shape token-yellow" /></svg>
        {names.yellow} · yellow diamond
      </span>
      <span className="legend-item">
        <svg viewBox="-0.4 -0.4 0.8 0.8" aria-hidden="true"><Star x={0} y={0} /></svg>
        safe square
      </span>
    </p>
  );
}
