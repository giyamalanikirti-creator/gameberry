// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { DEMO_START, DAY, HOUR, MINUTE } from '../domain/time';
import {
  activePlayerDays, balance, CAPTAINS, clubPairs, createDemo, currentRound, PLAYERS, receipt, scores,
  seatFor, seriesStatus, type DemoState, type Format, type PlayerId,
} from './model';
import { canPredict, reduce, visibleFixture, type Command } from './reducer';

const T = DEMO_START;
const TOMORROW = T + 23 * HOUR;
const DOUBLES = ['riya', 'gunjan', 'ananya', 'shruti'] as const;

function session() {
  let state = createDemo();
  let at = T;
  function act(actor: PlayerId, command: Command) {
    state = reduce(state, { ...command, actor, at });
    return state;
  }
  function round() { return state.rounds.at(-1)!; }
  function terms() { return { roundId: round().id, revision: round().revision }; }
  function propose(format: Format = 'doubles', choices: number[] = [], club = false) {
    act('riya', { type: 'propose', format, mode: choices.length ? 'scheduled' : 'now', choices, club });
  }
  function accept() { act('gunjan', { type: 'accept', ...terms() }); }
  function partner(side: 'riya' | 'gunjan', player: PlayerId) { act(side, { type: 'invite', player, roundId: round().id }); }
  function confirm(players: readonly PlayerId[]) { for (const actor of players) act(actor, { type: 'confirm', ...terms() }); }
  function ready(players: readonly PlayerId[]) { for (const actor of players) act(actor, { type: 'ready', ...terms() }); }
  function play() {
    for (let index = 0; round().status === 'active' && index < 100; index++) {
      const game = round().game!;
      const actor = game.pawns[game.turn].player;
      act(actor, { type: game.die === null ? 'roll' : 'move', roundId: round().id, rolls: game.rolls });
    }
    expect(round().status).toBe('settled');
  }
  function comeBack() {
    propose();
    accept();
    partner('riya', 'ananya');
    partner('gunjan', 'shruti');
    confirm(['ananya', 'shruti']);
    ready(DOUBLES);
    play();
  }
  function grudge() {
    propose('doubles', [T + HOUR, TOMORROW], true);
    act('gunjan', { type: 'selectTime', ...terms(), start: TOMORROW });
    confirm(DOUBLES);
    expect(round().status).toBe('confirmed');
  }
  function clock(instant: number) { at = instant; act('dev', { type: 'tick' }); }
  return { act, round, terms, propose, accept, partner, confirm, ready, play, comeBack, grudge, clock, get state() { return state; } };
}

const golds = (state: DemoState) => ['gunjan', 'riya', 'ananya', 'shruti', 'dev'].map(player => balance(state, player as PlayerId));

