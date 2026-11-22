/**
 * Shared board geometry. Rendering and movement both read from these routes,
 * so a token is always drawn on the square the engine thinks it is on.
 *
 * Layout: the conventional 15 × 15 cross. Four 6 × 6 yards in the corners, a
 * three-wide arm on each side, and a 3 × 3 finish in the centre. The shared
 * track is a 52-square loop. Where an arm meets the next arm the loop takes a
 * single diagonal step across the corner of the centre block, exactly like a
 * printed Ludo board. Each colour enters the loop on its start square, travels
 * 51 track squares (route indices 0–50), turns into its five-square protected
 * home lane (51–55) and finishes in the centre (56).
 */

export type Color = 'red' | 'teal' | 'amber' | 'blue';
export type Quadrant = 'tl' | 'tr' | 'br' | 'bl';

export interface Cell {
  r: number;
  c: number;
}

export const GRID = 15;
export const TRACK_LENGTH = 52;
export const LAST_TRACK_INDEX = 50;
export const FIRST_LANE_INDEX = 51;
export const LANE_LENGTH = 5;
export const FINISH_INDEX = 56;
export const YARD = -1;

/**
 * Seat colours and the yard each one owns. Turn order Riya → Gunjan → Ananya →
 * Shruti runs clockwise bl → tl → tr → br, so partners sit opposite each other.
 */
export const COLOR_QUADRANT: Record<Color, Quadrant> = { red: 'bl', teal: 'tl', amber: 'tr', blue: 'br' };
export const COLORS: Color[] = ['red', 'teal', 'amber', 'blue'];

/** Index in LOOP where each quadrant's start square sits. */
export const START_OFFSET: Record<Quadrant, number> = { tl: 0, tr: 13, br: 26, bl: 39 };

function run(cells: Array<[number, number]>): Cell[] {
  return cells.map(([r, c]) => ({ r, c }));
}

function range(from: number, to: number): number[] {
  const out: number[] = [];
  const step = from <= to ? 1 : -1;
  for (let i = from; step > 0 ? i <= to : i >= to; i += step) out.push(i);
  return out;
}

/** The 52-square loop, clockwise, starting at the top-left colour's start square. */
export const LOOP: Cell[] = [
  ...run(range(1, 5).map((c) => [6, c])), // left arm, upper row, heading right
  ...run(range(5, 0).map((r) => [r, 6])), // top arm, left column, heading up
  ...run([[0, 7]]),
  ...run(range(0, 5).map((r) => [r, 8])), // top arm, right column, heading down
  ...run(range(9, 14).map((c) => [6, c])), // right arm, upper row
  ...run([[7, 14]]),
  ...run(range(14, 9).map((c) => [8, c])), // right arm, lower row, heading left
  ...run(range(9, 14).map((r) => [r, 8])), // bottom arm, right column, heading down
  ...run([[14, 7]]),
  ...run(range(14, 9).map((r) => [r, 6])), // bottom arm, left column, heading up
  ...run(range(5, 0).map((c) => [8, c])), // left arm, lower row, heading left
  ...run([[7, 0]]),
  ...run([[6, 0]]),
];

/** Protected home lanes, ordered from entry to the square before the finish. */
export const LANES: Record<Quadrant, Cell[]> = {
  tl: run(range(1, 5).map((c) => [7, c])),
  tr: run(range(1, 5).map((r) => [r, 7])),
  br: run(range(13, 9).map((c) => [7, c])),
  bl: run(range(13, 9).map((r) => [r, 7])),
};

/** The centre square each colour's lane runs into. */
export const FINISH_CELL: Record<Quadrant, Cell> = {
  tl: { r: 7, c: 6 },
  tr: { r: 6, c: 7 },
  br: { r: 7, c: 8 },
  bl: { r: 8, c: 7 },
};

/** Start squares and star squares. Tokens here cannot be captured. */
export const SAFE_LOOP_INDICES: ReadonlySet<number> = new Set([0, 8, 13, 21, 26, 34, 39, 47]);

/** Top-left corner of each 6 × 6 yard. */
export const YARD_ORIGIN: Record<Quadrant, Cell> = {
  tl: { r: 0, c: 0 },
  tr: { r: 0, c: 9 },
  br: { r: 9, c: 9 },
  bl: { r: 9, c: 0 },
};

export function quadrantOf(color: Color): Quadrant {
  return COLOR_QUADRANT[color];
}

