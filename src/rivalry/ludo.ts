import { freshDice, nextDie, type DiceState } from '../board/dice';
import { applyMove, legalTokens, opponentOf, type MoveRecord, type Tokens } from '../board/engine';
import { loopIndexOf, isProtected, type Color } from '../board/geometry';

export interface Ludo {
  tokens: Tokens;
  turn: Color;
  die: number | null;
  lastDie: number | null;
  sixes: number;
  rolls: number;
  dice: DiceState;
  winner: Color | null;
  lastMove: MoveRecord | null;
  moveAt: number;
  message: 'third-six' | 'no-move' | 'capture' | 'home' | null;
}

export function newLudo(guided: boolean, publicGame: boolean, seed: number): Ludo {
  const tokens = !guided ? { red: [-1, -1, -1, -1], yellow: [-1, -1, -1, -1] } : publicGame
    ? { red: [56, 56, 56, 39], yellow: [56, 56, 55, 13] }
    : { red: [56, 56, 56, 54], yellow: [56, 56, 56, 53] };
  const sequence = publicGame ? [2, 2, 1, ...Array.from({ length: 8 }, () => [5, 1]).flat(), 1] : [2];
  const dice: DiceState = guided ? { kind: 'guided', sequence, index: 0, rng: seed } : freshDice(seed);
  return { tokens, turn: 'red', die: null, lastDie: null, sixes: 0, rolls: 0, dice, winner: null, lastMove: null, moveAt: 0, message: null };
}

export function rollLudo(game: Ludo, color: Color): Ludo {
  if (game.winner || game.turn !== color || game.die !== null) return game;
  const { value, dice } = nextDie(game.dice);
  const sixes = value === 6 ? game.sixes + 1 : 0;
  const message = sixes === 3 ? 'third-six' : !legalTokens(game.tokens, color, value).length ? 'no-move' : null;
  const next: Ludo = { ...game, dice, rolls: game.rolls + 1, lastDie: value, message };
  if (message) return { ...next, turn: opponentOf(color), sixes: 0 };
  return { ...next, die: value, sixes };
}

export function moveLudo(game: Ludo, color: Color, tokenIndex: number): Ludo {
  if (game.winner || game.turn !== color || game.die === null) return game;
  const result = applyMove(game.tokens, color, tokenIndex, game.die);
  if (!result) return game;
  const extra = game.die === 6 || result.finished || !!result.capture;
  return {
    ...game, tokens: result.tokens, die: null, turn: extra ? color : opponentOf(color), sixes: extra ? game.sixes : 0,
    moveAt: game.rolls,
    lastMove: { color, tokenIndex, roll: game.die, before: game.tokens, after: result.tokens, path: result.path, capture: result.capture },
    winner: result.won ? color : null, message: result.capture ? 'capture' : result.finished ? 'home' : null,
  };
}

export function botMove(game: Ludo) {
  const color = game.turn;
  const die = game.die;
  if (die === null) return undefined;
  const rival = opponentOf(color);
  const threats = new Set(game.tokens[rival].flatMap(position =>
    position < 0 || position > 50 ? [] : Array.from({ length: 6 }, (_, i) => loopIndexOf(rival, position + i + 1))));
  return legalTokens(game.tokens, color, die).map(index => {
    const move = applyMove(game.tokens, color, index, die)!;
    const safe = isProtected(color, move.to) || !threats.has(loopIndexOf(color, move.to));
    const score = move.capture ? 400 : move.finished ? 300 : move.from === -1 ? 200 : (safe ? 100 : 0) + move.to;
    return { index, score };
  }).sort((a, b) => b.score - a.score)[0]?.index;
}
