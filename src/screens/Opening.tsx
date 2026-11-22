import { useCallback, useEffect, useRef, useState } from 'react';
import { cardScore, OPENING_CHATS } from '../smart/smartFixture';
import { theSeries } from '../state/selectors';
import { Card, Gold, SeriesScore } from '../ui/kit';
import { OpeningReplay } from '../ui/Replay';
import { useTarget } from '../ui/shell';
import { Term } from '../ui/Term';
import { Back, Terminal, useMe } from './common';

/** The one AI tag allowed per screen, with its "Why this?" explanation. */
export function SmartTag({ why, children }: { why: string; children?: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <span className="smart-wrap">
      <button type="button" className="smart-tag" aria-expanded={open} onClick={() => setOpen((o) => !o)}>✨ Smart Fixture · Why this?</button>
      {open && <span className="smart-why" role="note">{why}{children}</span>}
    </span>
  );
}

/** Result of the public match (screens 1/1b), with post-match options set by the experiment variant. */
export function Opening() {
  const { state, me, dispatch, go } = useMe();
  const op = state.opening;
  const isLoser = me === op.loserId;
  const isWinner = me === op.winnerId;
  const series = theSeries(state);
  const variant = state.settings.variant;
  const card = cardScore(1, OPENING_CHATS);
  const showCard = (variant === 'C' || variant === 'D') && card.show;
  const takeT = useTarget('take-badla', 'btn btn-ember btn-big');
  const rematchT = useTarget('rematch', 'btn btn-ember btn-big');
  const logged = useRef(false);
  const onShown = useCallback(() => {
    dispatch({ type: 'LOG', name: 'result_view', roundId: op.roundId, detail: { variant } });
    dispatch({ type: 'LOG', name: 'replay_shown', roundId: op.roundId });
  }, [dispatch, op.roundId, variant]);

  useEffect(() => {
    if (!showCard || series || logged.current || !(isLoser || isWinner)) return;
    logged.current = true;
    dispatch({ type: 'LOG', name: 'badla_card_shown', roundId: op.roundId, detail: { cardScore: Number(card.score.toFixed(2)), variant } });
  }, [showCard, series, isLoser, isWinner, dispatch, op.roundId, card.score, variant]);

  if (!op.played) return <Terminal title="No result yet" body="Play the public match first: Home → Quick." />;
  if (!isLoser && !isWinner) return <Terminal title="Not available" body="This result belongs to the two players." />;

  return (
    <div className="screen">
      <Back />
      <p className="eyebrow">Quick · public match · settled</p>
      <h1 className="title">{isWinner ? 'You win.' : 'Gunjan wins.'}</h1>
      <p className="result-money">
        {isWinner ? <>Gold receipt <Gold amount={100} signed /> <span className="muted small">(<Term t="entry">entry</Term> 100, <Term t="pot">pot</Term> 200)</span></> : <>Gold receipt <Gold amount={-100} /> <span className="muted small">(<Term t="entry">entry</Term> 100)</span></>}
      </p>
      <OpeningReplay state={state} viewer={me} onShown={onShown} />

      {series ? (
        <Card>
          <p className="eyebrow">Badla series</p>
          <SeriesScore state={state} seriesId={series.id} />
          <button type="button" className="btn btn-quiet" onClick={() => go({ name: 'badla' })}>Go to Badla</button>
        </Card>
      ) : variant === 'A' ? (
        <button type="button" className="btn btn-quiet btn-big" onClick={() => go({ name: 'home' })}>Back to lobby</button>
      ) : variant === 'B' ? (
        <>
          <button type="button" {...rematchT} onClick={() => {
            const r = dispatch({ type: 'SEND_CHALLENGE', format: 'singles', timing: 'now' });
            if (r.accepted) go({ name: 'invite', id: r.ref! });
          }}>Rematch · play now</button>
          <button type="button" className="btn btn-quiet" onClick={() => go({ name: 'home' })}>Back to lobby</button>
        </>
      ) : showCard ? (
        <Card tone="ember" className="badla-card">
          {variant === 'D' && <SmartTag why={`Shown because the capture was 1 square from home and you chatted ${OPENING_CHATS} times (card score ${card.score.toFixed(1)} ≥ 0.6).`} />}
          <h2 className="card-h">{isLoser ? 'Gunjan sent you home 1 square from the finish. Take Badla?' : "You're 1-0 up. Go for 2-0"}</h2>
          <p className="chip-explain">Badla is first to two: this match already counts as 1-0 to Gunjan.</p>
          <button type="button" {...takeT} onClick={() => {
            dispatch({ type: 'LOG', name: 'challenge_opened', roundId: op.roundId, detail: { role: isWinner ? 'winner' : 'loser' } });
            go({ name: 'challenge', seriesId: null });
          }}>{isLoser ? 'Take Badla' : 'Go for 2-0'}</button>
          <button type="button" className="link" onClick={() => go({ name: 'home' })}>Back to lobby</button>
        </Card>
      ) : (
        <button type="button" className="btn btn-quiet btn-big" onClick={() => go({ name: 'home' })}>Back to lobby</button>
      )}
    </div>
  );
}
