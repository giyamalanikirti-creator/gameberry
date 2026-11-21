import { lastActiveToken } from '../board/engine';
import { LAST_TRACK_INDEX } from '../board/geometry';
import type { ReplayEvent } from '../board/replay';
import { PLAYERS } from '../domain/players';
import type { Challenge, PlayerId } from '../domain/types';

export interface EventCopy {
  headline: string;
  intro: string;
  step: (n: number, total: number) => string;
  impact: string;
  outro: string;
  staticBefore: string;
  staticAfter: string;
}

/** Perspective-aware copy for a replayed moment. Derived from the event data, never invented. */
export function eventCopy(e: ReplayEvent, viewer: PlayerId): EventCopy {
  const actor = PLAYERS[e.actor];
  const you = e.actor === viewer;
  const who = you ? 'You' : actor.name;

  if (e.kind === 'capture' && e.capture) {
    const victim = PLAYERS[e.capture.player];
    const victimIsYou = victim.id === viewer;
    const isLast = lastActiveToken(e.before, e.capture.color) === e.capture.tokenIndex;
    const nearSafety = e.capture.from === LAST_TRACK_INDEX;
    const tokenWord = isLast ? 'last token' : 'token';
    const theirToken = victimIsYou ? `your ${tokenWord}` : `${victim.name}'s ${tokenWord}`;
    const where = nearSafety ? ' just before safety' : '';
    const headline = `${who} caught ${theirToken}${where}.`;
    const lane = victimIsYou ? 'your home lane' : `${victim.possessive} home lane`;
    const intro = `${victimIsYou ? 'Your' : `${victim.name}'s`} ${tokenWord}${nearSafety ? `, one square from ${lane}` : ''}.`;
    return {
      headline,
      intro,
      step: (n, total) => `${who} ${you ? 'roll' : 'rolls'} ${e.roll} · step ${n} of ${total}`,
      impact: 'Caught!',
      outro: `${headline} Back to the yard.`,
      staticBefore: `Before: ${intro} ${actor.name} is ${e.roll} squares behind.`,
      staticAfter: `After: ${actor.name} rolled ${e.roll} and landed on it. ${victimIsYou ? 'Your' : `${victim.name}'s`} token went back to the yard.`,
    };
  }

  const isLast = lastActiveToken(e.before, e.color) === e.tokenIndex;
  const possessive = you ? 'your' : actor.possessive;
  const headline = `${who} brought ${possessive} ${isLast ? 'last ' : ''}token home first.`;
  return {
    headline,
    intro: `${you ? 'Your' : `${actor.name}'s`} token needs exactly ${e.path.length}.`,
    step: (n, total) => `${who} ${you ? 'roll' : 'rolls'} ${e.roll} · step ${n} of ${total}`,
    impact: 'Home!',
    outro: headline,
    staticBefore: `Before: ${you ? 'your' : `${actor.name}'s`} token is ${e.path.length} steps from home.`,
    staticAfter: `After: ${actor.name} rolled ${e.roll} and finished.`,
  };
}

export function inviteTitle(c: Challenge, viewer: PlayerId): string {
  const challenger = PLAYERS[c.challenger].name;
  const you = c.challenger === viewer;
  const invitee = PLAYERS[c.invitee].name;
  switch (c.kind) {
    case 'badla':
      return you ? `You challenged ${invitee}.` : `${challenger} wants a rematch`;
    case 'decider':
      return you ? `You asked ${invitee} for the decider.` : `${challenger} wants the decider`;
    case 'another':
      return you ? `You asked ${invitee} for another match.` : `${challenger} wants another match`;
  }
}

export function kindLabel(c: Challenge): string {
  return c.kind === 'badla' ? 'Badla' : c.kind === 'decider' ? 'Decider' : 'Return match';
}
