import { currentRound, openInvitesTo, pendingActions, seatFor, seriesStatus, theSeries, balance } from '../state/selectors';
import { formatSlot } from '../domain/time';
import { Avatar, Card, Gold, SeriesScore } from '../ui/kit';
import { useShell, useTarget } from '../ui/shell';
import { routeForPending, useMe } from './common';

/** A game-style home: who you are, daily rewards, play buttons, then anything waiting on you. */
export function Home() {
  const { state, me, now, go, dispatch, tz } = useMe();
  const { flash } = useShell();
  const player = state.players[me];
  const series = theSeries(state);
  const pending = pendingActions(state, me, now);
  const isCaptain = me === state.opening.winnerId || me === state.opening.loserId;
  const round = series ? currentRound(state, series) : null;
  const quickT = useTarget('quick', 'mode-btn mode-quick');

  const quick = () => {
    if (me === 'riya' && !state.opening.played) {
      dispatch({ type: 'PUBLIC_QUICK' });
      go({ name: 'public' });
    } else flash(state.opening.played ? 'Your public match is already played in this story.' : 'In this story, Riya plays the public match.');
  };

  return (
    <div className="screen">
      <button type="button" className="player-card" onClick={() => go({ name: 'profile' })} aria-label={`${player.name}, level ${player.level}, ${balance(state, me)} gold. Open profile`}>
        <Avatar state={state} id={me} size={52} />
        <span className="pc-main">
          <strong>{player.name}</strong>
          <small>Level {player.level} · {player.accountKind === 'clubOnly' ? 'Club member' : player.accountKind === 'partner' ? 'Partner account' : 'Full account'}</small>
        </span>
        <Gold amount={balance(state, me)} />
      </button>

      <div className="rewards" aria-label="Daily rewards">
        <button type="button" className="reward" onClick={() => flash('Daily rewards are not part of this prototype.')}><span aria-hidden="true">🎁</span> Magic Chest</button>
        <button type="button" className="reward" onClick={() => flash('Daily rewards are not part of this prototype.')}><span aria-hidden="true">🎲</span> Lucky Dice</button>
      </div>

      <div className="modes" aria-label="Play">
        <button type="button" {...quickT} onClick={quick}><strong>Quick</strong><small>2 players · 100 gold</small></button>
        <button type="button" className="mode-btn" onClick={() => flash('Classic is not part of this prototype.')}><strong>Classic</strong><small>4 players</small></button>
        <button type="button" className="mode-btn" onClick={() => flash('Private tables are not part of this prototype.')}><strong>Private table</strong><small>Invite friends</small></button>
      </div>

      {pending.length > 0 && (
        <Card tone="ember">
          <h2 className="card-h">Waiting on you</h2>
          <ul className="todo">
            {pending.map((p) => (
              <li key={`${p.kind}${p.ref}`}>
                <button type="button" className="todo-row" onClick={() => go(routeForPending(state, p))}>
                  <span>{p.label}</span><span aria-hidden="true">›</span>
                </button>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {isCaptain && state.opening.played && !series && (
        <Card>
          <p className="eyebrow">Last match · Quick · 100 gold</p>
          <h2 className="card-h">{me === state.opening.loserId ? 'Gunjan sent you home 1 square from the finish.' : "You're 1-0 up. Go for 2-0"}</h2>
          <button type="button" className="btn btn-ember" onClick={() => go({ name: 'opening' })}>See the result</button>
        </Card>
      )}

      {series && (isCaptain || (round && seatFor(state, round, me))) && (
        <Card>
          <p className="eyebrow">Badla series · first to two · {seriesStatus(state, series.id)}</p>
          <SeriesScore state={state} seriesId={series.id} big />
          {round && (
            <p className="muted">
              {round.isDecider ? 'Decider' : `Round ${round.index}`} · {round.format === 'doubles' ? 'Doubles' : 'Singles'} · {round.status}
              {round.window ? ` · ${formatSlot(round.window, now, tz)}` : ''}
            </p>
          )}
          <button type="button" className="btn btn-quiet" onClick={() => go({ name: 'badla' })}>Open Badla</button>
        </Card>
      )}

      {player.accountKind === 'partner' && !round && openInvitesTo(state, me).length === 0 && (
        <Card tone="quiet">
          <h2 className="card-h">Partner Assist</h2>
          <p className="muted">No Badla seat yet. When a friend invites you to their side, it appears here.</p>
        </Card>
      )}
    </div>
  );
}
