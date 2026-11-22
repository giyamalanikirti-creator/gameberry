import { describe, expect, it } from 'vitest';
import { LANES, LOOP, ROUTES, COLORS, FINISH_INDEX, LAST_TRACK_INDEX, isProtected, loopIndexOf, validateRoute, COLOR_QUADRANT } from '../src/engine/board';
import { fixtureDice, randomDice } from '../src/engine/dice';
import { FIXTURES, FIXTURE_NAMES } from '../src/engine/fixtures';
import { OPENING_CAPTURE } from '../src/engine/replay';
import { LiveGame, applyMove, createGame, moveToken, rollDie } from '../src/engine/rules';

const DOUBLES = [
  { playerId: 'riya', color: 'red' as const, side: 'A' as const },
  { playerId: 'gunjan', color: 'teal' as const, side: 'B' as const },
  { playerId: 'ananya', color: 'amber' as const, side: 'A' as const },
  { playerId: 'shruti', color: 'blue' as const, side: 'B' as const },
];

function play(g: LiveGame): { game: LiveGame; log: string[] } {
  const log: string[] = [];
  for (let i = 0; i < 60 && !g.winnerSide; i++) {
    const who = g.seats[g.turn].playerId;
    g = rollDie(g, g.turn)!;
    if (g.die === null) { log.push(`${who} overshoots`); continue; }
    const roll = g.die;
    g = moveToken(g, g.turn === -1 ? 0 : g.turn)!;
    const s = g.seats.find((x) => x.playerId === who)!;
    log.push(s.pos === FINISH_INDEX ? `${who} finishes on ${roll}` : `${who} → ${FINISH_INDEX - s.pos}`);
  }
  return { game: g, log };
}

function doubles(name: keyof typeof FIXTURES) {
  const f = FIXTURES[name].doubles;
  return createGame('doubles', DOUBLES.map((s, i) => ({ ...s, distance: f.distances[i] })), fixtureDice(name, f.rolls));
}

describe('board', () => {
  it('loop and all four routes are connected; lanes are off the shared track', () => {
    expect(validateRoute(LOOP, { closed: true })).toEqual([]);
    for (const c of COLORS) {
      expect(ROUTES[c]).toHaveLength(57);
      expect(validateRoute(ROUTES[c])).toEqual([]);
      for (const cell of LANES[COLOR_QUADRANT[c]]) expect(LOOP.some((l) => l.r === cell.r && l.c === cell.c)).toBe(false);
    }
  });
});

describe('opening capture snapshot', () => {
  it('is a legal roll landing on an unprotected shared square just before the protected lane', () => {
    const e = OPENING_CAPTURE;
    const out = applyMove(e.before, e.color, e.tokenIndex, e.roll)!;
    expect(out.path).toEqual(e.path);
    expect(out.tokens).toEqual(e.after);
    expect(out.capture).toMatchObject({ color: 'red', tokenIndex: 3, from: LAST_TRACK_INDEX });
    expect(isProtected('red', LAST_TRACK_INDEX)).toBe(false);
    expect(isProtected('red', LAST_TRACK_INDEX + 1)).toBe(true);
    expect(loopIndexOf('teal', out.to)).toBe(loopIndexOf('red', LAST_TRACK_INDEX));
  });
});

describe('guided sequences', () => {
  it('comeback 2,3,2,3 with rolls 2,1,2: Riya finishes, Gunjan to 2, Ananya finishes → Riya & Ananya win', () => {
    const { game, log } = play(doubles('comeback'));
    expect(log).toEqual(['riya finishes on 2', 'gunjan → 2', 'ananya finishes on 2']);
    expect(game.winnerSide).toBe('A');
  });

  it('decider 3,2,3,2 with rolls 1,2,1,2: Gunjan and Shruti finish → Gunjan & Shruti win', () => {
    const { game, log } = play(doubles('decider'));
    expect(log).toEqual(['riya → 2', 'gunjan finishes on 2', 'ananya → 2', 'shruti finishes on 2']);
    expect(game.winnerSide).toBe('B');
  });

  it('every named fixture produces its labelled side in both formats', () => {
    const expected: Record<string, 'A' | 'B'> = { comeback: 'A', decider: 'B', 'sweep-gunjan': 'B', 'sweep-riya': 'A', 'decider-riya': 'A' };
    for (const n of FIXTURE_NAMES) {
      expect(play(doubles(n)).game.winnerSide).toBe(expected[n]);
      const f = FIXTURES[n].singles;
      const g = createGame('singles', DOUBLES.slice(0, 2).map((s, i) => ({ ...s, distance: f.distances[i] })), fixtureDice(n, f.rolls));
      expect(play(g).game.winnerSide).toBe(expected[n]);
    }
  });
});

describe('rules', () => {
  it('finishing needs the exact roll; an overshoot passes the turn without moving', () => {
    const g0 = createGame('singles', DOUBLES.slice(0, 2).map((s) => ({ ...s, distance: 2 })), fixtureDice('t', [5]));
    const g = rollDie(g0, 0)!;
    expect(g.die).toBeNull();
    expect(g.turn).toBe(1);
    expect(g.seats[0].pos).toBe(g0.seats[0].pos);
    expect(g.note).toMatchObject({ kind: 'overshoot', roll: 5, needed: 2 });
  });

  it('one turn per roll (no extra turn on a six) and finished players are skipped', () => {
    const g0 = createGame('doubles', DOUBLES.map((s, i) => ({ ...s, distance: i === 0 ? 1 : 5 })), fixtureDice('t', [1, 6, 1, 1]));
    let g = moveToken(rollDie(g0, 0)!, 0)!; // Riya finishes
    expect(g.turn).toBe(1);
    g = rollDie(g, 1)!; // Gunjan rolls 6 at distance 5: overshoot, no extra turn
    expect(g.turn).toBe(2);
    g = moveToken(rollDie(g, 2)!, 2)!; // Ananya
    g = moveToken(rollDie(g, 3)!, 3)!; // Shruti
    expect(g.turn).toBe(1); // Riya (finished) skipped
  });

  it('random dice are reproducible from the persisted RNG state', () => {
    const mk = () => createGame('doubles', DOUBLES.map((s) => ({ ...s, distance: 3 })), randomDice(99));
    expect(play(mk()).game).toEqual(play(mk()).game);
  });

  it('a rolled die is kept until spent', () => {
    const g = rollDie(doubles('comeback'), 0)!;
    expect(g.die).toBe(2);
    expect(rollDie(g, 0)).toBeNull();
    expect(JSON.parse(JSON.stringify(g)).die).toBe(2);
  });
});
