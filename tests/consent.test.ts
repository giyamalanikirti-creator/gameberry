import { describe, expect, it } from 'vitest';
import { reduce } from '../src/state/reducer';
import { pendingActions } from '../src/state/selectors';
import { MINUTE } from '../src/domain/time';
import { latestRound, no, ok, openInvite, story, T0 } from './helpers';

const at = (n: number) => T0 + n * MINUTE;

describe('identity and consent', () => {
  it('accepting an invite in the wrong session is rejected with the recipient named', () => {
    const s = story(3);
    const inv = openInvite(s, 'ananya');
    expect(no(s, 'riya', { type: 'RESPOND_PARTNER', inviteId: inv.id, accept: true }, at(4))).toBe('This invitation is for Ananya');
    expect(no(s, 'shruti', { type: 'RESPOND_PARTNER', inviteId: inv.id, accept: true }, at(4))).toBe('This invitation is for Ananya');
    expect(no(s, 'riya', { type: 'RESPOND_CHALLENGE', inviteId: inv.id, accept: true }, at(4))).toBeTruthy();
  });

  it('readying another seat is impossible: the action takes the player from the session', () => {
    const s = story(7);
    // The READY action has no player field at all; whoever is signed in readies their own seat.
    const r = latestRound(s);
    const after = ok(s, 'gunjan', { type: 'READY', roundId: r.id }, at(6));
    const ready = Object.values(after.seats).filter((x) => x.roundId === r.id && x.status === 'ready').map((x) => x.playerId);
    expect(ready.sort()).toEqual(['gunjan', 'riya']);
    expect(no(s, 'dev', { type: 'READY', roundId: r.id }, at(6))).toMatch(/no seat/);
    expect(no(s, null, { type: 'READY', roundId: r.id }, at(6))).toBe('Sign in first');
  });

  it('navigation and opening notifications never change consent state', () => {
    const s = story(3);
    const n = s.notifications.find((x) => x.to === 'ananya')!;
    const after = ok(s, 'ananya', { type: 'READ_NOTIFICATION', id: n.id }, at(4));
    expect(after.seats).toEqual(s.seats);
    expect(after.invites).toEqual(s.invites);
    const viewed = ok(after, 'ananya', { type: 'LOG', name: 'partner_invite_view' }, at(4));
    expect(viewed.seats).toEqual(s.seats);
  });

  it('a participant cannot predict', () => {
    const s = story(21);
    const fx = Object.keys(s.fixtures)[0];
    for (const p of ['gunjan', 'riya', 'ananya', 'shruti'] as const) {
      expect(no(s, p, { type: 'PREDICT', fixtureId: fx, side: 'A' }, at(20))).toBe("You're playing this one");
    }
  });

  it('a partner cannot challenge, host or invite; a club-only account cannot take a seat', () => {
    const s = story(16);
    expect(no(s, 'ananya', { type: 'SEND_CHALLENGE', format: 'singles', timing: 'now' }, at(12))).toMatch(/captains/);
    expect(no(s, 'shruti', { type: 'HOST_GRUDGE_NIGHT', seriesId: Object.keys(s.series)[0], slots: [] }, at(12))).toMatch(/captain/);
    const t = story(2);
    expect(no(t, 'gunjan', { type: 'INVITE_PARTNER', roundId: latestRound(t).id, toPlayerId: 'dev' }, at(3))).toMatch(/can't take a seat/);
    expect(no(t, 'ananya', { type: 'INVITE_PARTNER', roundId: latestRound(t).id, toPlayerId: 'shruti' }, at(3))).toMatch(/captain/);
  });

  it('demo actions are refused from product sessions', () => {
    const r = reduce(story(0), { type: 'DEMO_AUTO_CONFIRM' }, { at: T0, actor: 'riya', source: 'product' });
    expect(r.accepted).toBe(false);
  });

  it('pending badges are computed from open items addressed to each player', () => {
    expect(pendingActions(story(1), 'gunjan', at(2)).map((x) => x.kind)).toEqual(['invite']);
    expect(pendingActions(story(3), 'ananya', at(3)).map((x) => x.kind)).toEqual(['invite']);
    expect(pendingActions(story(6), 'shruti', at(6)).map((x) => x.kind)).toEqual(['ready']);
    expect(pendingActions(story(16), 'ananya', at(11)).map((x) => x.kind)).toEqual(['receipt']);
    expect(pendingActions(story(21), 'dev', at(17)).map((x) => x.kind)).toEqual(['fixture']);
    expect(pendingActions(story(22), 'dev', at(19))).toEqual([]);
  });

  it('auto-confirm writes source "demo" and stays out of product analytics', () => {
    let s = story(19);
    s = reduce(s, { type: 'DEMO_AUTO_CONFIRM' }, { at: at(16), actor: null, source: 'demo' }).state;
    expect(Object.keys(s.fixtures)).toHaveLength(1);
    const b = s.bookings[latestRound(s).bookingId!];
    expect(b.confirmations.filter((c) => c.source === 'demo').map((c) => c.playerId).sort()).toEqual(['ananya', 'shruti']);
    expect(s.analytics.filter((e) => e.source === 'demo').length).toBeGreaterThan(0);
    expect(s.analytics.filter((e) => e.source === 'product' && e.name === 'booking_confirmed')).toHaveLength(0);
  });

});
