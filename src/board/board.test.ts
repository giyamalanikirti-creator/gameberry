import { describe, expect, it } from 'vitest';
import { freshDice, guidedDice } from './dice';
import {
  applyMove,
  endgameStart,
  LiveGame,
  moveToken,
  rollDie,
  suggestedToken,
  Tokens,
} from './engine';
import {
  FINISH_CELL,
  FINISH_INDEX,
  FIRST_LANE_INDEX,
  LANES,
  LAST_TRACK_INDEX,
  LOOP,
  ROUTES,
  SAFE_LOOP_INDICES,
  TRACK_LENGTH,
  isOnSharedTrack,
  isProtected,
  loopIndexOf,
  sameCell,
  validateRoute,
} from './geometry';
import { ORIGINAL_CAPTURE, buildFrames, totalDuration } from './replay';

describe('board geometry', () => {
  it('has a closed, connected 52-square loop', () => {
    expect(LOOP).toHaveLength(TRACK_LENGTH);
    expect(validateRoute(LOOP, { closed: true })).toEqual([]);
  });

  it.each(['red', 'yellow'] as const)('%s route is 57 connected squares ending in the centre', (color) => {
    const r = ROUTES[color];
    expect(r).toHaveLength(FINISH_INDEX + 1);
    expect(validateRoute(r)).toEqual([]);
    const lane = color === 'red' ? LANES.bl : LANES.tr;
    expect(r.slice(FIRST_LANE_INDEX, FINISH_INDEX)).toEqual(lane);
    expect(r[FINISH_INDEX]).toEqual(color === 'red' ? FINISH_CELL.bl : FINISH_CELL.tr);
  });

  it('home lanes never overlap the shared track', () => {
    for (const lane of Object.values(LANES)) {
      for (const cell of lane) expect(LOOP.some((l) => sameCell(l, cell))).toBe(false);
    }
  });

  it('start squares are safe', () => {
    expect(isProtected('red', 0)).toBe(true);
    expect(isProtected('yellow', 0)).toBe(true);
  });
});

describe('capture replay fixture', () => {
  const e = ORIGINAL_CAPTURE;

  it('is reproduced exactly by the movement engine', () => {
    const out = applyMove(e.before, e.color, e.tokenIndex, e.roll)!;
    expect(out).not.toBeNull();
    expect(out.path).toEqual(e.path);
    expect(out.tokens).toEqual(e.after);
    expect(out.capture).toEqual({ color: 'red', tokenIndex: 3, from: 50 });
  });

  it('puts Kirti on the last capturable shared square before her protected lane', () => {
    const kirtiPos = e.before.red[3];
    expect(kirtiPos).toBe(LAST_TRACK_INDEX);
    expect(isOnSharedTrack(kirtiPos)).toBe(true);
    expect(isProtected('red', kirtiPos)).toBe(false);
    // The very next step for red is the protected lane.
    expect(isProtected('red', kirtiPos + 1)).toBe(true);
  });

  it('lands Ahmed from behind on that exact square with a legal 3', () => {
    const dest = e.before.yellow[3] + e.roll;
    expect(loopIndexOf('yellow', dest)).toBe(loopIndexOf('red', 50));
    expect(isProtected('yellow', dest)).toBe(false);
    expect(SAFE_LOOP_INDICES.has(loopIndexOf('yellow', dest)!)).toBe(false);
    // Kirti's one active token is the only occupant of the destination.
    const occupants = e.before.red.filter((p) => loopIndexOf('red', p) === loopIndexOf('yellow', dest));
    expect(occupants).toHaveLength(1);
    const redOthers = e.before.yellow.filter((_, i) => i !== 3).map((p) => loopIndexOf('yellow', p));
    expect(redOthers.every((l) => l === null)).toBe(true); // Ahmed's other tokens stay off the path
  });

  it('builds a roughly three-second replay ending on the after-state', () => {
    const frames = buildFrames(e, { intro: 'i', step: () => 's', impact: 'x', outro: 'o' });
    expect(frames).toHaveLength(1 + e.path.length + 1);
    expect(frames[frames.length - 1].tokens).toEqual(e.after);
    const ms = totalDuration(frames);
    expect(ms).toBeGreaterThanOrEqual(2500);
    expect(ms).toBeLessThanOrEqual(3500);
  });

  it('does not mutate the fixture when replayed', () => {
    const copy = structuredClone(e);
    buildFrames(e, { intro: 'i', step: () => 's', impact: 'x', outro: 'o' });
    applyMove(e.before, e.color, e.tokenIndex, e.roll);
    expect(e).toEqual(copy);
  });
});

