/**
 * Movement rules shared by the historical replay and the live rematch.
 */
import { DiceState, nextDie } from './dice';
import {
  Color,
  FINISH_INDEX,
  FIRST_LANE_INDEX,
  YARD,
  isProtected,
  loopIndexOf,
} from './geometry';

export type Tokens = Record<Color, number[]>;

export const COLORS: Color[] = ['red', 'yellow'];

export function opponentOf(color: Color): Color {
  return color === 'red' ? 'yellow' : 'red';
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
  /** Route positions visited, one per step, ending on the destination. */
  path: number[];
  capture: Capture | null;
  finished: boolean;
  won: boolean;
}

export function cloneTokens(tokens: Tokens): Tokens {
  return { red: [...tokens.red], yellow: [...tokens.yellow] };
}

/** Destination for a token and roll, or null if the move is illegal. */
export function destinationFor(pos: number, roll: number): number | null {
  if (roll < 1 || roll > 6) return null;
  if (pos === FINISH_INDEX) return null;
  if (pos === YARD) return roll === 6 ? 0 : null;
  const to = pos + roll;
  return to <= FINISH_INDEX ? to : null; // exact roll needed to finish
}

export function legalTokens(tokens: Tokens, color: Color, roll: number): number[] {
  return tokens[color].flatMap((pos, i) => (destinationFor(pos, roll) === null ? [] : [i]));
}

/** Opponent tokens standing on the same shared-track square. */
export function occupantsAt(tokens: Tokens, color: Color, loopIndex: number): number[] {
  return tokens[color].flatMap((pos, i) => (loopIndexOf(color, pos) === loopIndex ? [i] : []));
}

export function applyMove(tokens: Tokens, color: Color, tokenIndex: number, roll: number): MoveOutcome | null {
  const from = tokens[color][tokenIndex];
  if (from === undefined) return null;
  const to = destinationFor(from, roll);
  if (to === null) return null;

  const path: number[] = [];
  if (from === YARD) path.push(0);
  else for (let p = from + 1; p <= to; p++) path.push(p);

  const next = cloneTokens(tokens);
  next[color][tokenIndex] = to;

  let capture: Capture | null = null;
  const loop = loopIndexOf(color, to);
  if (loop !== null && !isProtected(color, to)) {
    const other = opponentOf(color);
    const hit = occupantsAt(next, other, loop);
    // A lone opponent token is sent home. Two or more form a block and stay.
    if (hit.length === 1 && !isProtected(other, next[other][hit[0]])) {
      capture = { color: other, tokenIndex: hit[0], from: next[other][hit[0]] };
      next[other][hit[0]] = YARD;
    }
  }

  const finished = to === FINISH_INDEX;
  const won = next[color].every((p) => p === FINISH_INDEX);
  return { tokens: next, from, to, path, capture, finished, won };
}

export function stepsToFinish(pos: number): number {
  if (pos === YARD) return Infinity;
  return FINISH_INDEX - pos;
}

/** The single unfinished token of a colour, if there is exactly one. */
export function lastActiveToken(tokens: Tokens, color: Color): number | null {
  const active = tokens[color].flatMap((p, i) => (p === FINISH_INDEX ? [] : [i]));
  return active.length === 1 ? active[0] : null;
}

// ---------------------------------------------------------------------------
// Live game (the Quick-style endgame)
// ---------------------------------------------------------------------------

export interface TurnNote {
  kind: 'overshoot' | 'moved' | 'finished';
  color: Color;
  roll: number;
  needed?: number;
}

export interface MoveRecord {
  color: Color;
  tokenIndex: number;
  roll: number;
  before: Tokens;
  after: Tokens;
  path: number[];
  capture: Capture | null;
}

export interface LiveGame {
  tokens: Tokens;
  turn: Color;
  /** A rolled die that has not been spent yet. Survives refresh. */
  die: number | null;
  rollCount: number;
  dice: DiceState;
  winner: Color | null;
  note: TurnNote | null;
  lastMove: MoveRecord | null;
}

/**
 * Demo rules: three tokens home on each side, one token in its own protected
 * lane. Kirti (red) needs 4 to finish, Ahmed (yellow) needs 5. Kirti starts.
 */
export function endgameStart(dice: DiceState): LiveGame {
  return {
    tokens: {
      red: [FINISH_INDEX, FINISH_INDEX, FINISH_INDEX, FIRST_LANE_INDEX + 1],
      yellow: [FINISH_INDEX, FINISH_INDEX, FINISH_INDEX, FIRST_LANE_INDEX],
    },
    turn: 'red',
    die: null,
    rollCount: 0,
    dice,
    winner: null,
    note: null,
    lastMove: null,
  };
}

/** Roll for the current colour. Returns null if a roll is not allowed now. */
export function rollDie(game: LiveGame, color: Color): LiveGame | null {
  if (game.winner || game.turn !== color || game.die !== null) return null;
  const { value, dice } = nextDie(game.dice);
  const legal = legalTokens(game.tokens, color, value);
  const rollCount = game.rollCount + 1;
  if (legal.length === 0) {
    const active = game.tokens[color].filter((p) => p !== FINISH_INDEX);
    const needed = active.length === 1 ? stepsToFinish(active[0]) : undefined;
    return {
      ...game,
      dice,
      rollCount,
      die: null,
      turn: opponentOf(color),
      note: { kind: 'overshoot', color, roll: value, needed },
    };
  }
  return { ...game, dice, rollCount, die: value, note: null };
}

/** Spend the rolled die on a token. Returns null if illegal. */
export function moveToken(game: LiveGame, color: Color, tokenIndex: number): LiveGame | null {
  if (game.winner || game.turn !== color || game.die === null) return null;
  const outcome = applyMove(game.tokens, color, tokenIndex, game.die);
  if (!outcome) return null;
  const record: MoveRecord = {
    color,
    tokenIndex,
    roll: game.die,
    before: cloneTokens(game.tokens),
    after: cloneTokens(outcome.tokens),
    path: outcome.path,
    capture: outcome.capture,
  };
  return {
    ...game,
    tokens: outcome.tokens,
    die: null,
    turn: outcome.won ? color : opponentOf(color),
    winner: outcome.won ? color : null,
    note: { kind: outcome.finished ? 'finished' : 'moved', color, roll: game.die },
    lastMove: record,
  };
}

/** The only legal token for the current die, used by the demo opponent and keyboard shortcut. */
export function suggestedToken(game: LiveGame): number | null {
  if (game.die === null || game.winner) return null;
  const legal = legalTokens(game.tokens, game.turn, game.die);
  return legal.length ? legal[0] : null;
}
