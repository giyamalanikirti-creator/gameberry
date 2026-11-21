import { beforeEach, describe, expect, it } from 'vitest';
import { createInitialState, ORIGINAL_MATCH_ID } from '../domain/initialState';
import { PLAYERS } from '../domain/players';
import { reduce } from '../domain/reducer';
import { latestChallenge } from '../domain/selectors';
import { DEMO_START, MINUTE, defaultEveningWindow } from '../domain/time';
import type { DomainState } from '../domain/types';
import { STORAGE_KEY, UiState, loadSnapshot, saveSnapshot } from './storage';

const ui: UiState = {
  viewer: 'kirti',
  screens: { kirti: { name: 'result', matchId: ORIGINAL_MATCH_ID }, ahmed: { name: 'lobby' } },
  guided: true,
  reducedMotion: null,
  clockOffset: 0,
  bannersSeen: [],
};

function roundTrip(domain: DomainState): DomainState {
  saveSnapshot(domain, ui, localStorage);
  const r = loadSnapshot(localStorage);
  if (r.status !== 'ok') throw new Error(`load failed: ${JSON.stringify(r)}`);
  return r.snapshot.domain;
}

const step = (s: DomainState, a: Parameters<typeof reduce>[1]) => {
  const r = reduce(s, a);
  expect(r.accepted).toBe(true);
  return r.state;
};

describe('persistence', () => {
  beforeEach(() => localStorage.clear());

  it('empty storage loads as empty', () => {
    expect(loadSnapshot(localStorage).status).toBe('empty');
  });

  it('survives refresh during pending, proposed, waiting and after a roll', () => {
    const T0 = DEMO_START;
    const w = defaultEveningWindow(T0, PLAYERS.ahmed.timeZone);
    let s = step(createInitialState(), { type: 'sendChallenge', actor: 'kirti', matchId: ORIGINAL_MATCH_ID, at: T0 });
    s = roundTrip(s);
    expect(latestChallenge(s)!.status).toBe('pending');
    const c = latestChallenge(s)!.id;

    s = roundTrip(step(s, { type: 'proposeTime', actor: 'ahmed', challengeId: c, window: w, at: T0 + MINUTE }));
    expect(latestChallenge(s)!.status).toBe('proposed');

    s = step(s, { type: 'confirmTime', actor: 'kirti', challengeId: c, at: T0 + 2 * MINUTE });
    s = roundTrip(step(s, { type: 'ready', actor: 'ahmed', challengeId: c, at: w.start }));
    expect(latestChallenge(s)!.status).toBe('waiting');

    s = step(s, { type: 'ready', actor: 'kirti', challengeId: c, at: w.start + MINUTE });
    const mid = latestChallenge(s)!.matchId!;
    s = roundTrip(step(s, { type: 'roll', actor: 'kirti', matchId: mid, expectRollCount: 0, at: w.start + 2 * MINUTE }));
    const g = s.matches[mid].game!;
    expect(g.die).toBe(2); // rolled but unspent die resumes
    expect(g.dice).toMatchObject({ kind: 'guided', index: 1 });
    // After refresh the same die can be spent exactly once
    s = step(s, { type: 'move', actor: 'kirti', matchId: mid, tokenIndex: 3, expectRollCount: 1, at: w.start + 3 * MINUTE });
    expect(reduce(s, { type: 'move', actor: 'kirti', matchId: mid, tokenIndex: 3, expectRollCount: 1, at: w.start + 3 * MINUTE }).accepted).toBe(false);
  });

  it('expiry is reconciled after a refresh past the deadline', () => {
    const s = step(createInitialState(), { type: 'sendChallenge', actor: 'kirti', matchId: ORIGINAL_MATCH_ID, at: DEMO_START });
    const restored = roundTrip(s);
    const after = reduce(restored, { type: 'tick', at: DEMO_START + 25 * 60 * MINUTE }).state;
    expect(latestChallenge(after)!.status).toBe('expired');
  });

  it('rejects corrupt or mismatched snapshots', () => {
    localStorage.setItem(STORAGE_KEY, '{not json');
    expect(loadSnapshot(localStorage).status).toBe('invalid');
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 99 }));
    expect(loadSnapshot(localStorage)).toMatchObject({ status: 'invalid' });
    const bad = { version: 1, savedAt: 0, domain: { ...createInitialState(), results: [{ matchId: 'ghost', winner: 'kirti' }] }, ui };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(bad));
    expect(loadSnapshot(localStorage)).toMatchObject({ status: 'invalid', reason: 'result for unknown match' });
  });
});
