import { ReactNode } from 'react';
import { PLAYERS, SCORE_ORDER } from '../../domain/players';
import { pairRecord } from '../../domain/selectors';
import type { DomainState, PlayerId } from '../../domain/types';

export function Avatar({ player, size = 'md', ready }: { player: PlayerId; size?: 'sm' | 'md' | 'lg'; ready?: boolean }) {
  const p = PLAYERS[player];
  return (
    <span className={`avatar avatar-${p.color} avatar-${size}${ready ? ' avatar-ready' : ''}`} aria-hidden="true">
      <span className={`avatar-shape avatar-shape-${p.shape}`} />
      <span className="avatar-initial">{p.initial}</span>
    </span>
  );
}

/** Pair score with names in SCORE_ORDER, identical in both perspectives. */
export function ScoreLine({ domain, big }: { domain: DomainState; big?: boolean }) {
  const s = pairRecord(domain);
  const text = SCORE_ORDER.map((id) => `${PLAYERS[id].name} ${s[id]}`).join(' · ');
  return (
    <p className={`score${big ? ' score-big' : ''}`} aria-label={`Head to head: ${text}`}>
      {SCORE_ORDER.map((id, i) => (
        <span key={id} className="score-item">
          {i > 0 && <span className="score-sep" aria-hidden="true">·</span>}
          <Avatar player={id} size="sm" />
          <span>{PLAYERS[id].name}</span>
          <strong>{s[id]}</strong>
        </span>
      ))}
    </p>
  );
}

export function ScreenLayout({ stage, panel, label }: { stage: ReactNode; panel: ReactNode; label: string }) {
  return (
    <main className="screen" aria-label={label}>
      <section className="stage">{stage}</section>
      <aside className="panel">{panel}</aside>
    </main>
  );
}

export function StatusChip({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'neutral' | 'warm' | 'go' | 'muted' }) {
  return <span className={`chip chip-${tone}`}>{children}</span>;
}
