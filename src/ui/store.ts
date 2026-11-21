import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { suggestedToken } from '../board/engine';
import { createInitialState } from '../domain/initialState';
import { Action, reduce, reconcile } from '../domain/reducer';
import type { DomainState, PlayerId } from '../domain/types';
import { Screen, UiState, clearSnapshot, loadSnapshot, saveSnapshot } from '../persistence/storage';
import { freshUi, handoffScreen, syncScreens } from './navigation';

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;
export type ActionInput = DistributiveOmit<Action, 'at'>;

interface StoreState {
  domain: DomainState;
  ui: UiState;
}

export interface Badla {
  domain: DomainState;
  ui: UiState;
  now: number;
  loadError: string | null;
  act: (a: ActionInput) => boolean;
  go: (screen: Screen, player?: PlayerId) => void;
  switchViewer: (p: PlayerId, opts?: { handoff?: boolean }) => void;
  advanceClock: (ms: number, label: string) => void;
  setUi: (patch: Partial<UiState>) => void;
  reset: () => void;
  toast: string | null;
  showToast: (msg: string) => void;
  /** Latest committed state, including changes made earlier in the same event handler. */
  peek: () => { domain: DomainState; ui: UiState; now: number };
}

function initial(): { state: StoreState; error: string | null } {
  const loaded = loadSnapshot();
  if (loaded.status === 'ok') {
    const { domain, ui } = loaded.snapshot;
    const at = Date.now() + ui.clockOffset;
    const d = reconcile(domain, at);
    return { state: { domain: d, ui: syncScreens(d, ui, at) }, error: null };
  }
  return {
    state: { domain: createInitialState(), ui: freshUi() },
    error: loaded.status === 'invalid' ? loaded.reason : null,
  };
}

export const BadlaContext = createContext<Badla | null>(null);

export function useBadla(): Badla {
  const ctx = useContext(BadlaContext);
  if (!ctx) throw new Error('BadlaContext missing');
  return ctx;
}

export function useBadlaStore(options: { opponentDelayMs?: number; tickMs?: number } = {}): Badla {
  const { opponentDelayMs = 850, tickMs = 1000 } = options;
  const [boot] = useState(initial);
  const [store, setStore] = useState<StoreState>(boot.state);
  const [loadError, setLoadError] = useState<string | null>(boot.error);
  const [toast, setToast] = useState<string | null>(null);
  const [, setTick] = useState(0);
  const ref = useRef(store);
  const errorRef = useRef(loadError);
  errorRef.current = loadError;

  const commit = useCallback((next: StoreState) => {
    ref.current = next;
    setStore(next);
    // Do not overwrite unreadable saved data until the reviewer chooses to reset.
    if (!errorRef.current) saveSnapshot(next.domain, next.ui);
  }, []);

  const clock = () => Date.now() + ref.current.ui.clockOffset;

  const act = useCallback((a: ActionInput): boolean => {
    const cur = ref.current;
    const at = clock();
    const r = reduce(cur.domain, { ...a, at } as Action);
    if (r.state !== cur.domain) commit({ domain: r.state, ui: syncScreens(r.state, cur.ui, at) });
    return r.accepted;
  }, [commit]);

  const setUi = useCallback((patch: Partial<UiState>) => {
    const cur = ref.current;
    commit({ ...cur, ui: { ...cur.ui, ...patch } });
  }, [commit]);

  const go = useCallback((screen: Screen, player?: PlayerId) => {
    const cur = ref.current;
    const p = player ?? cur.ui.viewer;
    commit({ ...cur, ui: { ...cur.ui, screens: { ...cur.ui.screens, [p]: screen } } });
  }, [commit]);

  const switchViewer = useCallback((p: PlayerId, opts: { handoff?: boolean } = {}) => {
    const cur = ref.current;
    if (cur.ui.viewer === p && !opts.handoff) return;
    const at = clock();
    const current = cur.ui.screens[p];
    const target = opts.handoff || current.name === 'result' || current.name === 'lobby'
      ? handoffScreen(cur.domain, p, at, current)
      : current;
    commit({ ...cur, ui: { ...cur.ui, viewer: p, screens: { ...cur.ui.screens, [p]: target } } });
    act({ type: 'demoNote', name: 'demo_view_switched', detail: { to: p, guided: !!opts.handoff } });
    act({ type: 'appOpened', actor: p });
  }, [act, commit]);

  const advanceClock = useCallback((ms: number, label: string) => {
    if (ms <= 0) return;
    const cur = ref.current;
    commit({ ...cur, ui: { ...cur.ui, clockOffset: cur.ui.clockOffset + ms } });
    act({ type: 'demoNote', name: 'demo_clock_advanced', detail: { by: label, minutes: Math.round(ms / 60000) } });
    act({ type: 'tick' });
  }, [act, commit]);

  const reset = useCallback(() => {
    clearSnapshot();
    setLoadError(null);
    errorRef.current = null;
    const ui = freshUi();
    const domain = reduce(createInitialState(), { type: 'demoNote', name: 'demo_reset', at: Date.now() + ui.clockOffset }).state;
    commit({ domain, ui });
  }, [commit]);

  const showToast = useCallback((msg: string) => setToast(msg), []);
  const peek = useCallback(() => ({ ...ref.current, now: Date.now() + ref.current.ui.clockOffset }), []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  // The demo clock runs in real time; reconcile expiries every tick.
  useEffect(() => {
    const id = setInterval(() => {
      setTick((n) => n + 1);
      act({ type: 'tick' });
    }, tickMs);
    return () => clearInterval(id);
  }, [act, tickMs]);

  // The labelled demo opponent takes Ahmed's turns through the same reducer.
  const live = Object.values(store.domain.matches).find((m) => m.status === 'playing' && m.game);
  const opponentKey = live?.game ? `${live.id}:${live.game.rollCount}:${live.game.turn}:${live.game.die}` : '';
  useEffect(() => {
    if (!live?.game) return;
    const g = live.game;
    const actor = live.seats[g.turn];
    if (actor !== 'ahmed' || g.winner) return;
    const t = setTimeout(() => {
      if (g.die === null) {
        act({ type: 'roll', actor, matchId: live.id, expectRollCount: g.rollCount, source: 'demo-opponent' });
      } else {
        const token = suggestedToken(g);
        if (token !== null) act({ type: 'move', actor, matchId: live.id, tokenIndex: token, expectRollCount: g.rollCount, source: 'demo-opponent' });
      }
    }, opponentDelayMs);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [opponentKey, act, opponentDelayMs]);

  // Log one app open per load for the active identity. It never notifies anyone.
  const opened = useRef(false);
  useEffect(() => {
    if (opened.current) return;
    opened.current = true;
    act({ type: 'appOpened', actor: ref.current.ui.viewer });
  }, [act]);

  const now = Date.now() + store.ui.clockOffset;
  return useMemo(
    () => ({ domain: store.domain, ui: store.ui, now, loadError, act, go, switchViewer, advanceClock, setUi, reset, toast, showToast, peek }),
    [store, now, loadError, act, go, switchViewer, advanceClock, setUi, reset, toast, showToast, peek],
  );
}
