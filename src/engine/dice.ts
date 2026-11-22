/**
 * Dice sources. Plain data, so the state is persisted after every roll and a
 * rolled-but-unspent die survives a refresh.
 */

export type DiceState =
  | { kind: 'fixture'; name: string; sequence: number[]; index: number; rng: number }
  | { kind: 'random'; seed: number; rng: number };

export function fixtureDice(name: string, sequence: number[], fallbackSeed = 20261122): DiceState {
  return { kind: 'fixture', name, sequence: [...sequence], index: 0, rng: fallbackSeed | 0 };
}

export function randomDice(seed: number): DiceState {
  return { kind: 'random', seed: seed | 0, rng: seed | 0 };
}

/** One mulberry32 step. Returns the next state and a die value 1–6. */
export function rngStep(state: number): { state: number; value: number } {
  const a = (state + 0x6d2b79f5) | 0;
  let t = a;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  const r = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  return { state: a, value: 1 + Math.floor(r * 6) };
}

export function nextDie(dice: DiceState): { value: number; dice: DiceState } {
  if (dice.kind === 'fixture' && dice.index < dice.sequence.length) {
    return { value: dice.sequence[dice.index], dice: { ...dice, index: dice.index + 1 } };
  }
  const step = rngStep(dice.rng);
  return { value: step.value, dice: { ...dice, rng: step.state } };
}

export function diceLabel(dice: DiceState): string {
  return dice.kind === 'fixture' ? `Fixture dice · ${dice.name}` : 'Random dice';
}
