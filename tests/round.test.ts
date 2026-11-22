import { describe, expect, it } from 'vitest';
import { DECIDER_SLOT } from '../src/demo/story';
import { reduce } from '../src/state/reducer';
import { createSeedState } from '../src/state/seed';
import { liveFixtureForRound, liveSeats, seatIsStale, seriesScore, termsHash } from '../src/state/selectors';
import { MINUTE } from '../src/domain/time';
import type { State } from '../src/domain/types';
import { balances, latestRound, no, ok, openInvite, seriesId, story, T0 } from './helpers';

const at = (n: number) => T0 + n * MINUTE;

describe('round lifecycle: roster to settlement', () => {
  it('partner declines: seat returns to open, "Replace Shruti", no debit, series intact', () => {
    let s = story(4);
    s = ok(s, 'shruti', { type: 'RESPOND_PARTNER', inviteId: openInvite(s, 'shruti').id, accept: false }, at(4));
    const seat = liveSeats(s, latestRound(s)).find((x) => x.side === 'B' && x.seatRole === 'partner')!;
    expect(seat.status).toBe('open');
    expect(seat.lastPlayerId).toBe('shruti');
    expect(balances(s).shruti).toBe(1000);
    expect(seriesScore(s, seriesId(s))).toEqual({ A: 0, B: 1 });
  });

  it('partner replaced after others confirmed: every acceptance goes stale and must be renewed', () => {
    let s = story(6);
    const r = latestRound(s);
    expect(r.status).toBe('checkin');
    const ananyaSeat = liveSeats(s, r).find((x) => x.playerId === 'ananya')!;
    s = ok(s, 'riya', { type: 'REPLACE_PARTNER', seatId: ananyaSeat.id }, at(6));
    const r2 = latestRound(s);
    expect(r2.status).toBe('filling');
    const stale = liveSeats(s, r2).filter((x) => seatIsStale(s, r2, x)).map((x) => x.playerId);
    expect(stale.sort()).toEqual(['gunjan', 'riya', 'shruti']);
    expect(no(s, 'gunjan', { type: 'READY', roundId: r2.id }, at(6))).toMatch(/Check-in is not open/);
  });

  it('captain cancels before start: no debits, opening result intact, both keep a next action', () => {
    let s = story(5);
    s = ok(s, 'gunjan', { type: 'CANCEL_ROUND', roundId: latestRound(s).id }, at(6));
    expect(latestRound(s).status).toBe('cancelled');
    expect(balances(s)).toEqual({ gunjan: 1100, riya: 900, ananya: 1000, shruti: 1000, dev: 1000 });
    // A fresh challenge is possible again
    expect(ok(s, 'riya', { type: 'SEND_CHALLENGE', format: 'singles', timing: 'now' }, at(7))).toBeTruthy();
  });

  it('insufficient balance at start: blocked, seat named, no partial debits, round stays in check-in', () => {
    let s: State = story(9);
    s = { ...s, wallet: [...s.wallet, { id: 'w-x', playerId: 'shruti', roundId: null, kind: 'refund', amount: -950, balanceAfter: 50, idempotencyKey: 'test-drain', createdAt: at(6) }] };
    s = ok(s, 'shruti', { type: 'READY', roundId: latestRound(s).id }, at(7));
    const r = latestRound(s);
    expect(r.status).toBe('checkin');
    expect(r.blockedStart?.reason).toBe('Shruti needs 100 gold to join');
    expect(r.blockedStart?.playerId).toBe('shruti');
    expect(s.wallet.filter((e) => e.roundId === r.id)).toHaveLength(0);
  });

  it('missed window: ready wait ends at close, round expires, no debit, one rebooking', () => {
    let s = story(7); // two of four ready
    const r = latestRound(s);
    s = reduce(s, { type: 'TICK' }, { at: r.window!.end, actor: null, source: 'product' }).state;
    expect(latestRound(s).status).toBe('expired');
    expect(balances(s)).toEqual({ gunjan: 1100, riya: 900, ananya: 1000, shruti: 1000, dev: 1000 });
    s = ok(s, 'riya', { type: 'REBOOK', roundId: r.id }, r.window!.end + MINUTE);
    const fresh = latestRound(s);
    expect(fresh.id).not.toBe(r.id);
    expect(fresh.rebookedFromId).toBe(r.id);
    // Rebooking once: a second rebook returns the same new round
    const again = reduce(s, { type: 'REBOOK', roundId: r.id }, { at: r.window!.end + 2 * MINUTE, actor: 'gunjan', source: 'product' });
    expect(again.ref).toBe(fresh.id);
    expect(again.state).toBe(s);
  });

  it('switch back to singles at 1-1: both captains agree, entry 200 each, partner seats dissolve with no debit', () => {
    let s = story(19);
    const r = latestRound(s);
    s = ok(s, 'gunjan', { type: 'PROPOSE_SINGLES', roundId: r.id }, at(16));
    expect(no(s, 'gunjan', { type: 'ACCEPT_SINGLES', roundId: r.id }, at(16))).toMatch(/other captain/);
    s = ok(s, 'riya', { type: 'ACCEPT_SINGLES', roundId: r.id }, at(17));
    const r2 = latestRound(s);
    expect(r2.format).toBe('singles');
    expect(r2.entryGold).toBe(200);
    expect(s.seats[r2.seatIds[2]].status).toBe('dissolved');
    expect(liveFixtureForRound(s, r2.id)).toBeNull();
    expect(balances(s).ananya).toBe(1100);
  });

  it('partner drops out after publication: listing withdrawn, told, private rebooking or singles offered', () => {
    let s = story(21);
    const r = latestRound(s);
    const fx = liveFixtureForRound(s, r.id)!;
    s = ok(s, 'shruti', { type: 'LEAVE_SERIES', seriesId: seriesId(s) }, at(25));
    expect(s.fixtures[fx.id].status).toBe('withdrawn');
    const r2 = latestRound(s);
    expect(r2.status).toBe('filling');
    expect(r2.clubVisible).toBe(false);
    expect(s.notifications.some((n) => n.kind === 'fixture_withdrawn')).toBe(true);
    // Gunjan can invite a replacement or switch to singles
    expect(liveSeats(s, r2).some((x) => x.side === 'B' && x.seatRole === 'partner' && x.status === 'open')).toBe(true);
    expect(ok(s, 'gunjan', { type: 'PROPOSE_SINGLES', roundId: r2.id }, at(26))).toBeTruthy();
  });
});