describe('Badla series and gold', () => {
  it('settles the full two-day story once, with separate player receipts and conserved gold', () => {
    const s = session();
    expect(golds(s.state)).toEqual([1100, 900, 1000, 1000, 1000]);
    expect(scores(s.state)).toEqual({ gunjan: 1, riya: 0 });
    s.comeBack();
    expect(scores(s.state)).toEqual({ gunjan: 1, riya: 1 });
    expect(golds(s.state)).toEqual([1000, 1000, 1100, 900, 1000]);
    expect(s.round().game?.note).toMatchObject({ player: 'ananya', kind: 'finished' });
    expect(receipt(s.state, 'ananya', s.round().id)).toEqual({ entry: 100, pot: 200, bonus: 0, refund: 0, net: 100 });
    const rematchId = s.round().id;
    s.act('shruti', { type: 'saveSeat', roundId: rematchId });
    s.act('ananya', { type: 'saveSeat', roundId: rematchId });
    s.act('ananya', { type: 'saveSeat', roundId: rematchId });
    expect(s.state.assists).toEqual([{ roundId: rematchId, player: 'ananya', captain: 'riya', saved: true }]);
    s.propose('doubles', [TOMORROW], true);
    s.act('gunjan', { type: 'selectTime', ...s.terms(), start: TOMORROW });
    expect(seatFor(s.round(), 'ananya')?.consent).toBeNull();
    s.confirm(DOUBLES.slice(0, 3));
    expect(s.state.fixtures).toHaveLength(0);
    s.confirm(['shruti', 'shruti']);
    expect(s.state.fixtures).toHaveLength(1);
    const fixtureId = s.state.fixtures[0].id;
    s.act('dev', { type: 'pick', fixtureId, side: 'riya' });
    s.act('dev', { type: 'pick', fixtureId, side: 'gunjan' });
    expect(s.state.predictions).toEqual([{ fixtureId, player: 'dev', side: 'gunjan' }]);
    expect(s.state.events.filter(event => event.name === 'unique_predictor')).toHaveLength(1);
    s.clock(TOMORROW);
    s.ready(DOUBLES);
    s.play();
    s.act('shruti', { type: 'move', roundId: s.round().id, rolls: 4 });
    s.act('dev', { type: 'openFixture', fixtureId });
    expect(s.round().game?.note).toMatchObject({ player: 'shruti', kind: 'finished' });
    expect(scores(s.state)).toEqual({ gunjan: 2, riya: 1 });
    expect(golds(s.state)).toEqual([1100, 900, 1000, 1000, 1000]);
    expect(Object.keys(PLAYERS).reduce((sum, id) => sum + balance(s.state, id as PlayerId), 0)).toBe(6000);
    expect(s.state.events.filter(event => event.name === 'round_completed')).toHaveLength(2);
    expect(s.state.events.filter(event => event.name === 'next_day_check_in')).toHaveLength(4);
    expect(activePlayerDays(s.state.events)).toBe(10);
  });

  it.each([['singles', 100, 400], ['doubles', 50, 200]] as const)(
    'settles a %s sweep and keeps the daily bonus separate', (format, share, payout) => {
      const s = session();
      s.act('gunjan', { type: 'demo', change: { bonus: true, seed: 14 } });
      s.act('gunjan', { type: 'propose', format, mode: 'now', choices: [], club: false });
      s.act('riya', { type: 'accept', ...s.terms() });
      if (format === 'doubles') {
        s.partner('riya', 'ananya');
        s.partner('gunjan', 'shruti');
        s.confirm(['ananya', 'shruti']);
        s.ready(DOUBLES);
      } else s.ready(CAPTAINS);
      s.play();
      expect(scores(s.state)).toEqual({ gunjan: 2, riya: 0 });
      expect(receipt(s.state, 'gunjan', s.round().id)).toMatchObject({ bonus: share, pot: payout });
      expect(balance(s.state, 'gunjan')).toBe(format === 'singles' ? 1400 : 1250);
      if (format === 'doubles') expect(receipt(s.state, 'shruti', s.round().id).bonus).toBe(50);
      expect(clubPairs(s.state)).toBeUndefined();
      const final = s.state;
      s.propose();
      expect(s.state).toBe(final);
    },
  );

  it('pays at most one bonus share per player per UTC day', () => {
    const s = session();
    s.state.wallet.push({ roundId: 'earlier-sweep', player: 'gunjan', kind: 'bonus', gold: 100, at: T - MINUTE });
    s.act('gunjan', { type: 'demo', change: { bonus: true, seed: 5 } });
    s.propose('singles');
    s.accept();
    s.ready(CAPTAINS);
    s.play();
    expect(s.round().winner).toBe('gunjan');
    expect(receipt(s.state, 'gunjan', s.round().id).bonus).toBe(0);
  });

  it('supports a private doubles decider with an alternate winner', () => {
    const s = session();
    s.comeBack();
    s.act('riya', { type: 'demo', change: { seed: 14 } });
    s.propose('doubles', [TOMORROW]);
    s.accept();
    s.confirm(DOUBLES);
    s.clock(TOMORROW);
    s.ready(DOUBLES);
    s.play();
    expect(s.round().winner).toBe('riya');
    expect(s.state.fixtures).toEqual([]);
    expect(seriesStatus(s.state)).toBe('won');
  });

  it('allows a mutually agreed singles decider after singles-only history', () => {
    const s = session();
    s.propose('singles');
    s.accept();
    s.ready(CAPTAINS);
    s.play();
    expect(s.round().winner).toBe('riya');
    expect(seriesStatus(s.state)).toBe('tied');
    expect(clubPairs(s.state)).toBeUndefined();
    s.propose('singles');
    s.accept();
    s.ready(CAPTAINS);
    s.play();
    expect(s.round().winner).toBe('riya');
    expect(seriesStatus(s.state)).toBe('won');
  });
});

