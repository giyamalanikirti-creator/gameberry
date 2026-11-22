import { useEffect, useId, useRef, type ReactNode } from 'react';
import { formatWindow } from '../domain/time';
import { Board } from '../ui/components/Board';
import type { BoardColor } from '../board/geometry';
import type { TimeWindow } from '../domain/types';
import type { Endgame } from './endgame';
import {
  balance, bonusEligible, entryFor, payoutFor, PLAYERS, receipt,
  scores, type Captain, type DemoState, type Format, type PlayerId, type TeamSeat,
} from './model';

export const signed = (gold: number) => gold > 0 ? `+${gold}` : gold < 0 ? `−${Math.abs(gold)}` : '0';
export const TIME_ZONE = 'Asia/Kolkata';
export const windowLabel = (window: TimeWindow) => `${formatWindow(window, TIME_ZONE)} IST`;

export function PlayerChip({ player, seat }: { player: PlayerId; seat?: Pick<TeamSeat, 'side' | 'player'> }) {
  const info = PLAYERS[player];
  const token = seat && seat.player !== seat.side ? PLAYERS[seat.side === 'riya' ? 'ananya' : 'shruti'] : info;
  return <span className="bd-player"><span className={`bd-avatar bd-${token.color}`} aria-hidden="true">{token.symbol}</span>{info.name}</span>;
}

export function Score({ state, opening = false }: { state: DemoState; opening?: boolean }) {
  const tally = opening ? { riya: 0, gunjan: 1 } : scores(state);
  return <div className="bd-score" aria-label={`Gunjan ${tally.gunjan}, Riya ${tally.riya}`}>
    <PlayerChip player="gunjan" />
    <strong>{tally.gunjan}<span>–</span>{tally.riya}</strong>
    <PlayerChip player="riya" />
  </div>;
}

export function Stakes({ format }: { format: Format }) {
  return <dl className="bd-stakes">
    <div><dt>Your entry</dt><dd>{entryFor(format)} gold</dd></div>
    <div><dt>Gross payout if you win</dt><dd>{payoutFor(format)} gold</dd></div>
    <div><dt>Net if you win</dt><dd className="bd-profit">+{payoutFor(format) - entryFor(format)} gold</dd></div>
  </dl>;
}

export function Bonus({ state, viewer, at, format, side }: { state: DemoState; viewer: PlayerId; at: number; format: Format; side: Captain }) {
  if (!(state.series?.bonus ?? state.demo.bonus)) return null;
  const tally = scores(state);
  if (tally.gunjan !== 1 || tally.riya !== 0) return null;
  const share = format === 'singles' ? 100 : 50;
  if (side !== 'gunjan') return <p className="bd-note">Sweep bonus · Only Gunjan’s side can earn the 2–0 bonus.</p>;
  return <p className="bd-note">Sweep bonus · {bonusEligible(state, viewer, at) ? `${share} extra gold if you win with Gunjan 2–0` : 'Your UTC-day share has already been paid'}. Paid separately from the pot.</p>;
}

export function GoldReceipt({ state, viewer, roundId }: { state: DemoState; viewer: PlayerId; roundId: string }) {
  const row = receipt(state, viewer, roundId);
  return <section className="bd-panel" aria-label={`${PLAYERS[viewer].name}'s gold receipt`}>
    <h2>Your gold receipt</h2>
    <dl className="bd-receipt">
      <div><dt>Entry</dt><dd>{signed(-row.entry)}</dd></div>
      <div><dt>Pot payout</dt><dd>{signed(row.pot)}</dd></div>
      {row.refund > 0 && <div><dt>Refund</dt><dd>{signed(row.refund)}</dd></div>}
      {(row.bonus > 0 || state.series?.bonus) && <div><dt>Sweep bonus</dt><dd>{signed(row.bonus)}</dd></div>}
      <div><dt>Net change</dt><dd className={row.net > 0 ? 'bd-profit' : ''}>{signed(row.net)} gold</dd></div>
      <div><dt>Current balance</dt><dd>{balance(state, viewer).toLocaleString('en-IN')} gold</dd></div>
    </dl>
  </section>;
}

export function BoardView({ game, viewer, move, animate }: { game: Endgame; viewer: PlayerId; move?: () => void; animate: boolean }) {
  const tokens: Partial<Record<BoardColor, number[]>> = {};
  const names: Partial<Record<BoardColor, string>> = {};
  game.pawns.forEach((pawn, i) => {
    const color = (['red', 'yellow', 'green', 'blue'] as const)[i];
    tokens[color] = [pawn.position];
    names[color] = PLAYERS[pawn.player].name;
  });
  const colors = ['red', 'yellow', 'green', 'blue'] as const;
  const color = colors[game.turn];
  return <Board tokens={tokens} names={names} animate={animate} perspective={viewer === 'gunjan' ? 'yellow' : 'red'}
    label="Quick endgame Ludo board"
    focus={[{ color, tokenIndex: 0 }]}
    movable={move && game.die !== null ? { color, steps: game.die, tokens: [0], onMove: move } : null} />;
}

export function Modal({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    dialog.showModal();
    return () => dialog.close();
  }, []);
  return <dialog className="bd-drawer" ref={ref} aria-labelledby={titleId} onCancel={event => { event.preventDefault(); onClose(); }}
    onClick={event => { if (event.target === event.currentTarget) onClose(); }}>
    <div className="bd-drawer-body">
      <header><h2 id={titleId}>{title}</h2><button className="bd-small" onClick={onClose} aria-label="Close demo controls">✕</button></header>
      {children}
    </div>
  </dialog>;
}
