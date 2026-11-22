import { useEffect } from 'react';
import { PLAYER_IDS } from '../state/seed';
import {
  currentRound,
  openInvitesTo,
  pendingActions,
  seatFor,
  seriesStatus,
  theSeries,
} from '../state/selectors';
import { formatSlot } from '../domain/time';
import { Avatar, Card, Gold, SeriesScore } from '../ui/kit';
import { routeForPending, useMe } from './common';

export function Home() {
  const { state, me, now, go, tz } = useMe();
  const player = state.players[me];
  const series = theSeries(state);
  const pending = pendingActions(state, me, now);

  useEffect(() => {
    if (player.accountKind === 'clubOnly') go({ name: 'club' });
  }, [player.accountKind, go]);

  const isCaptain = me === state.opening.winnerId || me === state.opening.loserId;
  const round = series ? currentRound(state, series) : null;

  return (
    <div className="screen">
      <header className="hello">
        <Avatar state={state} id={me} size={44} />
        <div>
          <p className="eyebrow">{player.accountKind === 'partner' ? 'Partner account' : 'Lobby'}</p>
          <h1>Hi, {player.name}</h1>
        </div>
      </header>

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

      {isCaptain && !series && (
        <Card>
          <p className="eyebrow">Opening game · 100 gold · settled</p>
          <h2 className="card-h">{me === state.opening.loserId ? 'Gunjan caught you one square from home.' : "You're 1-0 up. Go for 2-0"}</h2>
          <p className="muted">
            {me === state.opening.winnerId ? 'You won 200 gold back.' : 'You lost 100 gold.'} Either captain can start a Badla series: first to two.
          </p>
          <button type="button" className="btn btn-ember" onClick={() => go({ name: 'opening' })}>
            {me === state.opening.loserId ? 'See the result · Take Badla' : 'See the result · Go for 2-0'}
          </button>
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
          <div className="row">
            {round && <button type="button" className="btn btn-quiet" onClick={() => go({ name: 'round', id: round.id })}>Open round</button>}
            {isCaptain && <button type="button" className="btn btn-quiet" onClick={() => go({ name: 'opening' })}>Opening game</button>}
          </div>
        </Card>
      )}

      {player.accountKind === 'partner' && !round && openInvitesTo(state, me).length === 0 && (
        <Card tone="quiet">
          <h2 className="card-h">Partner Assist</h2>
          <p className="muted">No Badla seat yet. When a friend invites you to their side, it appears here.</p>
        </Card>
      )}

      <Card tone="quiet">
        <h2 className="card-h">Wallet</h2>
        <p className="wallet-line">Your balance <Gold amount={state.wallet.filter((e) => e.playerId === me).reduce((a, e) => a + e.amount, 0)} /></p>
        <p className="fine">Gold is game currency in this demo. Nothing here can be bought.</p>
      </Card>

      {PLAYER_IDS.length > 0 && <p className="fine center">{state.clubs['club-chai-dice'].name} · {state.clubs['club-chai-dice'].memberIds.length} members</p>}
    </div>
  );
}
