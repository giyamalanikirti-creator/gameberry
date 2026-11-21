import { describe, expect, it } from 'vitest';
import { activePlayerDays } from './analytics';
import { createInitialState, ORIGINAL_MATCH_ID } from './initialState';
import { PLAYERS } from './players';
import { Action, reduce } from './reducer';
import { latestChallenge, pairRecord, scoreLine } from './selectors';
import { DAY, DEMO_START, HOUR, MINUTE, defaultEveningWindow, formatWindow } from './time';
import type { DomainState, PlayerId } from './types';

type A = Action;

/** Apply an action and assert it was accepted. */
function ok(s: DomainState, a: A): DomainState {
  const r = reduce(s, a);
  if (!r.accepted) throw new Error(`rejected ${a.type}: ${r.reason}`);
  return r.state;
}

function rejected(s: DomainState, a: A): string {
  const r = reduce(s, a);
  expect(r.accepted).toBe(false);
  return r.reason ?? '';
}

const T0 = DEMO_START;
const WINDOW = defaultEveningWindow(T0, PLAYERS.ahmed.timeZone);

function challenged(at = T0 + MINUTE): DomainState {
  return ok(createInitialState(), { type: 'sendChallenge', actor: 'kirti', matchId: ORIGINAL_MATCH_ID, at });
}
const cid = (s: DomainState) => latestChallenge(s)!.id;

function scheduled(): DomainState {
  let s = challenged();
  s = ok(s, { type: 'proposeTime', actor: 'ahmed', challengeId: cid(s), window: WINDOW, at: T0 + 2 * MINUTE });
  s = ok(s, { type: 'confirmTime', actor: 'kirti', challengeId: cid(s), at: T0 + 3 * MINUTE });
  return s;
}

/** Play the live match to the end with the demo opponent's moves going through the same reducer. */
function playMatch(s: DomainState, at: number): DomainState {
  const matchId = latestChallenge(s)!.matchId!;
  for (let i = 0; i < 60; i++) {
    const m = s.matches[matchId];
    if (m.status !== 'playing') break;
    const g = m.game!;
    const actor: PlayerId = m.seats[g.turn];
    const source = actor === 'ahmed' ? 'demo-opponent' : 'player';
    s = ok(s, { type: 'roll', actor, matchId, expectRollCount: g.rollCount, source, at });
    const g2 = s.matches[matchId].game!;
    if (g2.die !== null) {
      const token = g2.tokens[g2.turn].findIndex((p) => p !== 56);
      s = ok(s, { type: 'move', actor, matchId, tokenIndex: token, expectRollCount: g2.rollCount, source, at });
    }
  }
  return s;
}

describe('clean start', () => {
  it('records only the original win', () => {
    const s = createInitialState();
    expect(s.results).toEqual([expect.objectContaining({ matchId: ORIGINAL_MATCH_ID, winner: 'ahmed' })]);
    expect(scoreLine(s)).toBe('Ahmed 1 · Kirti 0');
    expect(s.challengeOrder).toEqual([]);
  });

  it('only the caught player can ask for Badla, once per match', () => {
    const s0 = createInitialState();
    rejected(s0, { type: 'sendChallenge', actor: 'ahmed', matchId: ORIGINAL_MATCH_ID, at: T0 });
    const s1 = challenged();
    expect(latestChallenge(s1)).toMatchObject({ status: 'pending', challenger: 'kirti', invitee: 'ahmed', kind: 'badla' });
    // Double tap on Ask for Badla
    rejected(s1, { type: 'sendChallenge', actor: 'kirti', matchId: ORIGINAL_MATCH_ID, at: T0 + 2 * MINUTE });
    // Even after withdrawing, no second invitation for the same match
    const s2 = ok(s1, { type: 'withdraw', actor: 'kirti', challengeId: cid(s1), at: T0 + 3 * MINUTE });
    rejected(s2, { type: 'sendChallenge', actor: 'kirti', matchId: ORIGINAL_MATCH_ID, at: T0 + 4 * MINUTE });
  });
});

