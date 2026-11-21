import { useEffect, useState } from 'react';
import { legalTokens, opponentOf, stepsToFinish } from '../../board/engine';
import type { Color } from '../../board/geometry';
import { PLAYERS } from '../../domain/players';
import type { Match, PlayerId } from '../../domain/types';
import { Board, TokenLegend } from '../components/Board';
import { Avatar, ScoreLine, ScreenLayout } from '../components/Common';
import { useBadla } from '../store';

const names = { blue: PLAYERS.kirti.name, red: PLAYERS.ahmed.name };

function Die({ value, rolling }: { value: number | null; rolling?: boolean }) {
  const pips: Record<number, Array<[number, number]>> = {
    1: [[1, 1]],
    2: [[0, 0], [2, 2]],
    3: [[0, 0], [1, 1], [2, 2]],
    4: [[0, 0], [2, 0], [0, 2], [2, 2]],
    5: [[0, 0], [2, 0], [1, 1], [0, 2], [2, 2]],
    6: [[0, 0], [2, 0], [0, 1], [2, 1], [0, 2], [2, 2]],
  };
  return (
    <span className={`die${value ? '' : ' die-empty'}${rolling ? ' die-rolling' : ''}`} aria-hidden="true">
      <svg viewBox="0 0 3 3">
        {value && pips[value].map(([x, y]) => <circle key={`${x}${y}`} cx={x + 0.5} cy={y + 0.5} r={0.28} />)}
      </svg>
    </span>
  );
}

function statusText(match: Match, viewer: PlayerId): string {
  const g = match.game!;
  const turnPlayer = PLAYERS[match.seats[g.turn]];
  const yourTurn = turnPlayer.id === viewer;
  const note = g.note;
  let prefix = '';
  if (note) {
    const who = PLAYERS[match.seats[note.color]];
    const whoText = who.id === viewer ? 'You' : who.name;
    if (note.kind === 'overshoot') {
      prefix = `${whoText} rolled ${note.roll}, but ${who.id === viewer ? 'you need' : 'needs'} exactly ${note.needed}. Turn passes to ${PLAYERS[match.seats[opponentOf(note.color)]].name}. `;
    } else if (note.kind === 'moved') {
      const left = stepsToFinish(g.tokens[note.color].find((p) => p !== 56) ?? 56);
      prefix = `${whoText} moved ${note.roll}. ${left} to go. `;
    }
  }
  if (g.winner) return `${PLAYERS[match.seats[g.winner]].name} brings the last token home.`;
  if (g.die !== null) {
    return yourTurn
      ? `${prefix}You rolled ${g.die}. Tap your highlighted token to move ${g.die}.`
      : `${prefix}${turnPlayer.name} rolled ${g.die}.`;
  }
  if (yourTurn) return `${prefix}Your turn. Roll the die.`;
  return `${prefix}${turnPlayer.name}'s turn${turnPlayer.id === 'ahmed' ? ' (demo opponent)' : ''}.`;
}

function Strip({ match, color, viewer }: { match: Match; color: Color; viewer: PlayerId }) {
  const g = match.game!;
  const pid = match.seats[color];
  const p = PLAYERS[pid];
  const active = g.tokens[color].find((pos) => pos !== 56);
  const isTurn = g.turn === color && !g.winner;
  return (
    <div className={`strip strip-${color}${isTurn ? ' strip-turn' : ''}`}>
      <Avatar player={pid} />
      <div className="strip-text">
        <strong>{p.name}{pid === viewer ? ' (you)' : ''}</strong>
        <small>
          {pid === 'ahmed' ? 'Demo opponent · same rules · ' : ''}
          {active === undefined ? 'All home' : `${stepsToFinish(active)} to finish`}
        </small>
      </div>
      {isTurn && <span className="turn-tag">Turn</span>}
    </div>
  );
}

