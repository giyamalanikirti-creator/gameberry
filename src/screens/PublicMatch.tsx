import { useEffect, useState } from 'react';
import { CHAT_LINE, PUBLIC_SCRIPT, legalFor } from '../engine/publicMatch';
import { Board } from '../ui/Board';
import { Avatar } from '../ui/kit';
import { useReducedMotion } from '../ui/motion';
import { useShell, useTarget } from '../ui/shell';
import { Terminal, useMe } from './common';

/** Flow 1: Riya's public Quick match. Scripted dice, real rules, the capture happens live. */
export function PublicMatch() {
  const { state, me, dispatch, go } = useMe();
  const { flash } = useShell();
  const reduced = useReducedMotion();
  const g = state.publicGame;
  const [shake, setShake] = useState(false);
  const [bubble, setBubble] = useState(false);
  const rollT = useTarget('public-roll', 'btn btn-ember btn-big btn-roll');
  const moveT = useTarget('public-move', 'btn btn-ember btn-big btn-roll');
  const ffT = useTarget('public-ff', 'btn btn-quiet');

  useEffect(() => {
    if (!g || g.phase !== 'matchmaking') return;
    const t = setTimeout(() => dispatch({ type: 'PUBLIC_MATCHED' }), 2000);
    return () => clearTimeout(t);
  }, [g, dispatch]);

  // The matchmade opponent's turns play out on their own.
  const oppTurn = g?.phase === 'playing' && PUBLIC_SCRIPT[g.index]?.who === 'gunjan';
  useEffect(() => {
    if (!oppTurn) return;
    const t = setTimeout(() => dispatch({ type: 'PUBLIC_OPPONENT' }), 900);
    return () => clearTimeout(t);
  }, [oppTurn, g?.index, dispatch]);

  const captured = !!g?.captured;
  useEffect(() => {
    if (!captured) return;
    flash('Sent home!');
    setBubble(true);
    if (!reduced) {
      setShake(true);
      const t = setTimeout(() => setShake(false), 300);
      return () => clearTimeout(t);
    }
  }, [captured, reduced, flash]);

  useEffect(() => {
    if (g?.phase === 'done') {
      const t = setTimeout(() => go({ name: 'opening' }), 900);
      return () => clearTimeout(t);
    }
  }, [g?.phase, go]);

  if (me !== 'riya') return <Terminal title="Not available" body="This public match belongs to Riya." />;
  if (!g) return <Terminal title="No match" body="Tap Quick on Home to play." />;

  if (g.phase === 'matchmaking') {
    return (
      <div className="screen matchmaking" aria-live="polite">
        <p className="eyebrow">Quick · 2 players · 100 gold</p>
        <div className="mm-vs">
          <Avatar state={state} id="riya" size={64} />
          <span className="mm-dots" aria-hidden="true">• • •</span>
          <span className="mm-unknown" aria-hidden="true">?</span>
        </div>
        <h1 className="title">Finding an opponent…</h1>
      </div>
    );
  }

  const step = PUBLIC_SCRIPT[g.index];
  const myTurn = g.phase === 'playing' && step?.who === 'riya';
  const legal = g.die !== null ? legalFor(g.tokens, 'riya', g.die) : [];
  const last = g.log[g.log.length - 1];

  return (
    <div className="screen screen-game">
      <div className="hud" aria-live="polite">
        <span className="hud-turn">{g.phase === 'done' ? 'Gunjan wins' : myTurn ? (g.die === null ? 'Your turn' : `You rolled ${g.die}`) : 'Gunjan is rolling…'}</span>
        <span className="small muted">Quick · 100 gold</span>
      </div>
      <div className="pm-players">
        <span className="pm-p"><Avatar state={state} id="riya" size={28} /> Riya (you)</span>
        <span className="pm-p pm-opp">
          {bubble && <span className="chat-bubble" role="status">{CHAT_LINE}</span>}
          Gunjan <Avatar state={state} id="gunjan" size={28} />
        </span>
      </div>
      <div className={shake ? 'shake' : ''}>
        <Board
          tokens={g.tokens}
          meta={{ red: { name: 'Riya', shape: 'circle' }, teal: { name: 'Gunjan', shape: 'diamond' } }}
          perspective="red"
          label={`Public match. ${last ?? 'Matched with Gunjan.'}`}
          active={['red', 'teal']}
          movable={myTurn && legal.length ? { color: 'red', tokenIndex: legal[0], steps: g.die!, onMove: () => dispatch({ type: 'PUBLIC_MOVE' }) } : null}
          focus={captured ? [{ color: 'red', tokenIndex: 3 }] : []}
        />
      </div>
      <p className="note" role="status">{last ?? 'Matched with Gunjan. You go first.'}</p>
      <div className="roll-row">
        <span className="die num" aria-label={g.die ? `Die shows ${g.die}` : 'No die rolled'}>{g.die ?? '–'}</span>
        {g.phase === 'done' ? (
          <button type="button" className="btn btn-ember btn-big" onClick={() => go({ name: 'opening' })}>See the result</button>
        ) : myTurn && g.die === null ? (
          <button type="button" {...rollT} onClick={() => dispatch({ type: 'PUBLIC_ROLL' })}>Roll</button>
        ) : myTurn ? (
          <button type="button" {...moveT} onClick={() => dispatch({ type: 'PUBLIC_MOVE' })}>Move {g.die}</button>
        ) : (
          <span className="waiting">Gunjan's turn…</span>
        )}
      </div>
      {captured && g.phase === 'playing' && (
        <button type="button" {...ffT} onClick={() => dispatch({ type: 'PUBLIC_FAST_FORWARD' })}>Skip to the result ›</button>
      )}
      <p className="fine">Quick endgame · scripted dice so the capture plays the same way every time</p>
    </div>
  );
}
