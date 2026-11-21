import { useCallback, useEffect, useRef, useState } from 'react';
import { useBadla } from './store';

export function useSystemReducedMotion(): boolean {
  const query = '(prefers-reduced-motion: reduce)';
  const get = () => typeof window !== 'undefined' && !!window.matchMedia?.(query).matches;
  const [value, setValue] = useState(get);
  useEffect(() => {
    const mq = window.matchMedia?.(query);
    if (!mq) return;
    const on = () => setValue(mq.matches);
    mq.addEventListener?.('change', on);
    return () => mq.removeEventListener?.('change', on);
  }, []);
  return value;
}

export function useReducedMotion(): boolean {
  const { ui } = useBadla();
  const system = useSystemReducedMotion();
  return ui.reducedMotion ?? system;
}

/** Log an offer once when a screen with an invitation offer is shown. */
export function useOfferLogged(enabled: boolean, matchId: string, offer: 'badla' | 'decider' | 'another') {
  const { act, ui } = useBadla();
  const done = useRef('');
  useEffect(() => {
    const key = `${matchId}:${ui.viewer}:${offer}`;
    if (!enabled || done.current === key) return;
    done.current = key;
    act({ type: 'offerShown', actor: ui.viewer, matchId, offer });
  }, [enabled, matchId, offer, ui.viewer, act]);
}

export function useReplayLogger(matchId: string) {
  const { act, ui } = useBadla();
  return useCallback(
    (mode: 'animated' | 'static') => act({ type: 'replayViewed', actor: ui.viewer, matchId, mode }),
    [act, ui.viewer, matchId],
  );
}
