/**
 * Riya's public Quick match, scripted so the capture happens the same way
 * every time. Every move goes through applyMove, so the board, the capture and
 * the finish are produced by the rules, not drawn.
 *
 * Riya (red) has three tokens home and one on square 47. Gunjan (teal) has two
 * home, one on 53 and one on 34. Riya rolls 3 to square 50, one square from her
 * protected lane; Gunjan rolls 3 from 34 and sends her home. That position is
 * exactly OPENING_CAPTURE.before. Riya then needs a six to leave the yard and
 * never gets one, while Gunjan brings both tokens home.
 */
import { applyMove, destinationFor, Tokens } from './rules';

export type PublicSide = 'riya' | 'gunjan';

export const PUBLIC_START: Tokens = { red: [56, 56, 56, 47], teal: [56, 56, 53, 34] };

/** One entry per turn: whose turn, the roll, and (for Gunjan) which token moves. */
export const PUBLIC_SCRIPT: Array<{ who: PublicSide; roll: number; token?: number }> = [
  { who: 'riya', roll: 3 },
  { who: 'gunjan', roll: 3, token: 3 }, // the capture
  { who: 'riya', roll: 2 },
  { who: 'gunjan', roll: 3, token: 2 },
  { who: 'riya', roll: 4 },
  { who: 'gunjan', roll: 6, token: 3 },
  { who: 'riya', roll: 1 },
  { who: 'gunjan', roll: 6, token: 3 },
  { who: 'riya', roll: 5 },
  { who: 'gunjan', roll: 6, token: 3 },
  { who: 'riya', roll: 3 },
  { who: 'gunjan', roll: 1, token: 3 },
];

export const CHAT_LINE = '😂 so close';

const colorOf = (who: PublicSide) => (who === 'riya' ? 'red' : 'teal');

export function legalFor(tokens: Tokens, who: PublicSide, roll: number): number[] {
  return (tokens[colorOf(who)] ?? []).flatMap((p, i) => (destinationFor(p, roll) === null ? [] : [i]));
}

export interface PublicStep {
  tokens: Tokens;
  moved: boolean;
  captured: boolean;
  finished: boolean;
  text: string;
}

/** Apply script step `index` with its roll. Returns null if the step cannot apply. */
export function applyPublicStep(tokens: Tokens, index: number): PublicStep | null {
  const step = PUBLIC_SCRIPT[index];
  if (!step) return null;
  const color = colorOf(step.who);
  const legal = legalFor(tokens, step.who, step.roll);
  const name = step.who === 'riya' ? 'Riya' : 'Gunjan';
  if (legal.length === 0) {
    return { tokens, moved: false, captured: false, finished: false, text: `${name} rolled ${step.roll} and needs a six to leave the yard.` };
  }
  const token = step.token ?? legal[0];
  const out = applyMove(tokens, color, token, step.roll);
  if (!out) return null;
  const finished = (out.tokens[color] ?? []).every((p) => p === 56);
  return {
    tokens: out.tokens,
    moved: true,
    captured: !!out.capture,
    finished,
    text: out.capture ? `${name} rolled ${step.roll} and sent Riya home!` : finished ? `${name} brings the last token home.` : `${name} rolled ${step.roll}.`,
  };
}
