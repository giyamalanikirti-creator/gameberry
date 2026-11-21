/**
 * Dice sources. The state is plain data so it can be persisted after every
 * roll and resumed after a refresh.
 */

export type DiceState =
  | { kind: 'guided'; sequence: number[]; index: number; rng: number }
  | { kind: 'fresh'; seed: number; rng: number };

/** The guided demo: Kirti 2, Ahmed 3, Kirti 2. */
export const GUIDED_SEQUENCE = [2, 3, 2];

export function guidedDice(fallbackSeed = 20261123): DiceState {
  return { kind: 'guided', sequence: [...GUIDED_SEQUENCE], index: 0, rng: fallbackSeed | 0 };
}

export function freshDice(seed: number): DiceState {
  return { kind: 'fresh', seed: seed | 0, rng: seed | 0 };
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
  if (dice.kind === 'guided' && dice.index < dice.sequence.length) {
    return { value: dice.sequence[dice.index], dice: { ...dice, index: dice.index + 1 } };
  }
  const step = rngStep(dice.rng);
  return { value: step.value, dice: { ...dice, rng: step.state } };
}
