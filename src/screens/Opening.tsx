import { useCallback } from 'react';
import { theSeries } from '../state/selectors';
import { Card, Gold, PriceSheet, SeriesScore } from '../ui/kit';
import { OpeningReplay } from '../ui/Replay';
import { Back, Terminal, useMe } from './common';

/** Screens 1 and 1b: the settled opening game from either captain's side. */
export function Opening() {
  const { state, me, dispatch, go } = useMe();
  const op = state.opening;
  const isLoser = me === op.loserId;
  const isWinner = me === op.winnerId;
  const series = theSeries(state);
  const onShown = useCallback(() => {
    dispatch({ type: 'LOG', name: 'result_view', roundId: op.roundId });
    dispatch({ type: 'LOG', name: 'replay_shown', roundId: op.roundId });
  }, [dispatch, op.roundId]);

  if (!isLoser && !isWinner) {
    return <Terminal title="Not available" body="This result belongs to the two captains." />;
  }
  return (
    <div className="screen">
      <Back />
      <p className="eyebrow">Opening singles · settled · 100 gold each</p>
      <h1 className="title">{isWinner ? 'You win.' : 'Gunjan wins.'}</h1>
      <p className="result-money">{isWinner ? <>You won <Gold amount={200} /> gross · net <Gold amount={100} signed /></> : <>You lost <Gold amount={-100} /></>}</p>
      <OpeningReplay state={state} viewer={me} onShown={onShown} />
      {series ? (
        <Card>
          <p className="eyebrow">Badla series</p>
          <SeriesScore state={state} seriesId={series.id} />
          <button type="button" className="btn btn-quiet" onClick={() => go({ name: 'home' })}>Go to the series</button>
        </Card>
      ) : (
        <>
          <button
            type="button"
            className="btn btn-ember btn-big"
            onClick={() => {
              dispatch({ type: 'LOG', name: 'challenge_opened', roundId: op.roundId, detail: { role: isWinner ? 'winner' : 'loser' } });
              go({ name: 'challenge', seriesId: null });
            }}
          >
            {isLoser ? 'Take Badla' : "You're 1-0 up. Go for 2-0"}
          </button>
          <p className="muted small">First to two. The opening win already counts as 1-0 to Gunjan. Nothing is charged until every seat taps Ready.</p>
          <PriceSheet format="all" />
        </>
      )}
    </div>
  );
}
