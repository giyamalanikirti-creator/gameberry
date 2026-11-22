import { useEffect, useMemo, useRef, useState } from 'react';
import type { Color } from '../engine/board';
import { buildFrames } from '../engine/replay';
import type { PlayerId, State } from '../domain/types';
import { Board, TokenMeta } from './Board';
import { useReducedMotion } from './motion';

/** Reads the opening match's immutable snapshot; never touches live state. */
export function OpeningReplay({ state, viewer, onShown }: { state: State; viewer: PlayerId; onShown: () => void }) {
  const e = state.opening.snapshot;
  const reduced = useReducedMotion();
  const actor = state.players[e.actorId as PlayerId];
  const victim = state.players[e.capture!.playerId as PlayerId];
  const youCaught = viewer === actor.id;
  const youWereCaught = viewer === victim.id;
  const headline = youWereCaught
    ? `${actor.name} caught you one square from home.`
    : youCaught
      ? `You caught ${victim.name} one square from home.`
      : `${actor.name} caught ${victim.name} one square from home.`;
  const copy = useMemo(() => ({
    intro: `${youWereCaught ? 'Your' : `${victim.name}'s`} last token, one square before the protected lane`,
    step: (n: number) => `${youCaught ? 'You roll' : `${actor.name} rolls`} ${e.roll} · ${n} of ${e.path.length}`,
    impact: 'Caught!',
    outro: headline,
  }), [youWereCaught, youCaught, victim.name, actor.name, e.roll, e.path.length, headline]);
  const frames = useMemo(() => buildFrames(e, copy), [e, copy]);
  const [i, setI] = useState(reduced ? frames.length - 1 : 0);
  const [playing, setPlaying] = useState(!reduced);
  const shown = useRef(false);

  useEffect(() => {
    if (!shown.current) { shown.current = true; onShown(); }
  }, [onShown]);

  useEffect(() => {
    if (!playing) return;
    if (i >= frames.length - 1) { setPlaying(false); return; }
    const t = setTimeout(() => setI((x) => x + 1), frames[i].durationMs);
    return () => clearTimeout(t);
  }, [playing, i, frames]);

  const meta: Partial<Record<Color, TokenMeta>> = {
    [actor.color!]: { name: actor.name, shape: actor.shape! },
    [victim.color!]: { name: victim.name, shape: victim.shape! },
  };
  const f = frames[i];
  const viewerColor = state.players[viewer].color;
  return (
    <figure className="replay">
      <div className="replay-stage">
        <Board tokens={f.tokens} meta={meta} perspective={viewerColor === actor.color || viewerColor === victim.color ? viewerColor : null}
          label={`Replay of the opening game. ${f.caption}`} focus={f.focus} impact={f.impact} still={reduced} active={[actor.color!, victim.color!]} />
        {f.impact && !reduced && <span className="impact-word" aria-hidden="true">Caught!</span>}
      </div>
      <figcaption className="replay-cap" aria-live="polite">{reduced ? `${headline} (Shown as the final frame.)` : f.caption}</figcaption>
      <div className="replay-ctl">
        {playing ? (
          <button type="button" className="btn btn-quiet btn-sm" onClick={() => { setPlaying(false); setI(frames.length - 1); }}>Skip</button>
        ) : (
          !reduced && <button type="button" className="btn btn-quiet btn-sm" onClick={() => { setI(0); setPlaying(true); }}>↻ Replay</button>
        )}
      </div>
    </figure>
  );
}