export function MatchScreen({ matchId }: { matchId: string }) {
  const { domain, ui, act, go, switchViewer } = useBadla();
  const match = domain.matches[matchId];
  const [confirmLeave, setConfirmLeave] = useState(false);
  const viewer = ui.viewer;
  const g = match?.game;

  const myColor = PLAYERS[viewer].color;
  const myTurn = !!g && !g.winner && match.seats[g.turn] === viewer && viewer === 'kirti';
  const legal = g && g.die !== null && myTurn ? legalTokens(g.tokens, g.turn, g.die) : [];

  const roll = () => g && act({ type: 'roll', actor: viewer, matchId, expectRollCount: g.rollCount });
  const move = (i: number) => g && act({ type: 'move', actor: viewer, matchId, tokenIndex: i, expectRollCount: g.rollCount });

  // Keyboard: R rolls, M moves the only legal token.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLElement && ['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) return;
      if (!myTurn || !g) return;
      if ((e.key === 'r' || e.key === 'R') && g.die === null) roll();
      if ((e.key === 'm' || e.key === 'M') && legal.length) move(legal[0]);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  if (!match || !g) return null;
  const status = statusText(match, viewer);
  const top: Color = opponentOf(myColor);

  return (
    <ScreenLayout
      label={`Match ${match.number}`}
      stage={
        <div className="match">
          <Strip match={match} color={top} viewer={viewer} />
          <Board
            tokens={g.tokens}
            perspective={myColor}
            names={names}
            label={`Board. ${status}`}
            focus={g.lastMove ? [{ color: g.lastMove.color, tokenIndex: g.lastMove.tokenIndex }] : []}
            movable={legal.length ? { color: g.turn, tokens: legal, steps: g.die!, onMove: move } : null}
          />
          <div className="match-bottom">
            <Strip match={match} color={myColor} viewer={viewer} />
            <div className="dice-row">
              <Die value={g.die ?? g.note?.roll ?? null} />
              {viewer === 'kirti' ? (
                legal.length ? (
                  <button type="button" className="btn btn-primary btn-big" onClick={() => move(legal[0])}>
                    Move {g.die}
                  </button>
                ) : (
                  <button type="button" className="btn btn-primary btn-big" onClick={roll} disabled={!myTurn || g.die !== null}>
                    Roll
                  </button>
                )
              ) : (
                <button type="button" className="btn btn-secondary" onClick={() => switchViewer('kirti', { handoff: true })}>
                  Play as Kirti
                </button>
              )}
            </div>
          </div>
        </div>
      }
      panel={
        <div className="actions">
          <p className="status" role="status" aria-live="polite">{status}</p>
          <p className="eyebrow">Match {match.number} · Quick-style endgame</p>
          <ScoreLine domain={domain} />
          <details className="rules">
            <summary>Demo rules</summary>
            <ul>
              <li>Three tokens are already home for each side. One token each sits in its own protected lane.</li>
              <li>One die per turn, no extra turns. You need the exact number to finish; an overshoot passes the turn.</li>
              <li>{PLAYERS.ahmed.name}'s turns are taken by a labelled demo opponent using the same rules.</li>
              <li>Keyboard: R to roll, M to move.</li>
            </ul>
          </details>
          <TokenLegend names={names} />
          {viewer === 'kirti' &&
            (confirmLeave ? (
              <span className="confirm-row">
                <span className="hint">Leave? No result is recorded.</span>
                <button type="button" className="btn btn-danger btn-small" onClick={() => act({ type: 'leaveMatch', actor: viewer, matchId })}>Leave</button>
                <button type="button" className="btn btn-ghost btn-small" onClick={() => setConfirmLeave(false)}>Stay</button>
              </span>
            ) : (
              <button type="button" className="btn btn-ghost" onClick={() => setConfirmLeave(true)}>Leave match</button>
            ))}
          <button type="button" className="btn btn-ghost" onClick={() => go({ name: 'lobby' })}>Lobby</button>
        </div>
      }
    />
  );
}
