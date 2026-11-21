import { isPairBlocked } from '../../domain/notifications';
import { PLAYERS, opponent } from '../../domain/players';
import { activeChallenge, isTied, latestChallengeFor, pairRecord } from '../../domain/selectors';
import { ScoreLine, ScreenLayout } from '../components/Common';
import { Replay } from '../components/Replay';
import { inviteTitle } from '../copy';
import { useOfferLogged, useReducedMotion, useReplayLogger } from '../hooks';
import { useBadla } from '../store';

function numberWord(n: number): string {
  return ['None', 'One', 'Two', 'Three', 'Four', 'Five'][n] ?? String(n);
}

/** Result of a return match with the updated head-to-head. */
export function RivalryScreen({ matchId }: { matchId: string }) {
  const { domain, ui, act, go } = useBadla();
  const reduced = useReducedMotion();
  const onViewed = useReplayLogger(matchId);
  const match = domain.matches[matchId];
  const viewer = ui.viewer;
  const opp = opponent(viewer);
  const tied = isTied(domain);
  const existing = latestChallengeFor(domain, matchId);
  const other = activeChallenge(domain);
  const blocked = isPairBlocked(domain);
  const canOffer = !!match && match.status === 'completed' && !existing && !other && !blocked;
  useOfferLogged(canOffer, matchId, tied ? 'decider' : 'another');

  if (!match?.winner) return null;
  const s = pairRecord(domain);
  const winner = PLAYERS[match.winner];
  const headline = tied ? `${numberWord(s.kirti)} each. Play the decider?` : null;

  const offer = () => {
    if (act({ type: 'sendChallenge', actor: viewer, matchId })) go({ name: 'lobby' });
  };

  return (
    <ScreenLayout
      label="Head to head"
      stage={
        <>
          <header className="result-head">
            <p className="eyebrow">Match {match.number} · {winner.name} vs {PLAYERS[opponent(winner.id)].name}</p>
            <h1 className="result-title">{winner.id === viewer ? 'You win.' : `${winner.name} wins.`}</h1>
            {headline && <p className="big-line">{headline}</p>}
            <ScoreLine domain={domain} big />
          </header>
          {match.keyEvent && (
            <Replay event={match.keyEvent} viewer={viewer} reducedMotion={reduced} onViewed={onViewed} label="Final move" compact />
          )}
        </>
      }
      panel={
        <div className="actions">
          {canOffer && (
            <>
              <button type="button" className="btn btn-primary btn-big" onClick={offer}>
                {tied ? 'Play the decider' : 'Ask for another match'}
              </button>
              <p className="hint">{PLAYERS[opp].name} has to accept. Same choices as before: play now, tomorrow evening or pass.</p>
            </>
          )}
          {existing && (
            <p className="hint">
              {existing.status === 'pending' && existing.invitee === viewer
                ? `${inviteTitle(existing, viewer)}.`
                : `${inviteTitle(existing, viewer)} Status is on the lobby card.`}
            </p>
          )}
          {existing && existing.status === 'pending' && existing.invitee === viewer && (
            <button type="button" className="btn btn-primary" onClick={() => go({ name: 'invite', challengeId: existing.id })}>
              See invitation
            </button>
          )}
          <button type="button" className={canOffer ? 'btn btn-secondary' : 'btn btn-secondary'} onClick={() => go({ name: 'lobby' })}>
            Back to lobby
          </button>
        </div>
      }
    />
  );
}
