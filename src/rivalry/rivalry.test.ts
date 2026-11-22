// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { DAY, HOUR } from '../domain/time';
import { botMove, moveLudo, newLudo, rollLudo } from './ludo';
import { dayOf, DEBT_AGE, debtGroups, ledger, newRivalry, settingsFor, WINDOW, type Card, type Person, type RivalryState } from './model';
import { activeMatch, reduce, score, tied, type Action } from './reducer';

function driver() {
  let s = newRivalry();
  const apply = (a: Action) => { s = reduce(s, a); return s; };
  const roll = (actor: Person) => {
    const match = activeMatch(s)!;
    return apply({ type: 'roll', actor, matchId: match.id, rolls: match.board.rolls });
  };
  const move = (actor: Person, token: number) => {
    const match = activeMatch(s)!;
    return apply({ type: 'move', actor, matchId: match.id, rolls: match.board.rolls, token });
  };
  const opening = () => {
    apply({ type: 'play', actor: 'riya' });
    roll('riya');
    move('riya', 3);
    roll('gunjan');
    move('gunjan', 3);
    apply({ type: 'finishDemo', actor: 'riya' });
    expect(s.matches[0].board.winner).toBe('yellow');
  };
  const card = () => s.cards.at(-1)!;
  const ask = () => apply({ type: 'ask', actor: 'riya', debtId: s.debts[0].id });
  const reply = (response: 'tomorrow' | 'now' | 'pass') => apply({ type: 'respond', actor: 'gunjan', id: card().id, response });
  const confirm = (actor: Person) => apply({ type: 'confirm', actor, id: card().id, start: card().window!.start });
  const view = (actor: Person) => apply({ type: 'view', actor, screen: 'invite', id: card().id });
  const skip = (to: number) => apply({ type: 'clock', actor: 'riya', to });
  const ready = (actor: Person) => apply({ type: 'ready', actor, id: card().id });
  return { get s() { return s; }, apply, roll, move, opening, card, ask, reply, confirm, view, skip, ready };
}

describe('four-token Ludo', () => {
  it('requires a six to leave the yard and does not allow a third consecutive six', () => {
    let game = newLudo(false, true, 10);
    game = { ...game, dice: { kind: 'guided', index: 0, sequence: [2, 1, 6, 6, 6], rng: 8 } };
    game = rollLudo(game, 'red');
    expect(game.turn).toBe('yellow');
    game = rollLudo(game, 'yellow');
    game = rollLudo(game, 'red');
    game = moveLudo(game, 'red', 0);
    expect(game.tokens.red).toEqual([0, -1, -1, -1]);
    game = rollLudo(game, 'red');
    game = moveLudo(game, 'red', 1);
    game = rollLudo(game, 'red');
    expect(game.message).toBe('third-six');
    expect(game.turn).toBe('yellow');
    expect(game.die).toBeNull();
  });

  it('plays from eight tokens in the yards through a legal full-game win', () => {
    let game = newLudo(false, true, 73);
    for (let i = 0; i < 1800 && !game.winner; i++) {
      const token = botMove(game);
      game = token === undefined ? rollLudo(game, game.turn) : moveLudo(game, game.turn, token);
    }
    expect(game.winner).not.toBeNull();
    expect(game.tokens[game.winner!]).toEqual([56, 56, 56, 56]);
  });

  it('keeps a token safe on a star, ignores overshoots and grants another roll on home', () => {
    let game = { ...newLudo(false, true, 1), tokens: { red: [55, 56, -1, -1], yellow: [56, 56, 56, 56] }, die: 2 };
    expect(moveLudo(game, 'red', 0)).toBe(game);
    expect(moveLudo({ ...game, die: 1 }, 'red', 0).turn).toBe('red');
    game = { ...game, tokens: { red: [19, 56, 56, 56], yellow: [47, 56, 56, 56] }, die: 2 };
    expect(moveLudo(game, 'red', 0).lastMove?.capture).toBeNull();
  });
});

