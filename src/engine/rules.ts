/**
 * Movement rules for the historical replay (full token sets) and the
 * Quick endgame · demo variant (one active token per player).
 */
import { DiceState, nextDie } from './dice';
import { Color, COLORS, FINISH_INDEX, YARD, isProtected, loopIndexOf } from './board';

export type Tokens = Partial<Record<Color, number[]>>;
export type Side = 'A' | 'B';

export function cloneTokens(t: Tokens): Tokens {
  const out: Tokens = {};
  for (const c of COLORS) if (t[c]) out[c] = [...t[c]!];
  return out;
}

export function destinationFor(pos: number, roll: number): number | null {
  if (roll < 1 || roll > 6 || pos === FINISH_INDEX) return null;
  if (pos === YARD) return roll === 6 ? 0 : null;
  const to = pos + roll;
  return to <= FINISH_INDEX ? to : null; // exact roll to finish
}

export interface Capture {
  color: Color;
  tokenIndex: number;
  from: number;
}

export interface MoveOutcome {
  tokens: Tokens;
  from: number;
  to: number;
  path: number[];
  capture: Capture | null;
}

/** Full-board move with captures, used to verify the opening replay. */
export function applyMove(tokens: Tokens, color: Color, tokenIndex: number, roll: number): MoveOutcome | null {
  const from = tokens[color]?.[tokenIndex];
  if (from === undefined) return null;
  const to = destinationFor(from, roll);
  if (to === null) return null;
  const path: number[] = [];
  if (from === YARD) path.push(0);
  else for (let p = from + 1; p <= to; p++) path.push(p);
  const next = cloneTokens(tokens);
  next[color]![tokenIndex] = to;
  let capture: Capture | null = null;
  const loop = loopIndexOf(color, to);
  if (loop !== null && !isProtected(color, to)) {
    for (const other of COLORS) {
      if (other === color || !next[other]) continue;
      const hit = next[other]!.flatMap((p, i) => (loopIndexOf(other, p) === loop ? [i] : []));
      if (hit.length === 1) {
        capture = { color: other, tokenIndex: hit[0], from: next[other]![hit[0]] };
        next[other]![hit[0]] = YARD;
      }
    }
  }
  return { tokens: next, from, to, path, capture };
}

// ---------------------------------------------------------------------------
// Live endgame
// ---------------------------------------------------------------------------

export interface GameSeat {
  playerId: string;
  color: Color;
  side: Side;
  pos: number;
}

export interface TurnNote {
  kind: 'overshoot' | 'moved' | 'finished';
  seat: number;
  roll: number;
  needed: number;
}

export interface MoveRecord {
  seat: number;
  roll: number;
  from: number;
  to: number;
  path: number[];
}

export interface LiveGame {
  format: 'singles' | 'doubles';
  /** Fixed turn order. */
  seats: GameSeat[];
  turn: number;
  die: number | null;
  rollCount: number;
  dice: DiceState;
  winnerSide: Side | null;
  note: TurnNote | null;
  moves: MoveRecord[];
}

export function distanceOf(pos: number): number {
  return FINISH_INDEX - pos;
}

export function createGame(
  format: 'singles' | 'doubles',
  seats: Array<Omit<GameSeat, 'pos'> & { distance: number }>,
  dice: DiceState,
): LiveGame {
  return {
    format,
    seats: seats.map(({ distance, ...s }) => ({ ...s, pos: FINISH_INDEX - distance })),
    turn: 0,
    die: null,
    rollCount: 0,
    dice,
    winnerSide: null,
    note: null,
    moves: [],
  };
}

export const isFinished = (s: GameSeat) => s.pos === FINISH_INDEX;

function nextTurn(game: LiveGame, from: number): number {
  for (let i = 1; i <= game.seats.length; i++) {
    const idx = (from + i) % game.seats.length;
    if (!isFinished(game.seats[idx])) return idx;
  }
  return from;
}

function sideWon(game: LiveGame, side: Side): boolean {
  return game.seats.filter((s) => s.side === side).every(isFinished);
}

export function rollDie(game: LiveGame, seat: number): LiveGame | null {
  if (game.winnerSide || game.turn !== seat || game.die !== null) return null;
  const { value, dice } = nextDie(game.dice);
  const s = game.seats[seat];
  const rollCount = game.rollCount + 1;
  if (destinationFor(s.pos, value) === null) {
    return { ...game, dice, rollCount, die: null, turn: nextTurn(game, seat), note: { kind: 'overshoot', seat, roll: value, needed: distanceOf(s.pos) } };
  }
  return { ...game, dice, rollCount, die: value, note: null };
}

export function moveToken(game: LiveGame, seat: number): LiveGame | null {
  if (game.winnerSide || game.turn !== seat || game.die === null) return null;
  const s = game.seats[seat];
  const to = destinationFor(s.pos, game.die);
  if (to === null) return null;
  const path: number[] = [];
  for (let p = s.pos + 1; p <= to; p++) path.push(p);
  const seats = game.seats.map((x, i) => (i === seat ? { ...x, pos: to } : x));
  const g: LiveGame = {
    ...game,
    seats,
    die: null,
    moves: [...game.moves, { seat, roll: game.die, from: s.pos, to, path }],
    note: { kind: to === FINISH_INDEX ? 'finished' : 'moved', seat, roll: game.die, needed: distanceOf(to) },
  };
  if (sideWon(g, s.side)) return { ...g, winnerSide: s.side };
  return { ...g, turn: nextTurn(g, seat) };
}

/** Board token map for rendering: three tokens home plus the active one. */
export function gameTokens(game: LiveGame): Tokens {
  const t: Tokens = {};
  for (const s of game.seats) t[s.color] = [FINISH_INDEX, FINISH_INDEX, FINISH_INDEX, s.pos];
  return t;
}