describe('protected lanes', () => {
  it('no yellow move ever captures a red token in its lane or on a safe square', () => {
    let captures = 0;
    const protectedSpots = [FIRST_LANE_INDEX, 52, 53, 54, 55, 0, 8, 13, 21];
    for (const bluePos of protectedSpots) {
      for (let redPos = 0; redPos <= LAST_TRACK_INDEX; redPos++) {
        for (let roll = 1; roll <= 6; roll++) {
          const tokens: Tokens = { red: [56, 56, 56, bluePos], yellow: [56, 56, 56, redPos] };
          const out = applyMove(tokens, 'yellow', 3, roll);
          if (out?.capture) captures++;
        }
      }
    }
    expect(captures).toBe(0);
  });

  it('two tokens on one square form a block that is not captured', () => {
    const tokens: Tokens = { red: [56, 56, 50, 50], yellow: [56, 56, 56, 21] };
    expect(applyMove(tokens, 'yellow', 3, 3)!.capture).toBeNull();
  });
});

function play(game: LiveGame, limit = 100): LiveGame {
  let g = game;
  for (let i = 0; i < limit && !g.winner; i++) {
    const rolled = rollDie(g, g.turn)!;
    g = rolled;
    if (g.die !== null) g = moveToken(g, g.turn, suggestedToken(g)!)!;
  }
  return g;
}

describe('quick-style endgame', () => {
  it('starts with three home, one in lane: Kirti needs 4, Ahmed needs 5, Kirti first', () => {
    const g = endgameStart(guidedDice());
    expect(FINISH_INDEX - g.tokens.red[3]).toBe(4);
    expect(FINISH_INDEX - g.tokens.yellow[3]).toBe(5);
    expect(g.tokens.red.filter((p) => p === FINISH_INDEX)).toHaveLength(3);
    expect(g.turn).toBe('red');
  });

  it('guided seed: Kirti 2, Ahmed 3, Kirti 2 — Kirti wins only after the final legal move', () => {
    let g = endgameStart(guidedDice());
    g = rollDie(g, 'red')!;
    expect(g.die).toBe(2);
    expect(g.winner).toBeNull();
    g = moveToken(g, 'red', 3)!;
    expect(FINISH_INDEX - g.tokens.red[3]).toBe(2);
    g = rollDie(g, 'yellow')!;
    expect(g.die).toBe(3);
    g = moveToken(g, 'yellow', 3)!;
    expect(FINISH_INDEX - g.tokens.yellow[3]).toBe(2);
    g = rollDie(g, 'red')!;
    expect(g.die).toBe(2);
    expect(g.winner).toBeNull(); // rolled but not moved
    g = moveToken(g, 'red', 3)!;
    expect(g.winner).toBe('red');
    expect(g.tokens.red.every((p) => p === FINISH_INDEX)).toBe(true);
  });

  it('an overshoot passes the turn with an explanation', () => {
    const g0 = endgameStart({ kind: 'guided', sequence: [5], index: 0, rng: 1 });
    const g = rollDie(g0, 'red')!;
    expect(g.die).toBeNull();
    expect(g.turn).toBe('yellow');
    expect(g.note).toEqual({ kind: 'overshoot', color: 'red', roll: 5, needed: 4 });
    expect(g.tokens).toEqual(g0.tokens);
  });

  it('rejects rolling twice, moving without a die and moving out of turn', () => {
    const g = rollDie(endgameStart(guidedDice()), 'red')!;
    expect(rollDie(g, 'red')).toBeNull();
    expect(moveToken(g, 'yellow', 3)).toBeNull();
    expect(moveToken(endgameStart(guidedDice()), 'red', 3)).toBeNull();
    expect(moveToken(g, 'red', 0)).toBeNull(); // finished token cannot move
  });

  it('fresh dice are reproducible from the persisted RNG state', () => {
    const a = play(endgameStart(freshDice(42)));
    const b = play(endgameStart(freshDice(42)));
    expect(a).toEqual(b);
  });

  it('an alternate seed lets Ahmed win', () => {
    // Seed 5 (documented in the README): Kirti rolls 5 and overshoots, Ahmed rolls exactly 5.
    let g = rollDie(endgameStart(freshDice(5)), 'red')!;
    expect(g.note).toMatchObject({ kind: 'overshoot', roll: 5, needed: 4 });
    g = rollDie(g, 'yellow')!;
    expect(g.die).toBe(5);
    g = moveToken(g, 'yellow', 3)!;
    expect(g.winner).toBe('yellow');
  });

  it('either player can win across seeds', () => {
    const winners = new Set<string>();
    for (let seed = 1; seed <= 40; seed++) winners.add(play(endgameStart(freshDice(seed))).winner!);
    expect(winners).toEqual(new Set(['red', 'yellow']));
  });
});
