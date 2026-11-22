/**
 * The opening capture, stored as an immutable snapshot. The replay reads it and
 * never touches live state.
 */
import { Capture, Tokens, cloneTokens } from './rules';
import type { Color } from './board';

export interface ReplayEvent {
  id: string;
  actorId: string;
  color: Color;
  tokenIndex: number;
  roll: number;
  before: Tokens;
  path: number[];
  capture: (Capture & { playerId: string }) | null;
  after: Tokens;
}

/**
 * Riya (red) had three tokens home and her last token on route square 50, the
 * last shared square before her protected lane. Gunjan (teal) rolled a 3 from
 * square 34 and landed on it from behind. Verified through applyMove in tests.
 */
export const OPENING_CAPTURE: ReplayEvent = {
  id: 'evt-opening-capture',
  actorId: 'gunjan',
  color: 'teal',
  tokenIndex: 3,
  roll: 3,
  before: { red: [56, 56, 56, 50], teal: [56, 56, 53, 34] },
  path: [35, 36, 37],
  capture: { playerId: 'riya', color: 'red', tokenIndex: 3, from: 50 },
  after: { red: [56, 56, 56, -1], teal: [56, 56, 53, 37] },
};

export interface ReplayFrame {
  tokens: Tokens;
  focus: Array<{ color: Color; tokenIndex: number }>;
  impact: { color: Color; pos: number } | null;
  caption: string;
  durationMs: number;
}

/** Played at half speed: focus, three steps, capture arc, back to the yard. */
export function buildFrames(e: ReplayEvent, copy: { intro: string; step: (n: number) => string; impact: string; outro: string }): ReplayFrame[] {
  const frames: ReplayFrame[] = [];
  const victim = e.capture ? { color: e.capture.color, tokenIndex: e.capture.tokenIndex } : { color: e.color, tokenIndex: e.tokenIndex };
  frames.push({ tokens: cloneTokens(e.before), focus: [victim], impact: null, caption: copy.intro, durationMs: 900 });
  e.path.forEach((pos, i) => {
    const t = cloneTokens(e.before);
    t[e.color]![e.tokenIndex] = pos;
    const last = i === e.path.length - 1;
    frames.push({
      tokens: t,
      focus: [{ color: e.color, tokenIndex: e.tokenIndex }],
      impact: last && e.capture ? { color: e.color, pos } : null,
      caption: last && e.capture ? copy.impact : copy.step(i + 1),
      durationMs: last && e.capture ? 1000 : 240,
    });
  });
  frames.push({ tokens: cloneTokens(e.after), focus: [victim], impact: null, caption: copy.outro, durationMs: 0 });
  return frames;
}
