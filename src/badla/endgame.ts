import { freshDice, nextDie, type DiceState } from '../board/dice';
import { destinationFor } from '../board/engine';
import { FINISH_INDEX } from '../board/geometry';
import type { Captain, Format, PlayerId, TeamSeat } from './model';

interface Pawn { player: PlayerId; side: Captain; position: number }

export interface Endgame {
  pawns: Pawn[];
  turn: number;
  die: number | null;
  rolls: number;
  dice: DiceState;
  winner: Captain | null;
  note: { player: PlayerId; roll: number; kind: 'overshot' | 'moved' | 'finished'; remaining: number } | null;
}

export function startEndgame(seats: TeamSeat[], format: Format, decider: boolean, seed: number | null): Endgame {
  const distances = format === 'doubles' ? (decider ? [3, 2, 3, 2] : [2, 3, 2, 3]) : [4, 5];
  const sequence = format === 'doubles' ? (decider ? [1, 2, 1, 2] : [2, 1, 2]) : [2, 3, 2];
  const dice: DiceState = seed === null ? { kind: 'guided', sequence, index: 0, rng: 20261123 } : freshDice(seed);
  return {
    pawns: seats.map((seat, i) => ({ player: seat.player, side: seat.side, position: FINISH_INDEX - distances[i] })),
    turn: 0, die: null, rolls: 0, dice, winner: null, note: null,
  };
}

function nextTurn(pawns: Pawn[], turn: number) {
  for (let offset = 1; offset <= pawns.length; offset++) {
    const index = (turn + offset) % pawns.length;
    if (pawns[index].position < FINISH_INDEX) return index;
  }
  return turn;
}

export function roll(game: Endgame, actor: PlayerId, expectedRolls: number): Endgame {
  const pawn = game.pawns[game.turn];
  if (game.winner || game.die !== null || actor !== pawn.player || expectedRolls !== game.rolls) return game;
  const { value, dice } = nextDie(game.dice);
  const rolled = { ...game, dice, rolls: game.rolls + 1 };
  if (destinationFor(pawn.position, value) !== null) return { ...rolled, die: value, note: null };
  return {
    ...rolled,
    turn: nextTurn(game.pawns, game.turn),
    note: { player: actor, roll: value, kind: 'overshot', remaining: FINISH_INDEX - pawn.position },
  };
}

export function move(game: Endgame, actor: PlayerId, expectedRolls: number): Endgame {
  const pawn = game.pawns[game.turn];
  if (game.winner || game.die === null || actor !== pawn.player || expectedRolls !== game.rolls) return game;
  const position = destinationFor(pawn.position, game.die);
  if (position === null) return game;
  const pawns = game.pawns.map((item, i) => i === game.turn ? { ...item, position } : item);
  const won = pawns.every(item => item.side !== pawn.side || item.position === FINISH_INDEX);
  return {
    ...game, pawns, die: null,
    turn: won ? game.turn : nextTurn(pawns, game.turn),
    winner: won ? pawn.side : null,
    note: { player: actor, roll: game.die, kind: position === FINISH_INDEX ? 'finished' : 'moved', remaining: FINISH_INDEX - position },
  };
}