describe('time zones', () => {
  it('tomorrow evening is 19:00–19:30 in Pakistan and 19:30–20:00 in India', () => {
    expect(WINDOW.start).toBe(Date.UTC(2026, 10, 23, 14, 0));
    expect(WINDOW.end - WINDOW.start).toBe(30 * MINUTE);
    expect(formatWindow(WINDOW, PLAYERS.ahmed.timeZone)).toBe('Mon 23 Nov, 19:00–19:30');
    expect(formatWindow(WINDOW, PLAYERS.kirti.timeZone)).toBe('Mon 23 Nov, 19:30–20:00');
  });

  it('both perspectives read the same stored instants', () => {
    const s = scheduled();
    const c = latestChallenge(s)!;
    expect(c.status).toBe('scheduled');
    expect(c.window).toEqual(WINDOW);
  });
});

describe('permissions and terminal actions', () => {
  it('only the invitee can respond; only the challenger can confirm', () => {
    const s = challenged();
    rejected(s, { type: 'playNow', actor: 'kirti', challengeId: cid(s), at: T0 + 2 * MINUTE });
    rejected(s, { type: 'proposeTime', actor: 'kirti', challengeId: cid(s), window: WINDOW, at: T0 + 2 * MINUTE });
    rejected(s, { type: 'withdraw', actor: 'ahmed', challengeId: cid(s), at: T0 + 2 * MINUTE });
    const p = ok(s, { type: 'proposeTime', actor: 'ahmed', challengeId: cid(s), window: WINDOW, at: T0 + 2 * MINUTE });
    rejected(p, { type: 'confirmTime', actor: 'ahmed', challengeId: cid(p), at: T0 + 3 * MINUTE });
  });

  it('pass closes quietly and sends nothing', () => {
    const s = challenged();
    const after = ok(s, { type: 'pass', actor: 'ahmed', challengeId: cid(s), at: T0 + 2 * MINUTE });
    expect(latestChallenge(after)!.status).toBe('declined');
    expect(after.notifications).toEqual([]);
    rejected(after, { type: 'playNow', actor: 'ahmed', challengeId: cid(s), at: T0 + 3 * MINUTE });
  });

  it('declining a proposal is terminal', () => {
    let s = challenged();
    s = ok(s, { type: 'proposeTime', actor: 'ahmed', challengeId: cid(s), window: WINDOW, at: T0 + 2 * MINUTE });
    s = ok(s, { type: 'declineTime', actor: 'kirti', challengeId: cid(s), at: T0 + 3 * MINUTE });
    expect(latestChallenge(s)!.status).toBe('declined');
  });

  it('either player can cancel a scheduled match before it starts', () => {
    for (const actor of ['kirti', 'ahmed'] as const) {
      const s = ok(scheduled(), { type: 'cancel', actor, challengeId: cid(scheduled()), at: T0 + HOUR });
      expect(latestChallenge(s)!.status).toBe('cancelled');
    }
  });

  it('rejected actions leave state untouched', () => {
    const s = challenged();
    const r = reduce(s, { type: 'confirmTime', actor: 'kirti', challengeId: cid(s), at: T0 + 2 * MINUTE });
    expect(r.accepted).toBe(false);
    expect(r.state).toBe(s);
  });
});

describe('expiry', () => {
  it('an unanswered invitation expires after 24 hours', () => {
    const s = challenged(T0);
    const before = reduce(s, { type: 'tick', at: T0 + DAY - 1 }).state;
    expect(latestChallenge(before)!.status).toBe('pending');
    const after = reduce(s, { type: 'tick', at: T0 + DAY }).state;
    expect(latestChallenge(after)!.status).toBe('expired');
    rejected(after, { type: 'playNow', actor: 'ahmed', challengeId: cid(s), at: T0 + DAY + 1 });
  });

  it('an unconfirmed proposal expires (no later than the window start)', () => {
    let s = challenged();
    s = ok(s, { type: 'proposeTime', actor: 'ahmed', challengeId: cid(s), window: WINDOW, at: T0 + 2 * MINUTE });
    s = reduce(s, { type: 'tick', at: WINDOW.start }).state;
    expect(latestChallenge(s)!.status).toBe('expired');
  });
});

