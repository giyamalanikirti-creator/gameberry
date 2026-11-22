import { expect } from 'vitest';
import { applyStory, storySteps, T0 } from '../src/demo/story';
import type { PlayerId, State } from '../src/domain/types';
import { Action, reduce } from '../src/state/reducer';
import { createSeedState } from '../src/state/seed';
import { balance, totalGold } from '../src/state/selectors';

export { T0 };

/** Apply a product action as `actor`; throws if rejected. */
export function ok(s: State, actor: PlayerId | null, action: Action, at: number): State {
  const r = reduce(s, action, { at, actor, source: 'product' });
  if (!r.accepted) throw new Error(`${action.type} by ${actor} rejected: ${r.reason}`);
  return r.state;
}

export function no(s: State, actor: PlayerId | null, action: Action, at: number): string {
  const r = reduce(s, action, { at, actor, source: 'product' });
  expect(r.accepted).toBe(false);
  return r.reason ?? '';
}

/** State after the first n guided story steps, applied as product actions. */
export function story(n: number): State {
  const { state, failures } = applyStory(createSeedState(), n, 'product');
  expect(failures).toEqual([]);
  return state;
}

export const STEPS = storySteps().length;

export function balances(s: State): Record<PlayerId, number> {
  return {
    gunjan: balance(s, 'gunjan'),
    riya: balance(s, 'riya'),
    ananya: balance(s, 'ananya'),
    shruti: balance(s, 'shruti'),
    dev: balance(s, 'dev'),
  };
}

export function expectConserved(s: State) {
  expect(totalGold(s)).toBe(5000);
}

export const latestRound = (s: State) => Object.values(s.rounds).filter((r) => r.seriesId && r.id !== s.opening.roundId).pop()!;
export const seriesId = (s: State) => Object.keys(s.series)[0];
export const openInvite = (s: State, to: PlayerId) => Object.values(s.invites).find((i) => i.toPlayerId === to && i.status === 'open')!;

/** Play the current round to the end, each seat acting as itself. */
export function playOut(s: State, at: number): State {
  for (let i = 0; i < 80; i++) {
    const r = latestRound(s);
    if (r.status !== 'active' || !r.game) return s;
    const seat = r.game.seats[r.game.turn];
    s = ok(s, seat.playerId as PlayerId, { type: r.game.die === null ? 'ROLL' : 'MOVE', roundId: r.id }, at);
  }
  throw new Error('round did not finish');
}