describe('Badla Rivals', () => {
  it('plays the two-person scheduled story and counts a return only after each person opens their window', () => {
    const d = driver();
    d.opening();
    expect(d.s.debts[0].kaat.spaces).toBe(41);
    expect(d.s.debts[0].kaat.replay.after.red[3]).toBe(-1);
    expect(d.s.debts[0].until - d.s.now).toBe(DEBT_AGE);
    expect(debtGroups(d.s, 'gunjan')).toEqual([]);
    d.ask();
    d.view('gunjan');
    d.reply('tomorrow');
    expect(d.card().status).toBe('proposed');
    d.confirm('riya');
    const start = d.card().window!.start;
    expect(d.card().status).toBe('confirmed');
    d.skip(start);
    expect(d.s.pushes.filter(push => push.kind === 'window')).toHaveLength(2);
    expect(d.s.activities.filter(activity => activity.incremental)).toHaveLength(0);
    d.apply({ type: 'openPush', actor: 'riya', id: d.s.pushes.find(push => push.actor === 'riya')!.id });
    d.view('riya');
    expect(d.s.activities.filter(activity => activity.incremental)).toEqual([{ person: 'riya', date: dayOf(start, 'riya'), incremental: true }]);
    d.ready('riya');
    d.ready('gunjan');
    expect(activeMatch(d.s)?.mode).toBe('badla');
    d.roll('riya');
    d.move('riya', 3);
    expect(d.s.matches[1].board.winner).toBe('red');
    const series = d.s.series[0];
    expect(score(series, 'gunjan')).toBe(1);
    expect(tied(series)).toBe(true);
    expect(debtGroups(d.s, 'riya')).toEqual([]);
    expect(ledger(d.s, 'riya', 'gunjan')).toMatchObject({ given: 0, taken: 1, played: 2, wins: 1, level: 'Acquaintance' });
    const matchId = d.s.matches[1].id;
    d.apply({ type: 'sticker', actor: 'gunjan', matchId, sticker: 'Rematch?' });
    expect(d.s.matches[1].sticker).toBeUndefined();
    d.apply({ type: 'sticker', actor: 'riya', matchId, sticker: 'Rematch?' });
    expect(ledger(d.s, 'gunjan', 'riya').sticker).toBe('Rematch?');
    d.apply({ type: 'decider', actor: 'riya', seriesId: series.id });
    d.reply('now');
    d.roll('riya');
    d.move('riya', 3);
    expect(tied(d.s.series[0])).toBe(false);
    expect(score(d.s.series[0], 'riya')).toBe(2);
    expect(ledger(d.s, 'gunjan', 'riya').sticker).toBeUndefined();
  });

  it('keeps a passed debt available until its 72-hour boundary', () => {
    const d = driver();
    d.opening();
    d.ask();
    d.reply('pass');
    const until = d.s.debts[0].until;
    d.skip(until - 1);
    expect(debtGroups(d.s, 'riya')).toHaveLength(1);
    d.skip(until);
    expect(debtGroups(d.s, 'riya')).toHaveLength(0);
  });

  it('requires fresh confirmation of the later proposed window', () => {
    const d = driver();
    d.opening();
    d.ask();
    d.reply('tomorrow');
    const prior = d.card().window!.start;
    d.apply({ type: 'propose', actor: 'riya', id: d.card().id, start: prior + HOUR });
    d.apply({ type: 'propose', actor: 'gunjan', id: d.card().id, start: prior + 2 * HOUR });
    const before = d.s;
    d.apply({ type: 'confirm', actor: 'riya', id: d.card().id, start: prior + HOUR });
    expect(d.s).toBe(before);
    d.confirm('riya');
    expect(d.card().window?.start).toBe(prior + 2 * HOUR);
    expect(d.card().status).toBe('confirmed');
  });

  it('closes a missed appointment at the end boundary and applies a private cooldown on the second miss', () => {
    const d = driver();
    d.opening();
    d.ask();
    d.reply('tomorrow');
    d.confirm('riya');
    d.skip(d.card().window!.start);
    const reminder = d.s.pushes.find(push => push.actor === 'riya')!;
    d.skip(d.card().window!.end);
    d.apply({ type: 'openPush', actor: 'riya', id: reminder.id });
    expect(d.s.activities.filter(activity => activity.incremental)).toHaveLength(0);
    d.apply({ type: 'reschedule', actor: 'riya', id: d.card().id });
    expect(d.card().status).toBe('proposed');
    d.confirm('gunjan');
    const end = d.card().window!.end;
    d.skip(end);
    expect(d.card().status).toBe('missed');
    expect(settingsFor(d.s, 'riya', 'gunjan').cooldown).toBe(end + 7 * DAY);
    const paused = d.s;
    d.apply({ type: 'reschedule', actor: 'gunjan', id: d.card().id });
    expect(d.s).toBe(paused);
  });

  it('closes pending links when muted and never sends more than two reminders per person', () => {
    const d = driver();
    d.opening();
    d.ask();
    d.reply('tomorrow');
    d.confirm('riya');
    d.skip(d.card().window!.start);
    d.ready('riya');
    d.ready('riya');
    expect(d.s.pushes.filter(push => push.actor === 'gunjan')).toHaveLength(2);
    d.apply({ type: 'pairSetting', actor: 'gunjan', rival: 'riya', key: 'muted' });
    expect(d.card().status).toBe('closed');
    d.ready('gunjan');
    expect(activeMatch(d.s)).toBeUndefined();
  });

  it('keeps a confirmed appointment’s return date when the visit crosses midnight', () => {
    const d = driver();
    d.opening();
    d.ask();
    d.reply('tomorrow');
    d.apply({ type: 'propose', actor: 'riya', id: d.card().id, start: d.card().window!.start + 3 * HOUR });
    d.confirm('gunjan');
    const start = d.card().window!.start;
    d.skip(start + HOUR);
    d.view('riya');
    expect(d.s.activities.at(-1)?.date).toBe(dayOf(start, 'riya'));
    expect(d.s.pushes).toEqual([]);
  });

  it('opens a standing Derby for the seeded Nemesis without duplicating weeks', () => {
    const d = driver();
    d.apply({ type: 'pairSetting', actor: 'riya', key: 'derby', rival: 'shruti' });
    expect(d.card().kind).toBe('derby');
    expect(d.card().status).toBe('confirmed');
    const { start } = d.card().window!;
    d.skip(start);
    d.ready('riya');
    d.ready('shruti');
    d.roll('riya');
    d.move('riya', 3);
    d.skip(start + WINDOW);
    const derbies: Card[] = d.s.cards.filter(card => card.kind === 'derby');
    expect(derbies.map(card => card.window?.start)).toEqual([start, start + 7 * DAY]);
  });

  it('limits the pair to three Badlas per day while allowing a later booking', () => {
    const d = driver();
    for (let i = 0; i < 4; i++) {
      d.opening();
      d.apply({ type: 'ask', actor: 'riya', debtId: d.s.debts.at(-1)!.id });
      d.reply('now');
      if (i === 3) break;
      d.roll('riya');
      d.move('riya', 3);
    }
    expect(d.card().status).toBe('asked');
    expect(d.s.matches.filter(match => match.mode === 'badla')).toHaveLength(3);
    d.reply('tomorrow');
    expect(d.card().status).toBe('proposed');
  });

  it('allows no cross-role move and restores a pending roll from serialized state', () => {
    const d = driver();
    d.apply({ type: 'play', actor: 'riya' });
    const before = d.s;
    d.roll('gunjan');
    expect(d.s).toBe(before);
    d.roll('riya');
    const loaded = JSON.parse(JSON.stringify(d.s)) as RivalryState;
    expect(activeMatch(loaded)?.board.die).toBe(2);
    expect(reduce(loaded, { type: 'roll', actor: 'riya', matchId: loaded.active!, rolls: 0 })).toBe(loaded);
  });
});