describe('window boundaries (start-inclusive, end-exclusive)', () => {
  it('just before, exactly at and after the window', () => {
    const s = scheduled();
    const c = cid(s);
    rejected(s, { type: 'ready', actor: 'ahmed', challengeId: c, at: WINDOW.start - 1 });
    const atStart = ok(s, { type: 'ready', actor: 'ahmed', challengeId: c, at: WINDOW.start });
    expect(latestChallenge(atStart)!.status).toBe('waiting');
    const lastMs = ok(s, { type: 'ready', actor: 'ahmed', challengeId: c, at: WINDOW.end - 1 });
    expect(latestChallenge(lastMs)!.readiness.ahmed!.until).toBe(WINDOW.end);
    const r = reduce(s, { type: 'ready', actor: 'ahmed', challengeId: c, at: WINDOW.end });
    expect(r.accepted).toBe(false);
    expect(latestChallenge(r.state)!.status).toBe('expired'); // nobody showed up
  });
});

describe('readiness and reminders', () => {
  it('Ahmed ready → exactly one reminder for Kirti → she joins → exactly one match', () => {
    let s = scheduled();
    const c = cid(s);
    s = ok(s, { type: 'ready', actor: 'ahmed', challengeId: c, at: WINDOW.start + MINUTE });
    expect(s.notifications).toHaveLength(1);
    expect(s.notifications[0]).toMatchObject({ to: 'kirti', title: 'Ahmed is ready for your Badla match.', challengeId: c });
    // Repeated readiness: rejected while active, no duplicate reminder.
    rejected(s, { type: 'ready', actor: 'ahmed', challengeId: c, at: WINDOW.start + 2 * MINUTE });
    s = ok(s, { type: 'openNotification', actor: 'kirti', notificationId: s.notifications[0].id, at: WINDOW.start + 2 * MINUTE });
    s = ok(s, { type: 'ready', actor: 'kirti', challengeId: c, at: WINDOW.start + 3 * MINUTE });
    const ch = latestChallenge(s)!;
    expect(ch.status).toBe('playing');
    expect(Object.values(s.matches).filter((m) => m.challengeId === c)).toHaveLength(1);
    // Double tap on Join match creates nothing extra
    rejected(s, { type: 'ready', actor: 'kirti', challengeId: c, at: WINDOW.start + 3 * MINUTE + 10 });
    expect(Object.keys(s.matches)).toHaveLength(2);
  });

  it('readiness lapses after five minutes; re-marking sends no second reminder to the same person', () => {
    let s = scheduled();
    const c = cid(s);
    const t = WINDOW.start + MINUTE;
    s = ok(s, { type: 'ready', actor: 'ahmed', challengeId: c, at: t });
    s = reduce(s, { type: 'tick', at: t + 5 * MINUTE - 1 }).state;
    expect(latestChallenge(s)!.status).toBe('waiting');
    s = reduce(s, { type: 'tick', at: t + 5 * MINUTE }).state;
    expect(latestChallenge(s)!.status).toBe('scheduled');
    expect(latestChallenge(s)!.readiness).toEqual({});
    s = ok(s, { type: 'ready', actor: 'ahmed', challengeId: c, at: t + 6 * MINUTE });
    expect(s.notifications.filter((n) => n.to === 'kirti')).toHaveLength(1);
  });

  it('when readiness has lapsed, a late join waits and reminds the other player once', () => {
    let s = scheduled();
    const c = cid(s);
    s = ok(s, { type: 'ready', actor: 'ahmed', challengeId: c, at: WINDOW.start });
    s = ok(s, { type: 'ready', actor: 'kirti', challengeId: c, at: WINDOW.start + 6 * MINUTE });
    expect(latestChallenge(s)!.status).toBe('waiting');
    expect(s.notifications.map((n) => n.to)).toEqual(['kirti', 'ahmed']);
  });

  it('only one player shows up: "missed each other", no score change, re-invite needs both again', () => {
    let s = scheduled();
    const c = cid(s);
    s = ok(s, { type: 'ready', actor: 'ahmed', challengeId: c, at: WINDOW.start });
    s = reduce(s, { type: 'tick', at: WINDOW.end }).state;
    expect(latestChallenge(s)!.status).toBe('missed');
    expect(pairRecord(s)).toEqual({ ahmed: 1, kirti: 0 });
    expect(Object.keys(s.matches)).toHaveLength(1);
    // Stale reminder cannot revive the table
    rejected(s, { type: 'ready', actor: 'kirti', challengeId: c, at: WINDOW.end + 1 });
    s = ok(s, { type: 'sendChallenge', actor: 'ahmed', matchId: ORIGINAL_MATCH_ID, at: WINDOW.end + MINUTE });
    expect(latestChallenge(s)).toMatchObject({ status: 'pending', challenger: 'ahmed', invitee: 'kirti', previousChallengeId: c });
  });

  it('opening the app never notifies the opponent', () => {
    let s = scheduled();
    s = ok(s, { type: 'appOpened', actor: 'ahmed', at: WINDOW.start + MINUTE });
    s = ok(s, { type: 'appOpened', actor: 'kirti', at: WINDOW.start + MINUTE });
    expect(s.notifications).toEqual([]);
    expect(latestChallenge(s)!.status).toBe('scheduled');
  });

  it('muting suppresses the reminder but keeps the lobby card and joining', () => {
    let s = scheduled();
    const c = cid(s);
    s = ok(s, { type: 'setMute', actor: 'kirti', muted: true, at: T0 + HOUR });
    s = ok(s, { type: 'ready', actor: 'ahmed', challengeId: c, at: WINDOW.start });
    expect(s.notifications).toEqual([]);
    expect(s.analytics.some((e) => e.name === 'reminder_suppressed' && e.detail?.reason === 'muted')).toBe(true);
    s = ok(s, { type: 'ready', actor: 'kirti', challengeId: c, at: WINDOW.start + MINUTE });
    expect(latestChallenge(s)!.status).toBe('playing');
  });

  it('blocking ends pending invitations, invalidates readiness and suppresses future ones', () => {
    let s = scheduled();
    const c = cid(s);
    s = ok(s, { type: 'ready', actor: 'ahmed', challengeId: c, at: WINDOW.start });
    s = ok(s, { type: 'setBlock', actor: 'kirti', blocked: true, at: WINDOW.start + MINUTE });
    expect(latestChallenge(s)).toMatchObject({ status: 'blocked', readiness: {} });
    rejected(s, { type: 'ready', actor: 'kirti', challengeId: c, at: WINDOW.start + 2 * MINUTE });
    const s2 = ok(createInitialState(), { type: 'setBlock', actor: 'ahmed', blocked: true, at: T0 });
    rejected(s2, { type: 'sendChallenge', actor: 'kirti', matchId: ORIGINAL_MATCH_ID, at: T0 + MINUTE });
  });
});

