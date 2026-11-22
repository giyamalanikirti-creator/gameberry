import { useEffect, useRef } from 'react';
import { formatTime, relativeDay } from '../domain/time';
import type { ClubFixture, Side } from '../domain/types';
import { isParticipant, predictionOf, predictionTotals } from '../state/selectors';
import { Card } from '../ui/kit';
import { Back, Terminal, useMe } from './common';
import { useTarget } from '../ui/shell';

export function FixtureCard({ f, full }: { f: ClubFixture; full?: boolean }) {
  const { state, me, now, tz, dispatch, go } = useMe();
  const pickT = useTarget('pick-side');
  const playing = isParticipant(state, f.roundId, me);
  const pick = predictionOf(state, f.id, me);
  const totals = predictionTotals(state, f.id);
  const r = state.rounds[f.roundId];
  const when = `${relativeDay(f.startsAt, now, tz)} ${formatTime(f.startsAt, tz)}`;
  const label = (s: Side) => f.teamLabels[s];
  const series = state.series[r.seriesId!];
  const sc = { A: 0, B: 0 };
  for (const id of series.roundIds) {
    const rr = state.rounds[id];
    if (rr.status === 'settled' && rr.outcome) sc[rr.outcome.winnerSide] += 1;
  }

  return (
    <Card tone={f.status === 'settled' ? 'gold' : f.status === 'withdrawn' || f.status === 'voided' ? 'quiet' : 'ember'} className="fixture">
      <p className="eyebrow">Grudge Night · {f.status === 'settled' ? 'Result' : `${when} IST`}</p>
      <h2 className="fx-teams">{label('B')} <span className="vs">vs</span> {label('A')}</h2>
      <p className="fx-score">Captains {f.seriesScoreAtPublish} · decider{f.status === 'settled' ? ` · final ${Math.max(sc.A, sc.B)}-${Math.min(sc.A, sc.B)}` : ''}</p>

      {f.status === 'listed' && (
        playing ? <p className="note">You're playing this one</p> : pick ? (
          <>
            <p className="ok">Your pick is in. Result tomorrow.</p>
            <div className="seg" role="group" aria-label="Change your pick until the start">
              {(['B', 'A'] as Side[]).map((s) => (
                <button key={s} type="button" aria-pressed={pick.pickSide === s} onClick={() => dispatch({ type: 'PREDICT', fixtureId: f.id, side: s })}>{label(s)}</button>
              ))}
            </div>
            <p className="fine">Free pick. Editable until the start. Totals stay hidden until the result.</p>
          </>
        ) : (
          <>
            <p className="pick-h">Pick a side</p>
            <div className="seg" role="group" aria-label="Pick a side">
              {(['B', 'A'] as Side[]).map((s) => (
                <button key={s} type="button" aria-pressed={false} {...(s === 'A' ? pickT : {})} onClick={() => dispatch({ type: 'PREDICT', fixtureId: f.id, side: s })}>{label(s)}</button>
              ))}
            </div>
            <p className="fine">Free pick, no gold. Picks lock at start; totals show after the match.</p>
          </>
        )
      )}
      {f.status === 'locked' && <p className="note">Predictions locked{pick ? ` · you picked ${label(pick.pickSide)}` : ''}. Match in progress.</p>}
      {f.status === 'settled' && (
        <>
          <p className="fx-winner">{label(f.winnerSide!)} win the series</p>
          {totals && <p className="small">Club picks: {label('B')} {totals.B} · {label('A')} {totals.A}</p>}
          {pick && <p className={pick.pickSide === f.winnerSide ? 'ok' : 'muted'}>You picked {label(pick.pickSide)}. {pick.pickSide === f.winnerSide ? `${label(f.winnerSide!)} won.` : 'Not this time.'}</p>}
        </>
      )}
      {(f.status === 'withdrawn' || f.status === 'voided') && (
        <p className="muted">{f.status === 'withdrawn' ? 'This listing was withdrawn' : 'Called off'}{f.closedReason ? ` · ${f.closedReason}` : ''}. No prediction verdict for anyone.</p>
      )}
      {!full && <button type="button" className="btn btn-quiet btn-sm" onClick={() => go({ name: 'fixture', id: f.id })}>Open</button>}
    </Card>
  );
}

export function Club() {
  const { state, me, dispatch } = useMe();
  const clubs = Object.values(state.clubs).filter((c) => c.memberIds.includes(me));
  const fixtures = Object.values(state.fixtures).filter((f) => clubs.some((c) => c.id === f.clubId)).reverse();
  const logged = useRef(false);
  useEffect(() => {
    if (logged.current) return;
    logged.current = true;
    dispatch({ type: 'LOG', name: 'club_open' });
  }, [dispatch]);
  return (
    <div className="screen">
      <p className="eyebrow">Club</p>
      <h1 className="title">{clubs[0]?.name ?? 'No club'}</h1>
      <p className="muted small">{clubs[0]?.memberIds.length ?? 0} members · fixtures appear here once all four players confirm.</p>
      {fixtures.length === 0 ? (
        <Card tone="quiet">
          <p className="eyebrow">Coming up</p>
          <p>Grudge Night fixtures appear here when four clubmates book a decider. Clubmates can pick a side for free.</p>
        </Card>
      ) : fixtures.map((f) => <FixtureCard key={f.id} f={f} />)}
    </div>
  );
}

export function FixtureScreen({ id }: { id: string }) {
  const { state, me, dispatch } = useMe();
  const f = state.fixtures[id];
  const member = f && state.clubs[f.clubId].memberIds.includes(me);
  const logged = useRef(false);
  useEffect(() => {
    if (!f || !member || logged.current) return;
    logged.current = true;
    dispatch({ type: 'LOG', name: f.status === 'settled' ? 'club_result_open' : 'fixture_view', roundId: f.roundId });
  }, [f, member, dispatch]);
  // Club visibility is checked on read: a non-member gets nothing, not even team names.
  if (!f || !member) return <Terminal title="Not available" body="This fixture is only visible to its club's members." />;
  return (
    <div className="screen">
      <Back to={{ name: 'club' }} label="Club" />
      <FixtureCard f={f} full />
    </div>
  );
}

export function Inbox() {
  const { state, me, now, tz, dispatch, go } = useMe();
  const list = state.notifications.filter((n) => n.to === me).slice().reverse();
  return (
    <div className="screen">
      <p className="eyebrow">Inbox</p>
      <h1 className="title">Notifications</h1>
      <p className="fine">At most two Badla notifications a day. Opening one never accepts anything.</p>
      {list.length === 0 && <Card tone="quiet"><p className="muted">Nothing yet.</p></Card>}
      <ul className="inbox">
        {list.map((n) => (
          <li key={n.id}>
            <button type="button" className={`inbox-row${n.readAt ? '' : ' unread'}${n.deferredTo && n.deferredTo > now ? ' deferred' : ''}`} onClick={() => { dispatch({ type: 'READ_NOTIFICATION', id: n.id }); go(n.route); }}>
              <strong>{n.title}</strong>
              {n.body && <span className="small">{n.body}</span>}
              <small>{n.deferredTo && n.deferredTo > now ? 'Delivered tomorrow · daily cap of two Badla alerts' : `${relativeDay(n.createdAt, now, tz)} ${formatTime(n.createdAt, tz)}`}</small>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
