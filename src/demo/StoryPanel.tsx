import { useEffect, useState } from 'react';
import { AnalyticsPanel } from '../analytics/Panel';
import type { Variant } from '../domain/types';
import { liveSeats } from '../state/selectors';
import { createFreshState } from '../state/seed';
import { useStore } from '../state/store';
import { Avatar } from '../ui/kit';
import { useShell } from '../ui/shell';
import { AFTER_PUBLIC_MATCH, applyGuided } from './guided';
import { CHAPTERS, flowsSeen, storyMetrics, storyStep } from './storyline';

const VARIANTS: Array<[Variant, string]> = [['A', 'A · Current'], ['B', 'B · Instant rematch'], ['C', 'C · Full Badla'], ['D', 'D · Badla + Smart Fixture']];

export function StoryPanel({ onTimeJump }: { onTimeJump: (label: string, to: number) => void }) {
  const { state, me, now, ui, setUi, go, restart, replaceState } = useStore();
  const { handoff, showLock, setHighlight } = useShell();
  const [tab, setTab] = useState<'story' | 'model'>('story');
  const [collapsed, setCollapsed] = useState(() => typeof window !== 'undefined' && window.innerWidth < 900);
  const step = storyStep(state, now);
  const guided = ui.mode === 'guided';
  const seen = flowsSeen(state);
  const live = Object.values(state.rounds).find((r) => r.status === 'checkin' && r.window);

  // In guided mode the button the player should tap pulses on their own phone.
  useEffect(() => {
    setHighlight(guided && step.who === me && step.target ? step.target : null);
  }, [guided, step.who, step.target, me, setHighlight]);

  const next = () => {
    if (step.kind === 'time' && step.timeTo) return onTimeJump(step.timeLabel ?? 'Later', step.timeTo);
    if (step.kind === 'wait') return;
    if (step.who && step.who !== me) {
      if (step.kind === 'lock') return showLock(step.who);
      return handoff(step.who, step.route ?? null);
    }
    if (step.route) go(step.route);
    if (step.target) setHighlight(step.target);
  };

  const setVariant = (v: Variant) => {
    const base = createFreshState();
    base.settings.variant = v;
    const { state: s, at } = applyGuided(base, AFTER_PUBLIC_MATCH, 'demo');
    replaceState(s, at);
    if (me === 'riya') go({ name: 'opening' });
    else handoff('riya', { name: 'opening' });
  };

  const nextLabel = step.kind === 'time' ? `${step.timeLabel} ›`
    : step.kind === 'wait' ? 'Waiting…'
      : step.who && step.who !== me ? (step.kind === 'lock' ? `Show ${state.players[step.who].name}'s phone` : `Hand the phone to ${state.players[step.who].name}`)
        : 'Next: show me';

  return (
    <aside className={`story${collapsed ? ' collapsed' : ''}`} aria-label="Story panel">
      <div className="story-head">
        <div className="seg seg-sm" role="group" aria-label="Mode">
          <button type="button" aria-pressed={guided} onClick={() => setUi({ mode: 'guided' })}>Guided</button>
          <button type="button" aria-pressed={!guided} onClick={() => setUi({ mode: 'free' })}>Free</button>
        </div>
        <div className="seg seg-sm" role="tablist" aria-label="Panel">
          <button type="button" role="tab" aria-selected={tab === 'story'} aria-pressed={tab === 'story'} onClick={() => setTab('story')}>Story</button>
          <button type="button" role="tab" aria-selected={tab === 'model'} aria-pressed={tab === 'model'} onClick={() => setTab('model')}>Model</button>
        </div>
        <button type="button" className="story-toggle" aria-expanded={!collapsed} onClick={() => setCollapsed((c) => !c)}>{collapsed ? 'Show' : 'Hide'}</button>
      </div>

      {tab === 'model' ? <AnalyticsPanel /> : (
        <div className="story-body">
          <ol className="chapters" aria-label="Chapters">
            {CHAPTERS.map((c, i) => (
              <li key={c} className={`${i + 1 === step.chapter ? 'now' : ''}${(guided ? i + 1 < step.chapter : seen[i]) ? ' done' : ''}`}>
                <span className="ch-n">{(guided ? i + 1 < step.chapter : seen[i]) ? '✓' : i + 1}</span> {c}
              </li>
            ))}
          </ol>

          {guided ? (
            <section className="step-card" aria-live="polite">
              <div className="you-are">
                {me ? <><Avatar state={state} id={me} size={22} /> You are {state.players[me].name}</> : 'Signed out'}
                {step.who && step.who !== me && <span className="next-phone"> · next: {state.players[step.who].name}'s phone</span>}
              </div>
              <p className="step-text">{step.text}</p>
              <button type="button" className="btn btn-ember story-next" onClick={next} disabled={step.kind === 'wait'}>{nextLabel}</button>
              <div className="why"><strong>Why it matters</strong><p>{step.why}</p></div>
            </section>
          ) : (
            <section className="step-card">
              <p className="small">Free mode: no forced steps. Switch players in the account pane (top right). Here is what you have seen:</p>
              <ul className="checklist">{CHAPTERS.map((c, i) => <li key={c} className={seen[i] ? 'ok' : 'muted'}>{seen[i] ? '✓' : '○'} {c}</li>)}</ul>
              <div className="why"><strong>Right now</strong><p>{step.text}</p></div>
            </section>
          )}

          {live && (
            <button type="button" className="btn btn-quiet" onClick={() => onTimeJump('Window closes', live.window!.end)}>
              Let the window close (no-show path · {liveSeats(state, live).filter((x) => x.status === 'ready').length} ready)
            </button>
          )}

          <ul className="metrics" aria-label="Story metrics">
            {storyMetrics(state).map((m) => <li key={m.label}><strong className="num">{m.value}</strong><span>{m.label}</span></li>)}
          </ul>

          <fieldset className="variants">
            <legend>Experiment arm</legend>
            <div className="seg seg-sm seg-wrap">
              {VARIANTS.map(([v, label]) => (
                <button key={v} type="button" aria-pressed={state.settings.variant === v} onClick={() => setVariant(v)}>{label}</button>
              ))}
            </div>
            <p className="fine">Switching arm resets to the match result and changes only the post-match options.</p>
          </fieldset>
          <div className="row">
            <button type="button" className="btn btn-quiet" onClick={() => restart()}>Reset</button>
            <button type="button" className="btn btn-quiet story-demo" onClick={() => window.dispatchEvent(new Event('open-demo-drawer'))}>Demo controls</button>
          </div>
        </div>
      )}
    </aside>
  );
}