describe('play now', () => {
  it('marks Ahmed ready, opens a five-minute table, never asks for a time', () => {
    let s = challenged();
    const c = cid(s);
    const t = T0 + 2 * MINUTE;
    s = ok(s, { type: 'playNow', actor: 'ahmed', challengeId: c, at: t });
    const ch = latestChallenge(s)!;
    expect(ch).toMatchObject({ status: 'waiting', mode: 'now', window: { start: t, end: t + 5 * MINUTE } });
    expect(ch.proposedAt).toBeNull();
    expect(s.notifications).toHaveLength(1);
    s = ok(s, { type: 'ready', actor: 'kirti', challengeId: c, at: t + MINUTE });
    expect(latestChallenge(s)!.status).toBe('playing');
  });

  it('Kirti can dismiss; the table can expire cleanly', () => {
    let s = challenged();
    const c = cid(s);
    s = ok(s, { type: 'playNow', actor: 'ahmed', challengeId: c, at: T0 + 2 * MINUTE });
    const dismissed = ok(s, { type: 'dismissJoin', actor: 'kirti', challengeId: c, at: T0 + 3 * MINUTE });
    expect(latestChallenge(dismissed)!.status).toBe('declined');
    const expired = reduce(s, { type: 'tick', at: T0 + 7 * MINUTE }).state;
    expect(latestChallenge(expired)!.status).toBe('missed');
    rejected(expired, { type: 'ready', actor: 'kirti', challengeId: c, at: T0 + 7 * MINUTE });
  });
});