describe('Badla permissions and recovery', () => {
  it('rejects duplicate, blocked and wrong-role invitations and leaves the opening intact when passed', () => {
    const s = session();
    s.act('dev', { type: 'propose', format: 'doubles', mode: 'now', choices: [], club: false });
    s.act('riya', { type: 'block', player: 'riya', other: 'gunjan' });
    s.propose();
    expect(s.state.rounds).toHaveLength(0);
    s.act('riya', { type: 'block', player: 'riya', other: 'gunjan' });
    s.propose();
    s.propose();
    s.act('riya', { type: 'accept', ...s.terms() });
    expect(s.round().status).toBe('proposed');
    s.act('gunjan', { type: 'pass', ...s.terms() });
    expect(s.round().status).toBe('cancelled');
    expect(s.state.rounds).toHaveLength(1);
    expect(currentRound(s.state)).toBeUndefined();
    expect(scores(s.state)).toEqual({ gunjan: 1, riya: 0 });
    expect(golds(s.state)).toEqual([1100, 900, 1000, 1000, 1000]);
  });

  it('rechecks the terms after a decline and replacement, and settles a cancelled booking privately if both captains agree', () => {
    const s = session();
    s.propose();
    s.accept();
    s.partner('riya', 'ananya');
    s.partner('gunjan', 'shruti');
    s.confirm(['shruti']);
    const stale = s.terms();
    s.act('ananya', { type: 'pass', ...stale });
    s.partner('riya', 'meera');
    s.act('shruti', { type: 'confirm', ...stale });
    s.confirm(['meera']);
    expect(s.round().status).toBe('filling');
    s.confirm(['shruti']);
    expect(s.round().status).toBe('check-in');
    expect(seatFor(s.round(), 'gunjan')?.consent).toBeNull();
    s.act('gunjan', { type: 'cancel', roundId: s.round().id });
    expect(s.round().status).toBe('cancelled');
    expect(golds(s.state)).toEqual([1100, 900, 1000, 1000, 1000]);
    const oldId = s.round().id;
    s.propose('singles');
    expect(s.round().id).not.toBe(oldId);
    s.accept();
    s.ready(CAPTAINS);
    s.play();
    expect(s.round().winner).toBe('riya');
  });

  it('blocks the whole debit when funds are missing, persists a pending roll, and refunds a void once', () => {
    const s = session();
    s.propose('singles');
    s.accept();
    s.ready(['riya']);
    s.act('dev', { type: 'demo', change: { balances: { riya: 150 } } });
    s.ready(['gunjan', 'gunjan']);
    expect(s.round().status).toBe('check-in');
    expect(seatFor(s.round(), 'riya')?.ready).toBe(false);
    expect(s.state.wallet.filter(row => row.roundId === s.round().id)).toHaveLength(0);
    s.act('dev', { type: 'demo', change: { balances: {} } });
    s.ready(['riya', 'riya']);
    s.act('riya', { type: 'roll', roundId: s.round().id, rolls: 0 });
    const restored = JSON.parse(JSON.stringify(s.state)) as DemoState;
    expect(restored.rounds[0].game?.die).toBe(2);
    expect(reduce(restored, { at: T, actor: 'riya', type: 'roll', roundId: s.round().id, rolls: 0 })).toBe(restored);
    const productEvents = s.state.events.length;
    s.clock(T + 2 * DAY);
    expect(s.round().status).toBe('active');
    s.act('riya', { type: 'void', roundId: s.round().id });
    s.act('riya', { type: 'void', roundId: s.round().id });
    expect(s.round().status).toBe('voided');
    expect(s.state.wallet.filter(row => row.roundId === s.round().id && row.kind === 'refund')).toHaveLength(2);
    expect(golds(s.state)).toEqual([1100, 900, 1000, 1000, 1000]);
    expect(s.state.events).toHaveLength(productEvents);
  });

  it('records a table forfeit via the same result and payout path', () => {
    const s = session();
    s.propose('singles');
    s.accept();
    s.ready(CAPTAINS);
    s.act('gunjan', { type: 'forfeit', roundId: s.round().id, loser: 'riya' });
    s.act('riya', { type: 'forfeit', roundId: s.round().id, loser: 'gunjan' });
    expect(s.round().game?.winner).toBe('gunjan');
    expect(s.round().reason).toBe('forfeit');
    expect(scores(s.state)).toEqual({ gunjan: 2, riya: 0 });
    expect(receipt(s.state, 'gunjan', s.round().id).net).toBe(200);
  });

  it('requires a shared club and withdraws a fixture if a partner drops, with no prediction verdict', () => {
    const s = session();
    s.comeBack();
    s.act('shruti', { type: 'membership', player: 'shruti' });
    expect(clubPairs(s.state)).toBeUndefined();
    s.propose('doubles', [TOMORROW], true);
    expect(currentRound(s.state)).toBeUndefined();
    s.act('shruti', { type: 'membership', player: 'shruti' });
    s.grudge();
    const fixtureId = s.state.fixtures[0].id;
    s.act('dev', { type: 'pick', fixtureId, side: 'riya' });
    s.act('shruti', { type: 'cancel', roundId: s.round().id });
    expect(visibleFixture(s.state, fixtureId, 'dev')?.round.winner).toBeNull();
    expect(canPredict(s.state, fixtureId, 'dev', T)).toBe(false);
    expect(clubPairs(s.state)).toBeUndefined();
    s.propose('doubles');
    s.accept();
    expect(seatFor(s.round(), 'shruti')).toBeUndefined();
    s.partner('gunjan', 'meera');
    expect(seatFor(s.round(), 'meera')?.side).toBe('gunjan');
    s.act('riya', { type: 'cancel', roundId: s.round().id });
    s.propose('singles');
    s.accept();
    s.ready(CAPTAINS);
    s.play();
    expect(s.state.fixtures).toHaveLength(1);
  });

  it('locks predictions at start, respects membership and mute, and closes missed windows with no ledger entries', () => {
    const s = session();
    s.comeBack();
    s.act('ananya', { type: 'mute', player: 'ananya' });
    s.grudge();
    const fixtureId = s.state.fixtures[0].id;
    s.act('riya', { type: 'pick', fixtureId, side: 'riya' });
    s.act('meera', { type: 'pick', fixtureId, side: 'riya' });
    expect(visibleFixture(s.state, fixtureId, 'meera')).toBeUndefined();
    expect(s.state.predictions).toHaveLength(0);
    s.clock(TOMORROW - 1);
    s.ready(['riya']);
    expect(seatFor(s.round(), 'riya')?.ready).toBe(false);
    s.act('dev', { type: 'pick', fixtureId, side: 'riya' });
    s.clock(TOMORROW);
    expect(s.state.invites.some(invite => invite.roundId === s.round().id && invite.kind === 'check-in' && invite.to === 'ananya')).toBe(false);
    s.act('dev', { type: 'pick', fixtureId, side: 'gunjan' });
    expect(s.state.predictions).toEqual([{ fixtureId, player: 'dev', side: 'riya' }]);
    s.ready(DOUBLES.slice(0, 3));
    s.clock(TOMORROW + 30 * MINUTE);
    s.ready(['shruti']);
    expect(s.round().reason).toBe('missed');
    expect(seriesStatus(s.state)).toBe('expired');
    expect(scores(s.state)).toEqual({ gunjan: 1, riya: 1 });
    expect(s.state.wallet.filter(row => row.roundId === s.round().id)).toHaveLength(0);
  });
});
