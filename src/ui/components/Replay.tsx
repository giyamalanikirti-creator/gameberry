import { useEffect, useMemo, useRef, useState } from 'react';
import { ReplayEvent, buildFrames } from '../../board/replay';
import { PLAYERS } from '../../domain/players';
import type { PlayerId } from '../../domain/types';
import { eventCopy } from '../copy';
import { Board, TokenLegend } from './Board';

interface Props {
  event: ReplayEvent;
  viewer: PlayerId;
  reducedMotion: boolean;
  onViewed: (mode: 'animated' | 'static') => void;
  label?: string;
  compact?: boolean;
}

const names = { red: PLAYERS.kirti.name, yellow: PLAYERS.ahmed.name };

/**
 * Plays a stored event from its own snapshot. Nothing here touches the live
 * game or the head-to-head record.
 */
export function Replay({ event, viewer, reducedMotion, onViewed, label, compact }: Props) {
  const copy = useMemo(() => eventCopy(event, viewer), [event, viewer]);
  const frames = useMemo(() => buildFrames(event, copy), [event, copy]);
  const [frame, setFrame] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [played, setPlayed] = useState(false);
  const perspective = PLAYERS[viewer].color;
  const loggedStatic = useRef(false);

  useEffect(() => {
    if (!playing) return;
    if (frame >= frames.length - 1) {
      setPlaying(false);
      return;
    }
    const t = setTimeout(() => setFrame((f) => f + 1), frames[frame].durationMs);
    return () => clearTimeout(t);
  }, [playing, frame, frames]);

  useEffect(() => {
    if (reducedMotion && !loggedStatic.current) {
      loggedStatic.current = true;
      onViewed('static');
    }
  }, [reducedMotion, onViewed]);

  const play = () => {
    setFrame(0);
    setPlaying(true);
    setPlayed(true);
    onViewed('animated');
  };
  const skip = () => {
    setPlaying(false);
    setFrame(frames.length - 1);
  };

  if (reducedMotion) {
    return (
      <figure className={`replay replay-static${compact ? ' replay-compact' : ''}`}>
        {label && <p className="eyebrow">{label}</p>}
        <figcaption className="replay-headline">{copy.headline}</figcaption>
        <div className="replay-pair">
          <div>
            <Board tokens={event.before} perspective={perspective} names={names} animate={false}
              focus={frames[0].focus} label={copy.staticBefore} compact />
            <p className="replay-note">{copy.staticBefore}</p>
          </div>
          <div>
            <Board tokens={event.after} perspective={perspective} names={names} animate={false}
              focus={frames[frames.length - 1].focus} label={copy.staticAfter} compact />
            <p className="replay-note">{copy.staticAfter}</p>
          </div>
        </div>
        <p className="replay-motion-note">Reduced motion: showing before and after frames.</p>
      </figure>
    );
  }

  const f = !played && event.kind === 'finish' ? frames[frames.length - 1] : frames[frame];
  const atEnd = frame === frames.length - 1;
  const poster = !played;
  return (
    <figure className={`replay${compact ? ' replay-compact' : ''}`}>
      {label && <p className="eyebrow">{label}</p>}
      <div className="replay-stage">
        <Board
          tokens={f.tokens}
          perspective={perspective}
          names={names}
          focus={f.focus}
          impact={f.impact}
          label={`${copy.headline} Frame ${frame + 1} of ${frames.length}: ${f.caption}`}
          compact={compact}
        />
        {poster && (
          <button type="button" className="replay-play" onClick={play}>
            <span aria-hidden="true">▶</span> Watch the {event.kind === 'capture' ? 'capture' : 'finish'}
          </button>
        )}
        {f.impact && <span className="impact-word" aria-hidden="true">{f.caption}</span>}
      </div>
      <figcaption className="replay-headline" aria-live="polite">
        {poster ? copy.headline : f.caption}
      </figcaption>
      {!poster && (
        <div className="replay-controls">
          {playing && !atEnd ? (
            <button type="button" className="btn btn-ghost btn-small" onClick={skip}>Skip</button>
          ) : (
            <button type="button" className="btn btn-ghost btn-small" onClick={play}>↻ Replay</button>
          )}
        </div>
      )}
      {!compact && <TokenLegend names={names} />}
    </figure>
  );
}