describe('integrity and idempotency', () => {
  it('duplicate invite returns the existing one: no second record, no second notification', () => {
    const s = story(3);
    const before = Object.keys(s.invites).length;
    const notes = s.notifications.length;
    const r = reduce(s, { type: 'INVITE_PARTNER', roundId: latestRound(s).id, toPlayerId: 'ananya' }, { at: at(3), actor: 'riya', source: 'product' });
    expect(r.accepted).toBe(true);
    expect(r.state).toBe(s);
    expect(r.ref).toBe(openInvite(s, 'ananya').id);
    expect(Object.keys(r.state.invites)).toHaveLength(before);
    expect(r.state.notifications).toHaveLength(notes);
  });

  it('double-tap on start: one round, one set of four debits, one match', () => {
    let s = story(10);
    const r = latestRound(s);
    expect(no(s, 'riya', { type: 'START_ROUND', roundId: r.id }, at(8))).toMatch(/Already started/);
    expect(no(s, 'shruti', { type: 'READY', roundId: r.id }, at(8))).toBeTruthy();
    expect(s.wallet.filter((e) => e.roundId === r.id && e.kind === 'entry')).toHaveLength(4);
  });

  it('duplicate finish event and settle twice: one outcome, one payout, one assist', () => {
    const s = story(16);
    const r = latestRound(s);
    expect(no(s, 'ananya', { type: 'MOVE', roundId: r.id }, at(11))).toBeTruthy();
    expect(no(s, 'ananya', { type: 'ROLL', roundId: r.id }, at(11))).toBeTruthy();
    expect(s.wallet.filter((e) => e.roundId === r.id && e.kind === 'payout')).toHaveLength(2);
    expect(Object.values(s.assists).filter((x) => x.roundId === r.id)).toHaveLength(1);
  });

  it('void after start refunds each entry exactly once and preserves the score', () => {
    let s = story(11);
    const r = latestRound(s);
    s = ok(s, 'gunjan', { type: 'VOID_ROUND', roundId: r.id }, at(9));
    expect(latestRound(s).status).toBe('voided');
    expect(balances(s)).toEqual({ gunjan: 1100, riya: 900, ananya: 1000, shruti: 1000, dev: 1000 });
    expect(s.wallet.filter((e) => e.kind === 'refund' && e.roundId === r.id)).toHaveLength(4);
    expect(no(s, 'riya', { type: 'VOID_ROUND', roundId: r.id }, at(10))).toBeTruthy();
    expect(seriesScore(s, seriesId(s))).toEqual({ A: 0, B: 1 });
  });

  it('four-seat no-show: balances unchanged, no payout, no assist, no public result', () => {
    let s = story(21);
    const r = latestRound(s);
    const fx = liveFixtureForRound(s, r.id)!;
    const before = balances(s);
    s = reduce(s, { type: 'TICK' }, { at: DECIDER_SLOT.end, actor: null, source: 'product' }).state;
    expect(latestRound(s).status).toBe('expired');
    expect(balances(s)).toEqual(before);
    expect(s.fixtures[fx.id].status).toBe('voided');
    expect(Object.values(s.assists).filter((x) => x.roundId === r.id)).toHaveLength(0);
  });

  it('terms hash ties acceptance to format, entry, roster version, slot and club visibility', () => {
    const s = story(19);
    const r = latestRound(s);
    const h = termsHash(s, r);
    expect(termsHash(s, { ...r, clubVisible: false })).not.toBe(h);
    expect(termsHash(s, { ...r, rosterVersion: r.rosterVersion + 1 })).not.toBe(h);
    expect(termsHash(s, { ...r, entryGold: 200 })).not.toBe(h);
  });

  it('a cancelled opening challenge leaves the seeded state otherwise untouched', () => {
    let s = ok(createSeedState(), 'riya', { type: 'SEND_CHALLENGE', format: 'doubles', timing: 'now' }, T0);
    s = ok(s, 'gunjan', { type: 'RESPOND_CHALLENGE', inviteId: openInvite(s, 'gunjan').id, accept: false }, at(1));
    expect(latestRound(s).status).toBe('cancelled');
    expect(seriesScore(s, seriesId(s))).toEqual({ A: 0, B: 1 });
  });
});
