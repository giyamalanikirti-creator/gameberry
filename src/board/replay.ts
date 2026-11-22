/**
 * Historical move events and their playback frames. A replay is computed from
 * a stored snapshot and never touches the live game or the head-to-head record.
 */
import { Capture, Tokens, cloneTokens } from './engine';
import { Color, YARD } from './geometry';

export type PlayerRef = 'kirti' | 'ahmed';

export interface ReplayEvent<Actor extends string = PlayerRef> {
  id: string;
  matchId: string;
  kind: 'capture' | 'finish';
  actor: Actor;
  color: Color;
  tokenIndex: number;
  roll: number;
  before: Tokens;
  /** Route positions of the moving token, one per step. */
  path: number[];
  capture: (Capture & { player: Actor; to: typeof YARD }) | null;
  after: Tokens;
}

/**
 * Yesterday's capture. Kirti (red) had three tokens home and her last token on
 * route square 50, the last shared-track square before her protected lane.
 * Ahmed (yellow) rolled a 3 from square 21 and landed on it from behind.
 * The engine test replays this through `applyMove` and checks every field.
 */
export const ORIGINAL_CAPTURE: ReplayEvent = {
  id: 'evt-original-capture',
  matchId: 'm-original',
  kind: 'capture',
  actor: 'ahmed',
  color: 'yellow',
  tokenIndex: 3,
  roll: 3,
  before: { red: [56, 56, 56, 50], yellow: [56, 56, 53, 21] },
  path: [22, 23, 24],
  capture: { player: 'kirti', color: 'red', tokenIndex: 3, from: 50, to: YARD },
  after: { red: [56, 56, 56, -1], yellow: [56, 56, 53, 24] },
};

export interface ReplayFrame {
  tokens: Tokens;
  /** Tokens to ring, e.g. the victim before the capture. */
  focus: Array<{ color: Color; tokenIndex: number }>;
  /** Board position to flash on impact. */
  impact: { color: Color; pos: number } | null;
  caption: string;
  durationMs: number;
}

export interface FrameCopy {
  intro: string;
  step: (n: number, total: number) => string;
  impact: string;
  outro: string;
}

/** Roughly three seconds: focus, three steps, impact, send-home, final frame. */
export function buildFrames<Actor extends string>(event: ReplayEvent<Actor>, copy: FrameCopy): ReplayFrame[] {
  const frames: ReplayFrame[] = [];
  const focusTarget = event.capture
    ? { color: event.capture.color, tokenIndex: event.capture.tokenIndex }
    : { color: event.color, tokenIndex: event.tokenIndex };

  frames.push({ tokens: cloneTokens(event.before), focus: [focusTarget], impact: null, caption: copy.intro, durationMs: 800 });

  event.path.forEach((pos, i) => {
    const t = cloneTokens(event.before);
    t[event.color][event.tokenIndex] = pos;
    const last = i === event.path.length - 1;
    frames.push({
      tokens: t,
      focus: [{ color: event.color, tokenIndex: event.tokenIndex }],
      impact: last && event.capture ? { color: event.color, pos } : null,
      caption: last && event.capture ? copy.impact : copy.step(i + 1, event.path.length),
      durationMs: last && event.capture ? 650 : 450,
    });
  });

  frames.push({
    tokens: cloneTokens(event.after),
    focus: event.capture ? [{ color: event.capture.color, tokenIndex: event.capture.tokenIndex }] : [{ color: event.color, tokenIndex: event.tokenIndex }],
    impact: null,
    caption: copy.outro,
    durationMs: 700, // token returns to the yard, then the final frame holds
  });
  return frames;
}

export function totalDuration(frames: ReplayFrame[]): number {
  return frames.reduce((sum, f) => sum + f.durationMs, 0);
}
