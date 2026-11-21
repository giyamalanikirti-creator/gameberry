import { useEffect, useRef, useState } from 'react';
import { activePlayerDays } from '../../domain/analytics';
import { PLAYERS } from '../../domain/players';
import { activeChallenge, unreadNotifications } from '../../domain/selectors';
import { DAY, HOUR, MINUTE, formatDateTime } from '../../domain/time';
import type { Notification, PlayerId } from '../../domain/types';
import { screenForNotification } from '../navigation';
import { useBadla } from '../store';

export function useOpenNotification() {
  const { ui, act, go, showToast, peek } = useBadla();
  return (n: Notification) => {
    act({ type: 'openNotification', actor: ui.viewer, notificationId: n.id });
    const latest = peek(); // rechecks state after the open was committed
    const { screen, stale } = screenForNotification(latest.domain, n, latest.now);
    go(screen);
    if (stale) showToast('That table has closed. Here is the current status.');
  };
}

export function Inbox({ onOpened }: { onOpened?: () => void }) {
  const { domain, ui, now } = useBadla();
  const open = useOpenNotification();
  const list = domain.notifications.filter((n) => n.to === ui.viewer).slice().reverse();
  const tz = PLAYERS[ui.viewer].timeZone;
  return (
    <div className="inbox">
      <p className="hint small">Simulated notifications for {PLAYERS[ui.viewer].name}. No device permission needed.</p>
      {list.length === 0 && <p className="hint">No notifications.</p>}
      <ul>
        {list.map((n) => {
          const c = domain.challenges[n.challengeId];
          const live = c && (c.status === 'waiting' || c.status === 'scheduled') && c.window && now < c.window.end;
          return (
            <li key={n.id}>
              <button type="button" className={`inbox-item${n.readAt ? '' : ' inbox-unread'}`} onClick={() => { open(n); onOpened?.(); }}>
                <strong>{n.title}</strong>
                <small>{formatDateTime(n.createdAt, tz)} · {live ? 'table open' : c?.status === 'playing' ? 'match started' : 'closed'}</small>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function Segmented<T extends string>({ label, value, options, onChange, disabled }: {
  label: string;
  value: T;
  options: Array<[T, string]>;
  onChange: (v: T) => void;
  disabled?: boolean;
}) {
  return (
    <fieldset className="segmented" disabled={disabled}>
      <legend>{label}</legend>
      <div>
        {options.map(([v, text]) => (
          <button key={v} type="button" aria-pressed={value === v} className={value === v ? 'seg-on' : ''} onClick={() => onChange(v)}>
            {text}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

export function DemoControls({ open, onClose, initialTab }: { open: boolean; onClose: () => void; initialTab?: 'controls' | 'inbox' }) {
  const b = useBadla();
  const { domain, ui, now, switchViewer, advanceClock, setUi, act, reset } = b;
  const [tab, setTab] = useState<'controls' | 'inbox' | 'log'>(initialTab ?? 'controls');
  const [confirmReset, setConfirmReset] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (open) {
      setTab(initialTab ?? 'controls');
      panelRef.current?.focus();
    }
  }, [open, initialTab]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const c = activeChallenge(domain);
  const agreed = c && c.window && (c.status === 'scheduled' || c.status === 'waiting') && now < c.window.start ? c.window.start : null;
  const playing = Object.values(domain.matches).some((m) => m.status === 'playing');
  const unread = (p: PlayerId) => unreadNotifications(domain, p).length;

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div
        className="sheet"
        role="dialog"
        aria-modal="true"
        aria-label="Demo controls"
        tabIndex={-1}
        ref={panelRef}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sheet-head">
          <div>
            <p className="eyebrow">Playable concept · not the live game</p>
            <h2>Demo controls</h2>
          </div>
          <button type="button" className="btn btn-ghost btn-small" onClick={onClose} aria-label="Close demo controls">✕</button>
        </div>

        <div className="tabs" role="tablist">
          {(['controls', 'inbox', 'log'] as const).map((t) => (
            <button key={t} role="tab" type="button" aria-selected={tab === t} className={tab === t ? 'tab-on' : ''} onClick={() => setTab(t)}>
              {t === 'controls' ? 'Controls' : t === 'inbox' ? `Notification inbox${unread(ui.viewer) ? ` (${unread(ui.viewer)})` : ''}` : 'Event log'}
            </button>
          ))}
        </div>

        {tab === 'controls' && (
          <div className="sheet-body">
            <Segmented<PlayerId>
              label="View as"
              value={ui.viewer}
              options={[['kirti', `Kirti${unread('kirti') ? ` • ${unread('kirti')}` : ''}`], ['ahmed', `Ahmed${unread('ahmed') ? ` • ${unread('ahmed')}` : ''}`]]}
              onChange={(p) => switchViewer(p)}
            />
            <Segmented<'guided' | 'manual'>
              label="Opponent response"
              value={ui.guided ? 'guided' : 'manual'}
              options={[['guided', 'Guided'], ['manual', 'Manual']]}
              onChange={(v) => {
                setUi({ guided: v === 'guided' });
                act({ type: 'demoNote', name: 'demo_mode_changed', detail: { mode: v } });
              }}
            />
            <p className="hint small">Guided offers a handoff when it is the other player's move. You still tap every choice.</p>

            <fieldset className="clock">
              <legend>Clock</legend>
              <p className="clock-now">
                <span>{formatDateTime(now, 'UTC')} UTC</span>
                <span>Kirti {formatDateTime(now, PLAYERS.kirti.timeZone)} · Ahmed {formatDateTime(now, PLAYERS.ahmed.timeZone)}</span>
              </p>
              <div className="btn-row">
                <button type="button" className="btn btn-primary btn-small" disabled={!agreed} onClick={() => agreed && advanceClock(agreed - now, 'agreed_time')}>
                  Advance to agreed time
                </button>
                <button type="button" className="btn btn-secondary btn-small" onClick={() => advanceClock(5 * MINUTE, '5m')}>+5 min</button>
                <button type="button" className="btn btn-secondary btn-small" onClick={() => advanceClock(HOUR, '1h')}>+1 h</button>
                <button type="button" className="btn btn-secondary btn-small" onClick={() => advanceClock(DAY, '1d')}>+1 day</button>
              </div>
            </fieldset>

            <Segmented<'guided' | 'fresh'>
              label="Dice for the next match"
              value={domain.nextDice.mode}
              disabled={playing}
              options={[['guided', 'Guided seed (2, 3, 2)'], ['fresh', 'Fresh dice']]}
              onChange={(mode) => act({ type: 'setDiceMode', mode, seed: mode === 'fresh' ? Math.floor(Math.random() * 2 ** 31) : 1 })}
            />
            {playing && <p className="hint small">Dice are fixed once a match starts.</p>}

            <Segmented<'system' | 'reduced' | 'full'>
              label="Motion"
              value={ui.reducedMotion === null ? 'system' : ui.reducedMotion ? 'reduced' : 'full'}
              options={[['system', 'System'], ['reduced', 'Reduced'], ['full', 'Full']]}
              onChange={(v) => setUi({ reducedMotion: v === 'system' ? null : v === 'reduced' })}
            />

            <div className="reset">
              {confirmReset ? (
                <span className="confirm-row">
                  <span className="hint">Start again from the original result?</span>
                  <button type="button" className="btn btn-danger btn-small" onClick={() => { reset(); setConfirmReset(false); onClose(); }}>Reset</button>
                  <button type="button" className="btn btn-ghost btn-small" onClick={() => setConfirmReset(false)}>Cancel</button>
                </span>
              ) : (
                <button type="button" className="btn btn-ghost" onClick={() => setConfirmReset(true)}>Reset demo</button>
              )}
            </div>
          </div>
        )}

        {tab === 'inbox' && (
          <div className="sheet-body">
            <Inbox onOpened={onClose} />
          </div>
        )}

        {tab === 'log' && (
          <div className="sheet-body">
            <p className="hint small">
              Analytics adapter output (demo only, never shown to players). Dates are UTC. Active player-days: {activePlayerDays(domain.analytics).join(', ') || 'none'}.
            </p>
            <ol className="log">
              {domain.analytics.slice().reverse().slice(0, 80).map((e) => (
                <li key={e.id} className={`log-${e.source}`}>
                  <code>{e.date} {new Date(e.at).toISOString().slice(11, 16)}</code> <strong>{e.name}</strong> <span>{e.actor} · {e.source}</span>
                  {e.challengeId && <span> · {e.challengeId}</span>}
                  {e.matchId && <span> · {e.matchId}</span>}
                  {e.detail && <span className="log-detail"> {JSON.stringify(e.detail)}</span>}
                </li>
              ))}
            </ol>
          </div>
        )}
      </div>
    </div>
  );
}
