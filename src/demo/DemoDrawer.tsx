import { useEffect, useRef, useState } from 'react';
import { FIXTURES, FIXTURE_NAMES } from '../engine/fixtures';
import { HOUR, MINUTE } from '../domain/time';
import type { NextFixture } from '../domain/types';
import { storageIsMemoryOnly } from '../state/persistence';
import { createSeedState, PLAYER_IDS } from '../state/seed';
import { balance, goldInPlay, totalGold } from '../state/selectors';
import { useStore } from '../state/store';
import { nextWindowStart, tomorrowsSlot } from './clock';
import { SCENES, applyStory, T0 } from './story';

/** The reviewer's cheat drawer. It never signs anyone in, never awards gold, never sets an outcome. */
export function DemoDrawer() {
  const { state, now, clockOffset, setClockOffset, demo, replaceState, reset } = useStore();
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const panel = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    panel.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => { window.removeEventListener('keydown', onKey); trigger.current?.focus(); };
  }, [open]);

  const jump = (to: number | null, label: string) => {
    if (to === null) return setNote(`Nothing to jump to for “${label}”.`);
    setClockOffset(clockOffset + (to - now));
    demo({ type: 'DEMO_NOTE', name: 'demo_clock_jump', detail: { to: label } });
    setNote(null);
  };
  const advance = (ms: number, label: string) => {
    setClockOffset(clockOffset + ms);
    demo({ type: 'DEMO_NOTE', name: 'demo_clock_advance', detail: { by: label } });
  };
  const seriesStarted = Object.keys(state.series).length > 0;
  const live = Object.values(state.rounds).some((r) => r.status === 'active');

  return (
    <>
      <button ref={trigger} type="button" className="drawer-btn" aria-expanded={open} aria-label="Demo controls" onClick={() => setOpen((o) => !o)}>
        Demo<span className="long"> controls</span>
      </button>
      {open && (
        <div className="drawer" role="dialog" aria-label="Demo controls" tabIndex={-1} ref={panel}>
          <div className="drawer-head">
            <strong>Demo controls</strong>
            <span className="fine">Reviewer tools · not part of the product</span>
            <button type="button" className="x" aria-label="Close demo controls" onClick={() => setOpen(false)}>✕</button>
          </div>
          {storageIsMemoryOnly() && <p className="fine">Storage is blocked here; the demo is running in memory only.</p>}

          <fieldset>
            <legend>Time</legend>
            <div className="row">
              <button type="button" onClick={() => advance(15 * MINUTE, '15m')}>+15 min</button>
              <button type="button" onClick={() => advance(HOUR, '1h')}>+1 hour</button>
              <button type="button" onClick={() => jump(nextWindowStart(state, now), 'window open')}>Jump to window open</button>
              <button type="button" onClick={() => jump(tomorrowsSlot(state, now), "tomorrow's slot")}>Jump to tomorrow's slot</button>
              <button type="button" onClick={() => { setClockOffset(0); demo({ type: 'DEMO_NOTE', name: 'demo_clock_real' }); }}>Reset to real time</button>
            </div>
            <p className="fine">Time can open and close windows, expire invites, lock predictions and fire reminders. It cannot settle a game or move gold.</p>
          </fieldset>

          <fieldset disabled={live}>
            <legend>Dice and fixtures {live ? '· locked while a match is live' : ''}</legend>
            <label className="field">
              Next round
              <select value={state.settings.nextFixture} onChange={(e) => demo({ type: 'DEMO_SETTINGS', patch: { nextFixture: e.target.value as NextFixture } })}>
                <option value="guided">Guided story (comeback, then decider)</option>
                {FIXTURE_NAMES.map((n) => <option key={n} value={n}>{n} · {FIXTURES[n].label}</option>)}
                <option value="random">Random dice</option>
              </select>
            </label>
          </fieldset>
          <label className="check">
            <input type="checkbox" checked={state.settings.autoPlay} onChange={(e) => demo({ type: 'DEMO_SETTINGS', patch: { autoPlay: e.target.checked } })} />
            Auto-play other seats after a human starts the match
          </label>

          <fieldset>
            <legend>Economy</legend>
            <label className="check">
              <input type="checkbox" checked={state.settings.sweepBonus} disabled={seriesStarted}
                onChange={(e) => demo({ type: 'DEMO_SETTINGS', patch: { sweepBonus: e.target.checked } })} />
              Sweep bonus (100 gold on a 2-0) {seriesStarted ? '· locked once a series begins' : '· off by default'}
            </label>
            <table className="ledger">
              <tbody>
                {PLAYER_IDS.map((p) => <tr key={p}><th scope="row">{state.players[p].name}</th><td className="num">{balance(state, p).toLocaleString('en-IN')}</td></tr>)}
                <tr><th scope="row">In play (pot)</th><td className="num">{goldInPlay(state).toLocaleString('en-IN')}</td></tr>
                <tr className="total"><th scope="row">Total</th><td className="num">{(totalGold(state) + goldInPlay(state)).toLocaleString('en-IN')}</td></tr>
              </tbody>
            </table>
          </fieldset>

          <fieldset>
            <legend>Consent shortcut</legend>
            <button type="button" onClick={() => { const r = demo({ type: 'DEMO_AUTO_CONFIRM' }); setNote(r.state === state ? 'Nothing left to confirm.' : 'Filled the outstanding confirmations (source: demo).'); }}>
              Auto-confirm remaining players
            </button>
            <p className="fine">Writes source "demo" on every record it creates. Excluded from the analytics panel.</p>
          </fieldset>

          <fieldset>
            <legend>State</legend>
            <label className="field">
              Jump to scene
              <select defaultValue="" onChange={(e) => {
                const sc = SCENES.find((x) => x.id === e.target.value);
                if (!sc) return;
                const { state: s, at } = applyStory(createSeedState(), sc.after, 'demo');
                replaceState(s, Math.max(sc.clock ?? 0, sc.after ? at : T0));
                setNote(`${sc.title}. Sign in as ${s.players[sc.who].name} in the account pane to see it.`);
                e.target.value = '';
              }}>
                <option value="" disabled>Choose a screen…</option>
                {SCENES.map((s) => <option key={s.id} value={s.id}>{s.title}</option>)}
              </select>
            </label>
            <button type="button" className="danger" onClick={() => { reset(); setNote('Back to the seeded start. Sessions locked.'); }}>Reset demo</button>
          </fieldset>
          {note && <p className="drawer-note" role="status">{note}</p>}
        </div>
      )}
    </>
  );
}
