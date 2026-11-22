/**
 * The only module allowed to sign a player in. Screens never import this;
 * the account pane is its single consumer.
 */
import { ReactNode, createContext, useCallback, useContext, useMemo } from 'react';
import type { PlayerId } from '../domain/types';
import { SessionWriteCtx, useStore } from '../state/store';

interface SessionControls {
  signIn: (p: PlayerId, pin: string, remember: boolean) => string | null;
  switchTo: (p: PlayerId) => boolean;
  signOut: () => void;
  lockAll: () => void;
  isUnlocked: (p: PlayerId) => boolean;
}

const Ctx = createContext<SessionControls | null>(null);

export function useSessionControls(): SessionControls {
  const c = useContext(Ctx);
  if (!c) throw new Error('SessionProvider missing');
  return c;
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const write = useContext(SessionWriteCtx)!;
  const { state, session, dispatch } = useStore();

  const signIn = useCallback((p: PlayerId, pin: string, remember: boolean) => {
    if (state.players[p].pin !== pin) return 'That PIN does not match';
    write((s) => ({ ...s, current: p, unlocked: remember ? Array.from(new Set([...s.unlocked, p])) : s.unlocked.filter((x) => x !== p) }));
    dispatch({ type: 'SIGNED_IN' });
    return null;
  }, [state.players, write, dispatch]);

  const switchTo = useCallback((p: PlayerId) => {
    if (!session.unlocked.includes(p)) return false;
    write((s) => ({ ...s, current: p }));
    dispatch({ type: 'SIGNED_IN' });
    return true;
  }, [session.unlocked, write, dispatch]);

  const signOut = useCallback(() => write((s) => ({ ...s, current: null })), [write]);
  const lockAll = useCallback(() => write((s) => ({ ...s, current: null, unlocked: [] })), [write]);
  const isUnlocked = useCallback((p: PlayerId) => session.unlocked.includes(p), [session.unlocked]);

  const value = useMemo(() => ({ signIn, switchTo, signOut, lockAll, isUnlocked }), [signIn, switchTo, signOut, lockAll, isUnlocked]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
