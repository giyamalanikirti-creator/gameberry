import { ORIGINAL_CAPTURE } from '../board/replay';
import { PLAYERS } from './players';
import { DEMO_START, MINUTE, analyticsDate } from './time';
import type { DomainState } from './types';

export const ORIGINAL_MATCH_ID = 'm-original';
export const ORIGINAL_COMPLETED_AT = DEMO_START - 2 * MINUTE;

/** Clean start: the end of a close 1v1. Ahmed's win is recorded exactly once. */
export function createInitialState(): DomainState {
  return {
    schema: 'badla-domain',
    version: 1,
    players: structuredClone(PLAYERS),
    settings: {
      kirti: { mutedReminders: false, blockedOpponent: false },
      ahmed: { mutedReminders: false, blockedOpponent: false },
    },
    matches: {
      [ORIGINAL_MATCH_ID]: {
        id: ORIGINAL_MATCH_ID,
        kind: 'original',
        number: 1,
        challengeId: null,
        seats: { blue: 'kirti', red: 'ahmed' },
        status: 'completed',
        createdAt: ORIGINAL_COMPLETED_AT - 9 * MINUTE,
        completedAt: ORIGINAL_COMPLETED_AT,
        winner: 'ahmed',
        game: null,
        keyEvent: structuredClone(ORIGINAL_CAPTURE),
      },
    },
    results: [{ matchId: ORIGINAL_MATCH_ID, winner: 'ahmed', completedAt: ORIGINAL_COMPLETED_AT }],
    challenges: {},
    challengeOrder: [],
    notifications: [],
    analytics: [
      {
        id: 'ev-0',
        name: 'match_completed',
        at: ORIGINAL_COMPLETED_AT,
        date: analyticsDate(ORIGINAL_COMPLETED_AT),
        actor: 'system',
        source: 'system',
        pairId: 'pair:ahmed+kirti',
        matchId: ORIGINAL_MATCH_ID,
        detail: { winner: 'ahmed', mode: '1v1' },
      },
    ],
    offers: [],
    nextDice: { mode: 'guided', seed: 1 },
    seq: 0,
  };
}