/** Full ordered route for a colour: 51 track squares, 5 lane squares, finish. */
export function route(color: Color): Cell[] {
  const q = quadrantOf(color);
  const offset = START_OFFSET[q];
  const track = range(0, LAST_TRACK_INDEX).map((i) => LOOP[(offset + i) % TRACK_LENGTH]);
  return [...track, ...LANES[q], FINISH_CELL[q]];
}

export const ROUTES: Record<Color, Cell[]> = { red: route('red'), teal: route('teal'), amber: route('amber'), blue: route('blue') };

/** Loop index of a route position on the shared track, or null if not on it. */
export function loopIndexOf(color: Color, pos: number): number | null {
  if (pos < 0 || pos > LAST_TRACK_INDEX) return null;
  return (START_OFFSET[quadrantOf(color)] + pos) % TRACK_LENGTH;
}

export function isOnSharedTrack(pos: number): boolean {
  return pos >= 0 && pos <= LAST_TRACK_INDEX;
}

export function isInHomeLane(pos: number): boolean {
  return pos >= FIRST_LANE_INDEX && pos < FINISH_INDEX;
}

/** True when a token on this route position cannot be captured. */
export function isProtected(color: Color, pos: number): boolean {
  if (!isOnSharedTrack(pos)) return true; // yard, home lane, finish
  return SAFE_LOOP_INDICES.has(loopIndexOf(color, pos)!);
}

export function isCenterCell(cell: Cell): boolean {
  return cell.r >= 6 && cell.r <= 8 && cell.c >= 6 && cell.c <= 8;
}

export function sameCell(a: Cell, b: Cell): boolean {
  return a.r === b.r && a.c === b.c;
}

/**
 * Consecutive squares must touch along an edge, or take the conventional
 * diagonal step around a corner of the centre block.
 */
export function areConnected(a: Cell, b: Cell): boolean {
  const dr = Math.abs(a.r - b.r);
  const dc = Math.abs(a.c - b.c);
  if (dr + dc === 1) return true;
  if (dr === 1 && dc === 1) {
    return isCenterCell({ r: a.r, c: b.c }) || isCenterCell({ r: b.r, c: a.c });
  }
  return false;
}

/** Returns a list of problems; empty means the route is valid. */
export function validateRoute(cells: Cell[], { closed = false } = {}): string[] {
  const problems: string[] = [];
  const seen = new Set<string>();
  cells.forEach((cell, i) => {
    const key = `${cell.r},${cell.c}`;
    if (seen.has(key)) problems.push(`square ${key} appears twice (index ${i})`);
    seen.add(key);
    if (cell.r < 0 || cell.c < 0 || cell.r >= GRID || cell.c >= GRID) problems.push(`index ${i} is off the board`);
    if (i > 0 && !areConnected(cells[i - 1], cell)) problems.push(`index ${i - 1} → ${i} is not connected`);
  });
  if (closed && cells.length > 1 && !areConnected(cells[cells.length - 1], cells[0])) {
    problems.push('loop does not close');
  }
  return problems;
}

/** Centre point (in board units) for drawing. */
export function cellCenter(cell: Cell): { x: number; y: number } {
  return { x: cell.c + 0.5, y: cell.r + 0.5 };
}

/** Four token spots inside a yard. */
export function yardSpots(color: Color): Array<{ x: number; y: number }> {
  const o = YARD_ORIGIN[quadrantOf(color)];
  return [
    { x: o.c + 2, y: o.r + 2 },
    { x: o.c + 4, y: o.r + 2 },
    { x: o.c + 2, y: o.r + 4 },
    { x: o.c + 4, y: o.r + 4 },
  ];
}

/** Where finished tokens rest, kept visible inside the colour's centre triangle. */
export function finishSpots(color: Color): Array<{ x: number; y: number }> {
  const q = quadrantOf(color);
  const spread = [-0.55, 0, 0.55, 0.27];
  switch (q) {
    case 'bl':
      return spread.map((d, i) => ({ x: 7.5 + d, y: i === 3 ? 8.15 : 8.55 }));
    case 'tr':
      return spread.map((d, i) => ({ x: 7.5 + d, y: i === 3 ? 6.85 : 6.45 }));
    case 'tl':
      return spread.map((d, i) => ({ x: i === 3 ? 6.85 : 6.45, y: 7.5 + d }));
    case 'br':
      return spread.map((d, i) => ({ x: i === 3 ? 8.15 : 8.55, y: 7.5 + d }));
  }
}