describe('the full guided journey', () => {
  it('Badla tomorrow → Kirti wins → 1–1 → decider accepted → third match', () => {
    let s = scheduled();
    const c = cid(s);
    s = ok(s, { type: 'ready', actor: 'ahmed', challengeId: c, at: WINDOW.start });
    s = ok(s, { type: 'ready', actor: 'kirti', challengeId: c, at: WINDOW.start + MINUTE });
    const rematchId = latestChallenge(s)!.matchId!;
    s = playMatch(s, WINDOW.start + 2 * MINUTE);
    const m = s.matches[rematchId];
    expect(m.winner).toBe('kirti');
    expect(m.keyEvent).toMatchObject({ kind: 'finish', actor: 'kirti', capture: null });
    expect(pairRecord(s)).toEqual({ ahmed: 1, kirti: 1 });
    expect(scoreLine(s)).toBe('Ahmed 1 · Kirti 1');
    expect(latestChallenge(s)!.status).toBe('completed');

    // The demo opponent's rolls went through the engine.
    expect(s.analytics.filter((e) => e.source === 'demo-opponent').map((e) => e.name)).toEqual(['match_roll', 'match_move']);

    // A repeated completion (replayed final move) cannot award another win.
    const g = s.matches[rematchId].game!;
    rejected(s, { type: 'move', actor: 'kirti', matchId: rematchId, tokenIndex: 3, expectRollCount: g.rollCount, at: WINDOW.start + 3 * MINUTE });
    expect(s.results.filter((r) => r.matchId === rematchId)).toHaveLength(1);

    // Decider
    s = ok(s, { type: 'sendChallenge', actor: 'kirti', matchId: rematchId, at: WINDOW.start + 4 * MINUTE });
    const decider = latestChallenge(s)!;
    expect(decider.kind).toBe('decider');
    s = ok(s, { type: 'playNow', actor: 'ahmed', challengeId: decider.id, at: WINDOW.start + 5 * MINUTE });
    s = ok(s, { type: 'ready', actor: 'kirti', challengeId: decider.id, at: WINDOW.start + 6 * MINUTE });
    const third = s.matches[latestChallenge(s)!.matchId!];
    expect(third.number).toBe(3);
    expect(third.status).toBe('playing');
    expect(s.analytics.some((e) => e.name === 'decider_accepted')).toBe(true);
  });

  it('original and return match fall on different analytics dates', () => {
    let s = scheduled();
    const c = cid(s);
    s = ok(s, { type: 'ready', actor: 'ahmed', challengeId: c, at: WINDOW.start });
    s = ok(s, { type: 'ready', actor: 'kirti', challengeId: c, at: WINDOW.start + MINUTE });
    s = playMatch(s, WINDOW.start + 2 * MINUTE);
    const days = activePlayerDays(s.analytics);
    expect(days).toEqual(['ahmed|2026-11-22', 'ahmed|2026-11-23', 'kirti|2026-11-22', 'kirti|2026-11-23']);
  });

  it('abandoning a match awards nothing', () => {
    let s = scheduled();
    const c = cid(s);
    s = ok(s, { type: 'ready', actor: 'ahmed', challengeId: c, at: WINDOW.start });
    s = ok(s, { type: 'ready', actor: 'kirti', challengeId: c, at: WINDOW.start + MINUTE });
    const id = latestChallenge(s)!.matchId!;
    s = ok(s, { type: 'leaveMatch', actor: 'kirti', matchId: id, at: WINDOW.start + 2 * MINUTE });
    expect(pairRecord(s)).toEqual({ ahmed: 1, kirti: 0 });
    rejected(s, { type: 'roll', actor: 'kirti', matchId: id, expectRollCount: 0, at: WINDOW.start + 3 * MINUTE });
  });

  it('stale double-tapped rolls are rejected', () => {
    let s = scheduled();
    const c = cid(s);
    s = ok(s, { type: 'ready', actor: 'ahmed', challengeId: c, at: WINDOW.start });
    s = ok(s, { type: 'ready', actor: 'kirti', challengeId: c, at: WINDOW.start + MINUTE });
    const id = latestChallenge(s)!.matchId!;
    s = ok(s, { type: 'roll', actor: 'kirti', matchId: id, expectRollCount: 0, at: WINDOW.start + 2 * MINUTE });
    rejected(s, { type: 'roll', actor: 'kirti', matchId: id, expectRollCount: 0, at: WINDOW.start + 2 * MINUTE });
    rejected(s, { type: 'roll', actor: 'ahmed', matchId: id, expectRollCount: 1, at: WINDOW.start + 2 * MINUTE });
  });
});

