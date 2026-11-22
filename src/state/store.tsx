import { ReactNode, createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { DEMO_START } from '../domain/time';
import type { PlayerId, Route, State } from '../domain/types';
import { Action, Result, reduce, reconcile } from './reducer';
import { Root, SessionState, UiState, clear, load, save } from './persistence';
import { createFreshState } from './seed';

export interface Store {
  state: State;
  now: number;
  /** The signed-in player, or null. */
  me: PlayerId | null;
  session: SessionState;
  clockOffset: number;
  /** Product action: the actor is always the signed-in player. */
  dispatch: (a: Action) => Result;
  /** Demo drawer action: recorded with source "demo". */
  demo: (a: Action, actorForScript?: PlayerId | null) => Result;
  route: Route;
  go: (r: Route) => void;
  setClockOffset: (offset: number) => void;
  replaceState: (s: State, clockAt?: number) => void;
  reset: () => void;
  notice: string | null;
  dismissNotice: () => void;
  peek: () => Root;
  ui: UiState;
  setUi: (patch: Partial<UiState>) => void;
  /** Reset to the guided start (before the public match), keeping the chosen mode. */
  restart: (ui?: Partial<UiState>) => void;
}

const Ctx = createContext<Store | null>(null);
/** Write access to the session slice. Only src/session uses this. */
export const SessionWriteCtx = createContext<((fn: (s: SessionState) => SessionState) => void) | null>(null);

export function useStore(): Store {
  const s = useContext(Ctx);
  if (!s) throw new Error('StoreProvider missing');
  return s;
}

function fresh(ui: UiState = { mode: 'guided', welcomeSeen: false }): Root {
  return { version: 2, state: createFreshState(), session: { current: null, unlocked: [], routes: {} }, clockOffset: DEMO_START - Date.now(), ui };
}

function boot(): { root: Root; notice: string | null } {
  const l = load();
  if (l.status === 'ok') {
    const at = Date.now() + l.root.clockOffset;
    return { root: { ...l.root, state: reconcile(l.root.state, at) }, notice: null };
  }
  if (l.status === 'reset') return { root: fresh(), notice: `Saved demo could not be restored (${l.reason}), so it was reset to the seeded start.` };
  return { root: fresh(), notice: null };
}

export function StoreProvider({ children, tickMs = 1000 }: { children: ReactNode; tickMs?: number }) {
  const [init] = useState(boot);
  const [root, setRoot] = useState<Root>(init.root);
  const [notice, setNotice] = useState<string | null>(init.notice);
  const [, setTick] = useState(0);
  const ref = useRef(root);

  const commit = useCallback((next: Root) => {
    ref.current = next;
    setRoot(next);
    save(next);
  }, []);

  useEffect(() => {
    if (init.notice) save(init.root);
  }, [init]);

  const nowOf = (r: Root) => Date.now() + r.clockOffset;

  const run = useCallback((a: Action, actor: PlayerId | null, source: 'product' | 'demo'): Result => {
    const cur = ref.current;
    const res = reduce(cur.state, a, { at: nowOf(cur), actor, source });
    if (res.state !== cur.state) commit({ ...cur, state: res.state });
    return res;
  }, [commit]);

  const dispatch = useCallback((a: Action) => run(a, ref.current.session.current, 'product'), [run]);
  const demo = useCallback((a: Action, actorForScript: PlayerId | null = null) => run(a, actorForScript, 'demo'), [run]);

  const go = useCallback((r: Route) => {
    const cur = ref.current;
    const me = cur.session.current;
    if (!me) return;
    commit({ ...cur, session: { ...cur.session, routes: { ...cur.session.routes, [me]: r } } });
  }, [commit]);

  const writeSession = useCallback((fn: (s: SessionState) => SessionState) => {
    const cur = ref.current;
    commit({ ...cur, session: fn(cur.session) });
  }, [commit]);

  const setClockOffset = useCallback((offset: number) => {
    const cur = ref.current;
    const next = { ...cur, clockOffset: offset };
    const st = reconcile(cur.state, nowOf(next));
    commit({ ...next, state: st });
  }, [commit]);

  const replaceState = useCallback((s: State, clockAt?: number) => {
    const cur = ref.current;
    const offset = clockAt !== undefined ? clockAt - Date.now() : cur.clockOffset;
    commit({ ...cur, state: s, clockOffset: offset, session: { ...cur.session, routes: {} } });
  }, [commit]);

  const reset = useCallback(() => {
    clear();
    setNotice(null);
    commit(fresh({ ...ref.current.ui, welcomeSeen: true }));
  }, [commit]);

  const restart = useCallback((patch: Partial<UiState> = {}) => {
    setNotice(null);
    commit(fresh({ ...ref.current.ui, welcomeSeen: true, ...patch }));
  }, [commit]);

  const setUi = useCallback((patch: Partial<UiState>) => {
    const cur = ref.current;
    commit({ ...cur, ui: { ...cur.ui, ...patch } });
  }, [commit]);

  useEffect(() => {
    const id = setInterval(() => {
      setTick((t) => t + 1);
      const cur = ref.current;
      const st = reconcile(cur.state, nowOf(cur));
      if (st !== cur.state) commit({ ...cur, state: st });
    }, tickMs);
    return () => clearInterval(id);
  }, [commit, tickMs]);

  const me = root.session.current;
  const route: Route = (me && root.session.routes[me]) || { name: 'home' };
  const now = nowOf(root);
  const value = useMemo<Store>(() => ({
    state: root.state, now, me, session: root.session, clockOffset: root.clockOffset, dispatch, demo, route, go,
    setClockOffset, replaceState, reset, notice, dismissNotice: () => setNotice(null), peek: () => ref.current,
    ui: root.ui, setUi, restart,
  }), [root, now, me, route, dispatch, demo, go, setClockOffset, replaceState, reset, notice, setUi, restart]);

  return (
    <Ctx.Provider value={value}>
      <SessionWriteCtx.Provider value={writeSession}>{children}</SessionWriteCtx.Provider>
    </Ctx.Provider>
  );
}
