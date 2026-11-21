import { useMemo, useState } from 'react';
import { PLAYERS } from '../../domain/players';
import { EVENING_SLOTS, formatTime, formatWindow, tomorrowWindow } from '../../domain/time';
import { ScoreLine, ScreenLayout } from '../components/Common';
import { Replay } from '../components/Replay';
import { inviteTitle } from '../copy';
import { useReducedMotion, useReplayLogger } from '../hooks';
import { useBadla } from '../store';

/** The invitee's view: same moment, their perspective, three plain choices. */
export function InviteScreen({ challengeId }: { challengeId: string }) {
  const { domain, ui, now, act, go } = useBadla();
  const reduced = useReducedMotion();
  const c = domain.challenges[challengeId];
  const onViewed = useReplayLogger(c?.originMatchId ?? '');
  const [step, setStep] = useState<'choose' | 'propose'>('choose');
  const viewer = ui.viewer;
  const me = PLAYERS[viewer];
  const challenger = c ? PLAYERS[c.challenger] : null;

  // Slots are fixed for this invitation so the selection is stable while the clock runs.
  const slots = useMemo(
    () => EVENING_SLOTS.map(([h, m]) => tomorrowWindow(c?.createdAt ?? now, me.timeZone, h, m)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [c?.createdAt, me.timeZone],
  );
  const [slot, setSlot] = useState(2); // 19:00 = "Tomorrow evening"

  if (!c || !challenger) return null;
  const origin = domain.matches[c.originMatchId];
  const isInvitee = c.invitee === viewer;

  if (!isInvitee || c.status !== 'pending') {
    return (
      <ScreenLayout
        label="Invitation"
        stage={<h1 className="result-title">This invitation is no longer open.</h1>}
        panel={<button type="button" className="btn btn-primary" onClick={() => go({ name: 'lobby' })}>Back to lobby</button>}
      />
    );
  }

  const chosen = slots[slot];
  const validSlot = chosen.start > now;

  return (
    <ScreenLayout
      label="Invitation"
      stage={
        <>
          <header className="result-head">
            <p className="eyebrow">Invitation · one match</p>
            <h1 className="result-title">{inviteTitle(c, viewer)}</h1>
            <ScoreLine domain={domain} />
          </header>
          {origin?.keyEvent && (
            <Replay
              event={origin.keyEvent}
              viewer={viewer}
              reducedMotion={reduced}
              onViewed={onViewed}
              label={origin.kind === 'original' ? `What ${challenger.name} wants back` : 'Last match'}
              compact
            />
          )}
        </>
      }
      panel={
        step === 'choose' ? (
          <div className="actions">
            <button type="button" className="btn btn-primary btn-big" onClick={() => act({ type: 'playNow', actor: viewer, challengeId: c.id })}>
              Play now
            </button>
            <p className="hint">Opens a table for 5 minutes and lets {challenger.name} know you're ready.</p>
            <button type="button" className="btn btn-secondary" onClick={() => setStep('propose')}>
              Tomorrow evening
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => act({ type: 'pass', actor: viewer, challengeId: c.id })}>
              Pass
            </button>
            <p className="hint small">Passing closes the invitation quietly. No reminder is sent.</p>
          </div>
        ) : (
          <div className="actions">
            <h2 className="panel-h">Pick a 30-minute window tomorrow</h2>
            <div className="slots" role="radiogroup" aria-label="Start time">
              {slots.map((w, i) => (
                <button
                  key={w.start}
                  type="button"
                  role="radio"
                  aria-checked={slot === i}
                  className={`slot${slot === i ? ' slot-on' : ''}`}
                  onClick={() => setSlot(i)}
                  disabled={w.start <= now}
                >
                  {formatTime(w.start, me.timeZone)}
                </button>
              ))}
            </div>
            <div className="time-block">
              <p className="time-main">
                {formatWindow(chosen, me.timeZone)} <span className="tz">{me.timeZoneLabel}</span>
              </p>
              <p className="time-sub">
                {challenger.name} sees {formatWindow(chosen, challenger.timeZone)} ({challenger.timeZoneLabel})
              </p>
            </div>
            <button
              type="button"
              className="btn btn-primary btn-big"
              disabled={!validSlot}
              onClick={() => act({ type: 'proposeTime', actor: viewer, challengeId: c.id, window: chosen })}
            >
              Suggest this time
            </button>
            <p className="hint small">{challenger.name} confirms or declines. Nothing is booked until then.</p>
            <button type="button" className="btn btn-ghost" onClick={() => setStep('choose')}>Back</button>
          </div>
        )
      }
    />
  );
}
