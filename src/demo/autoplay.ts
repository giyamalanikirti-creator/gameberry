import { useEffect } from 'react';
import { useStore } from '../state/store';

/**
 * Optional demo auto-play: takes other seats' turns after a human has started
 * the match. It never starts a round, readies a seat or confirms a booking.
 */
export function useAutoPlay(delayMs = 700) {
  const { state, me, demo } = useStore();
  const live = Object.values(state.rounds).find((r) => r.status === 'active' && r.game);
  const g = live?.game;
  const key = g ? `${live!.id}:${g.rollCount}:${g.turn}:${g.die}:${g.moves.length}` : '';
  const enabled = state.settings.autoPlay && !!live?.humanStarted && !!g && !g.winnerSide && g.seats[g.turn].playerId !== me;
  useEffect(() => {
    if (!enabled || !live) return;
    const t = setTimeout(() => demo({ type: 'DEMO_AUTO_STEP', roundId: live.id, sessionPlayer: me }), delayMs);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, enabled, me]);
}