describe('analytics', () => {
  it('logs one player event per committed player action', () => {
    let s = challenged();
    const before = s.analytics.length;
    s = ok(s, { type: 'proposeTime', actor: 'ahmed', challengeId: cid(s), window: WINDOW, at: T0 + 2 * MINUTE });
    const added = s.analytics.slice(before);
    expect(added.filter((e) => e.source === 'player')).toHaveLength(1);
  });

  it('counts a reminder, acceptance and match on one date as one active day', () => {
    let s = challenged(T0);
    s = ok(s, { type: 'playNow', actor: 'ahmed', challengeId: cid(s), at: T0 + MINUTE });
    s = ok(s, { type: 'ready', actor: 'kirti', challengeId: cid(s), at: T0 + 2 * MINUTE });
    expect(activePlayerDays(s.analytics)).toEqual(['ahmed|2026-11-22', 'kirti|2026-11-22']);
  });

  it('demo and replay events are distinguishable from player actions', () => {
    let s = createInitialState();
    s = ok(s, { type: 'replayViewed', actor: 'kirti', matchId: ORIGINAL_MATCH_ID, mode: 'animated', at: T0 });
    s = ok(s, { type: 'demoNote', name: 'demo_clock_advanced', at: T0 });
    expect(s.analytics.slice(-2).map((e) => e.source)).toEqual(['replay', 'demo']);
    expect(activePlayerDays(s.analytics)).toEqual([]);
  });

  it('logs an invitation offer once per player per match', () => {
    let s = createInitialState();
    s = ok(s, { type: 'offerShown', actor: 'kirti', matchId: ORIGINAL_MATCH_ID, offer: 'badla', at: T0 });
    rejected(s, { type: 'offerShown', actor: 'kirti', matchId: ORIGINAL_MATCH_ID, offer: 'badla', at: T0 + 1 });
  });
});

describe('replay never mutates live state', () => {
  it('viewing the replay changes neither the record nor any match', () => {
    const s0 = createInitialState();
    const s1 = ok(s0, { type: 'replayViewed', actor: 'ahmed', matchId: ORIGINAL_MATCH_ID, mode: 'static', at: T0 });
    expect(s1.results).toEqual(s0.results);
    expect(s1.matches).toEqual(s0.matches);
  });
});
