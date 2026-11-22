/**
 * The story panel's brain. It reads the live state and says which chapter you
 * are in, whose phone should be in your hand, and what to tap. It never acts
 * for a player: "Next" hands the phone over (account pane), shows a lock
 * screen, moves the story clock, or highlights the button the player taps.
 */
import { formatTime } from '../domain/time';
import type { PlayerId, Route, State } from '../domain/types';
import { smartTimeLabel } from '../smart/smartFixture';
import {
  bookingConfirmedBy,
  currentRound,
  liveFixtureForRound,
  liveSeats,
  predictionOf,
  seatIsStale,
  seriesStatus,
  theSeries,
} from '../state/selectors';
import { activeDays } from '../analytics/events';
import { PLAYER_IDS } from '../state/seed';

export const CHAPTERS = ['The capture', 'Take Badla', 'Book tomorrow', 'The invite', 'Fixture day', 'Bring backup', 'Grudge Night', 'Series end'];

export interface StoryStep {
  chapter: number; // 1..8
  who: PlayerId | null;
  text: string;
  why: string;
  kind: 'act' | 'lock' | 'time' | 'wait' | 'done';
  target?: string;
  route?: Route;
  timeTo?: number;
  timeLabel?: string;
}

const WHY: Record<number, string> = {
  1: 'The trigger is a capture in a public match: one square from home is the moment players remember.',
  2: 'Badla card shown on 65% of eligible results; 22% of cards become an invite.',
  3: 'Scheduled Badlas: 1.22 extra active days per participant per month.',
  4: 'Offline invite pull: 0.50 extra active days in the model. One push, inside the two-a-day cap.',
  5: 'Fixture day counts only if Gunjan would have skipped today (60% of cases). Play now adds session time, not an active day.',
  6: 'Bring backup: each partner who returns adds 0.30 extra active days in the model.',
  7: 'Clubmate picks: 0.23 extra active days for members who come back to see the result.',
  8: 'Lift = participants × extra days ÷ 7.5 days → +10.2% DAU in the base case. A target to test, not a result.',
};

const ORDER: PlayerId[] = ['riya', 'gunjan', 'ananya', 'shruti'];

