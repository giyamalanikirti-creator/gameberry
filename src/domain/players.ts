import type { Player, PlayerId } from './types';

export const PLAYERS: Record<PlayerId, Player> = {
  kirti: {
    id: 'kirti',
    name: 'Kirti',
    color: 'blue',
    shape: 'circle',
    initial: 'K',
    possessive: 'her',
    timeZone: 'Asia/Kolkata',
    timeZoneLabel: 'India time',
  },
  ahmed: {
    id: 'ahmed',
    name: 'Ahmed',
    color: 'red',
    shape: 'diamond',
    initial: 'A',
    possessive: 'his',
    timeZone: 'Asia/Karachi',
    timeZoneLabel: 'Pakistan time',
  },
};

/** Fixed name order for every score line, in every perspective. */
export const SCORE_ORDER: PlayerId[] = ['ahmed', 'kirti'];

export const PAIR_ID = 'pair:ahmed+kirti';

export function opponent(id: PlayerId): PlayerId {
  return id === 'kirti' ? 'ahmed' : 'kirti';
}
