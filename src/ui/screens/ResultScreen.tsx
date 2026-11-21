import { isPairBlocked } from '../../domain/notifications';
import { PLAYERS, opponent } from '../../domain/players';
import { latestChallengeFor } from '../../domain/selectors';
import { Replay } from '../components/Replay';
import { ScoreLine, ScreenLayout } from '../components/Common';
import { useOfferLogged, useReducedMotion, useReplayLogger } from '../hooks';
import { useBadla } from '../store';

/** The original match result: "Ahmed wins." with the capture as the hero. */
export function ResultScreen({ matchId }: { matchId: string }) {
  const { domain, ui, act, go } = useBadla();
  const reduced = useReducedMotion();
  const onViewed = useReplayLogger(matchId);
  const match = domain.matches[matchId];
  const viewer = ui.viewer;
  const opp = opponent(viewer);
  const existing = latestChallengeFor(domain, matchId);
  const blocked = isPairBlocked(domain);
  const canAsk = !!match && match.winner === opp && !existing && !blocked;
  useOfferLogged(canAsk, matchId, 'badla');

  if (!match?.winner) return null;
  const winner = PLAYERS[match.winner];

  const ask = () => {
    if (act({ type: 'sendChallenge', actor: viewer, matchId })) go({ name: 'lobby' });
  };

  return (
    <ScreenLayout
      label="Match result"
      stage={
        <>
          <header className="result-head">
            <p className="eyebrow">1v1 · Match {match.number}</p>
            <h1 className="result-title">{winner.id === viewer ? 'You win.' : `${winner.name} wins.`}</h1>
            <ScoreLine domain={domain} />
          </header>
          {match.keyEvent && (
            <Replay
              event={match.keyEvent}
              viewer={viewer}
              reducedMotion={reduced}
              onViewed={onViewed}
              label={match.keyEvent.kind === 'capture' ? 'Earlier in this match' : 'Final move'}
            />
          )}
        </>
      }
      panel={
        <div className="actions">
          {canAsk && (
            <>
              <button type="button" className="btn btn-primary btn-big" onClick={ask}>
                Ask for Badla
              </button>
              <p className="hint">Invite {PLAYERS[opp].name} to one return match. Nothing is booked unless {PLAYERS[opp].name} agrees.</p>
            </>
          )}
          {existing && existing.challenger === viewer && (
            <p className="hint">You asked {PLAYERS[opp].name} for Badla. It's on your lobby card.</p>
          )}
          {!canAsk && !existing && match.winner === viewer && (
            <p className="hint">Good game. If {PLAYERS[opp].name} asks for a return match, it will appear in your lobby.</p>
          )}
          {blocked && !existing && <p className="hint">Invitations are off between you two.</p>}
          <button type="button" className={canAsk ? 'btn btn-secondary' : 'btn btn-primary'} onClick={() => go({ name: 'lobby' })}>
            Back to lobby
          </button>
        </div>
      }
    />
  );
}