export function storyStep(s: State, now: number): StoryStep {
  const op = s.opening;
  const pg = s.publicGame;
  const step = (chapter: number, rest: Omit<StoryStep, 'chapter' | 'why'> & { why?: string }): StoryStep => ({ chapter, why: rest.why ?? WHY[chapter], ...rest });

  if (!op.played) {
    if (!pg || pg.phase === 'done') return step(1, { who: 'riya', kind: 'act', text: 'You are Riya, 1,000 gold. Tap Quick to play a public match.', target: 'quick', route: { name: 'home' } });
    if (pg.phase === 'matchmaking') return step(1, { who: 'riya', kind: 'wait', text: 'Finding an opponent…', route: { name: 'public' } });
    if (pg.captured) return step(1, { who: 'riya', kind: 'act', text: 'Gunjan sent you home one square from the finish. Skip to the result.', target: 'public-ff', route: { name: 'public' } });
    if (pg.turn === 'gunjan') return step(1, { who: 'riya', kind: 'wait', text: 'Gunjan is rolling…', route: { name: 'public' } });
    return step(1, { who: 'riya', kind: 'act', text: pg.die === null ? 'Your turn. Roll the die.' : 'Move your highlighted token: one square from your home lane.', target: pg.die === null ? 'public-roll' : 'public-move', route: { name: 'public' } });
  }

  const series = theSeries(s);
  if (!series) {
    const v = s.settings.variant;
    if (v === 'A') return step(2, { who: 'riya', kind: 'done', text: 'Variant A shows today\'s result screen only: no Badla. Switch to C or D below.', route: { name: 'opening' } });
    if (v === 'B') return step(2, { who: 'riya', kind: 'act', text: 'Variant B offers an instant rematch only. Tap Rematch.', target: 'rematch', route: { name: 'opening' } });
    return step(2, { who: 'riya', kind: 'act', text: 'The Badla card turns the capture into a first-to-two series. Take Badla, then book it with Smart Fixture.', target: 'take-badla', route: { name: 'opening' } });
  }

  const st = seriesStatus(s, series.id);
  if (st === 'won') return step(8, { who: series.sides.A, kind: 'done', text: 'Series over. Riya wins 2-1: the rivalry card keeps the record.', route: { name: 'seriesEnd', seriesId: series.id } });
  if (st === 'closed' || st === 'expired') return step(8, { who: series.sides.A, kind: 'done', text: `The series ${st === 'closed' ? 'was left' : 'expired'}. Prior rounds stay settled.`, route: { name: 'seriesEnd', seriesId: series.id } });

  const r = currentRound(s, series);
  if (!r) return step(2, { who: 'riya', kind: 'act', text: 'Take Badla.', target: 'take-badla', route: { name: 'opening' } });
  const grudge = r.clubVisible || r.isDecider;
  const ch = (base: number) => (grudge ? Math.max(base, 6) : base);

  if (r.status === 'proposed') {
    const inv = Object.values(s.invites).find((i) => i.roundId === r.id && i.kind === 'challenge' && i.status === 'open');
    if (inv) {
      const label = r.bookingId ? smartTimeLabel(s.bookings[r.bookingId].proposedSlots[0], now) : 'now';
      return step(r.timing === 'scheduled' ? 4 : 2, {
        who: inv.toPlayerId, kind: 'lock', text: `${s.players[inv.toPlayerId].name} isn't in the app. Her phone gets one push: "Riya wants Badla… ${label}?" Tap it to unlock and answer.`,
        target: 'accept-challenge', route: { name: 'invite', id: inv.id },
      });
    }
  }

  if (r.status === 'filling' || r.status === 'proposed') {
    const seats = liveSeats(s, r);
    const b = r.bookingId ? s.bookings[r.bookingId] : null;
    if (b && b.status === 'offered') {
      const chooser = series.captainIds.find((p) => p !== b.hostId)!;
      return step(ch(6), { who: chooser, kind: 'act', text: `${s.players[b.hostId].name} offered a Grudge Night slot. ${s.players[chooser].name} picks it.`, target: 'choose-slot', route: { name: 'booking', id: b.id } });
    }
    const stale = seats.find((x) => x.playerId && seatIsStale(s, r, x));
    if (stale) return step(ch(3), { who: stale.playerId, kind: 'act', text: 'The terms changed (a new time). Confirm again to keep your seat.', target: 'renew', route: { name: 'round', id: r.id } });
    const open = seats.find((x) => x.seatRole === 'partner' && x.status === 'open');
    if (open) {
      const cap = series.sides[open.side];
      return step(6, { who: cap, kind: 'act', text: `Bring backup: ${s.players[cap].name} invites one friend from the club.`, target: 'invite-partner', route: { name: 'round', id: r.id } });
    }
    const invited = Object.values(s.invites).find((i) => i.roundId === r.id && i.kind === 'partner' && i.status === 'open');
    if (invited) return step(6, { who: invited.toPlayerId, kind: 'act', text: `${s.players[invited.toPlayerId].name} gets her own invitation, with her own entry and net win. Only she can accept it.`, target: 'join-side', route: { name: 'invite', id: invited.id } });
    if (b && b.status === 'chosen') {
      const missing = seats.find((x) => x.playerId && !bookingConfirmedBy(s, b, x.playerId));
      if (missing) return step(ch(6), { who: missing.playerId, kind: 'act', text: 'Confirm the time, entry and club visibility.', target: 'confirm-booking', route: { name: 'booking', id: b.id } });
    }
    return step(ch(3), { who: series.sides.A, kind: 'wait', text: 'Waiting for the roster to complete.', route: { name: 'round', id: r.id } });
  }

  if (r.status === 'confirmed' && r.window) {
    const f = liveFixtureForRound(s, r.id);
    if (f && f.status === 'listed' && !predictionOf(s, f.id, 'dev')) {
      return step(7, { who: 'dev', kind: 'act', text: 'Grudge Night is on the club card. Dev is not playing, but he can pick a side, free.', target: 'pick-side', route: { name: 'fixture', id: f.id } });
    }
    if (grudge) return step(7, { who: null, kind: 'time', text: 'Picks are in. Jump to Grudge Night.', timeTo: r.window.start, timeLabel: `Next day, ${formatTime(r.window.start, 'Asia/Kolkata')}` });
    return step(4, { who: series.sides.A, kind: 'act', text: `Booked. One tap skips to fixture time (${formatTime(r.window.start, 'Asia/Kolkata')}).`, target: 'skip-ahead', route: { name: 'booked', roundId: r.id } });
  }

  if (r.status === 'checkin') {
    const seats = liveSeats(s, r);
    const next = ORDER.map((p) => seats.find((x) => x.playerId === p)).find((x) => x && x.status !== 'ready');
    if (next) return step(grudge ? 7 : 5, { who: next.playerId, kind: 'act', text: `Your table is ready. ${s.players[next.playerId!].name} checks in: gold moves only when every seat is ready.`, target: 'ready', route: { name: 'round', id: r.id } });
  }

  if (r.status === 'active' && r.game) {
    const g = r.game;
    const seat = g.seats[g.turn];
    return step(grudge ? 7 : 5, { who: seat.playerId as PlayerId, kind: 'act', text: `${s.players[seat.playerId as PlayerId].name}'s turn: ${g.die === null ? 'roll' : 'move the highlighted token'}.`, target: g.die === null ? 'roll' : 'move', route: { name: 'round', id: r.id } });
  }

  if (r.status === 'settled' && st === 'tied') {
    return step(5, { who: series.sides.A, kind: 'act', text: 'One each. Three options: private decider now, book it, or make it a Grudge Night the club can follow.', target: 'grudge-night', route: { name: 'receipt', roundId: r.id } });
  }

  return step(ch(5), { who: series.sides.A, kind: 'act', text: 'This round ended without a result. Rebook it or start a new challenge.', target: 'rebook', route: { name: 'round', id: r.id } });
}

/** Free-mode checklist: which flows the reviewer has seen. */
export function flowsSeen(s: State): boolean[] {
  const has = (n: string) => s.analytics.some((e) => e.name === n);
  return [
    s.opening.played,
    has('challenge_sent'),
    Object.values(s.rounds).some((r) => r.timing === 'scheduled' && ['confirmed', 'checkin', 'active', 'settled'].includes(r.status)),
    has('challenge_response'),
    has('round_started'),
    has('partner_accepted'),
    has('fixture_published'),
    has('series_closed'),
  ];
}

export function storyMetrics(s: State) {
  const ev = s.analytics.filter((e) => e.source === 'product');
  const count = (n: string) => ev.filter((e) => e.name === n).length;
  const extra = PLAYER_IDS.reduce((t, p) => t + Math.max(0, activeDays(s, p).length - 1), 0);
  return [
    { label: 'Cards shown', value: count('badla_card_shown') },
    { label: 'Challenges', value: count('challenge_sent') },
    { label: 'Booked', value: count('round_confirmed') },
    { label: 'Seats ready', value: count('ready') },
    { label: 'Extra active days', value: extra },
  ];
}
