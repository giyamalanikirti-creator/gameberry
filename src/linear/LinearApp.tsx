import { useEffect, useMemo, useRef, useState } from 'react';
import { applyGuided, round2Slot } from '../demo/guided';
import { formatClock, formatSlot, formatTime } from '../domain/time';
import type { PlayerId, State } from '../domain/types';
import type { Color } from '../engine/board';
import { gameTokens } from '../engine/rules';
import { CHAT_LINE } from '../engine/publicMatch';
import { inviteLine, smartTimeLabel } from '../smart/smartFixture';
import { createFreshState } from '../state/seed';
import { balance, liveSeats, seriesScore } from '../state/selectors';
import { Board, TokenMeta } from '../ui/Board';
import { Avatar, Gold } from '../ui/kit';
import { useReducedMotion } from '../ui/motion';
import { STEPS, Step } from './steps';

const KEY = 'badla.linear.v1';
const TZ = 'Asia/Kolkata';

function loadStep(): number {
  try {
    const v = Number(localStorage.getItem(KEY));
    return Number.isInteger(v) && v >= 0 && v < STEPS.length ? v : 0;
  } catch {
    return 0;
  }
}

/** Game state after `n` scripted story actions, computed by the tested engine. */
function useStory(n: number) {
  return useMemo(() => applyGuided(createFreshState(), n, 'product'), [n]);
}

const latestRound = (s: State) => Object.values(s.rounds).filter((r) => r.seriesId && r.id !== s.opening.roundId).pop() ?? null;

function metaFor(s: State, colors: Color[]): Partial<Record<Color, TokenMeta>> {
  const m: Partial<Record<Color, TokenMeta>> = {};
  for (const p of Object.values(s.players)) if (p.color && colors.includes(p.color)) m[p.color] = { name: p.name, shape: p.shape! };
  return m;
}

function Score({ s }: { s: State }) {
  const id = Object.keys(s.series)[0];
  if (!id) return null;
  const sc = seriesScore(s, id);
  return (
    <p className="lin-score">
      <Avatar state={s} id="riya" size={24} /> Riya <strong className="num">{sc.A}</strong>
      <span className="muted"> – </span>
      <strong className="num">{sc.B}</strong> Gunjan <Avatar state={s} id="gunjan" size={24} />
    </p>
  );
}

/** What the phone shows for each step. Every screen is read-only except its one button. */
function Screen({ step, s, clock, onCta }: { step: Step; s: State; clock: number; onCta: () => void }) {
  const me = step.who;
  const r = latestRound(s);
  const reduced = useReducedMotion();
  const ctaRef = useRef<HTMLButtonElement>(null);
  // Focus the step's button for keyboard users without scrolling the page.
  useEffect(() => { ctaRef.current?.focus({ preventScroll: true }); }, [step]);
  const cta = <button ref={ctaRef} type="button" className="btn btn-ember btn-big lin-cta" onClick={onCta}>{step.cta}</button>;

  switch (step.screen) {
    case 'splash':
      return <Splash onDone={onCta} label={step.cta} />;
    case 'home':
      return (
        <div className="screen">
          <div className="player-card"><Avatar state={s} id={me} size={52} /><span className="pc-main"><strong>Riya</strong><small>Level {s.players[me].level}</small></span><Gold amount={balance(s, me)} /></div>
          <div className="modes">
            <span className="mode-btn mode-quick"><strong>Quick</strong><small>2 players · 100 gold</small></span>
            <span className="mode-btn"><strong>Classic</strong><small>4 players</small></span>
            <span className="mode-btn"><strong>Private</strong><small>Friends</small></span>
          </div>
          {cta}
        </div>
      );

    case 'match': {
      const g = s.publicGame!;
      const captured = g.captured;
      return (
        <div className="screen screen-game">
          <p className="eyebrow">Quick · Riya vs Gunjan · 100 gold</p>
          <div className="pm-players">
            <span className="pm-p"><Avatar state={s} id="riya" size={28} /> Riya (you)</span>
            <span className="pm-p">{captured && <span className="chat-bubble">{CHAT_LINE}</span>}Gunjan <Avatar state={s} id="gunjan" size={28} /></span>
          </div>
          <div className={captured && !reduced ? 'shake' : ''}>
            <Board tokens={g.tokens} meta={metaFor(s, ['red', 'teal'])} perspective="red"
              label={g.log[g.log.length - 1] ?? 'Match start'} focus={[{ color: 'red', tokenIndex: 3 }]} />
          </div>
          {captured && <p className="sent-home">Sent home!</p>}
          {cta}
        </div>
      );
    }

    case 'result':
      return (
        <div className="screen">
          <h1 className="title">Gunjan wins.</h1>
          <p className="result-money">You lost <Gold amount={-100} /> · balance <Gold amount={balance(s, me)} /></p>
          <div className="card card-ember">
            <span className="smart-tag">✨ Smart Fixture</span>
            <h2 className="card-h">Gunjan sent you home 1 square from the finish. Take Badla?</h2>
            <p className="chip-explain">Badla = first to two. This match already counts 1-0 to Gunjan.</p>
            {cta}
          </div>
        </div>
      );

    case 'pickTime': {
      const slot = round2Slot();
      return (
        <div className="screen">
          <p className="eyebrow">Set up Badla · Riya vs Gunjan</p>
          <h1 className="title">Pick a time</h1>
          <div className="card">
            <p className="small muted">Badla singles · entry <Gold amount={200} /> each · winner takes <Gold amount={400} /></p>
          </div>
          <div className="smart-card">
            <span className="smart-tag">✨ Smart Fixture</span>
            <p className="smart-line">You both usually play around 20:00. Book {smartTimeLabel(slot, s.opening.settledAt)}?</p>
            <span className="confidence">High chance you both show up</span>
            {cta}
          </div>
        </div>
      );
    }

    case 'lock': {
      const n = s.notifications.find((x) => x.to === 'gunjan' && x.kind === 'challenge');
      return (
        <div className="lock lin-lock">
          <p className="lock-owner">Gunjan's phone · locked</p>
          <p className="lock-time num">{formatTime(clock, TZ).replace(/\s?[ap]m$/, '')}</p>
          <div className="lock-pushes">
            <button type="button" className="push-card" onClick={onCta}>
              <span className="push-app">LUDO · Badla · now</span>
              <strong>{n?.title ?? 'Riya wants Badla'}</strong>
              <span>{n?.body ?? inviteLine({ from: 'Riya', to: 'Gunjan', squaresFromHome: 1, timeLabel: 'Tomorrow 20:15', score: '1-0' })}</span>
            </button>
          </div>
          <p className="lock-hint">Tap the notification</p>
        </div>
      );
    }

    case 'invite':
      return (
        <div className="screen">
          <div className="invite-from"><Avatar state={s} id="riya" size={48} /><h1 className="title">Riya wants Badla.</h1></div>
          <Score s={s} />
          <div className="card">
            <p className="time-big">{formatSlot(round2Slot(), s.opening.settledAt, TZ)} <span className="tz">IST</span></p>
            <p className="small">Entry <Gold amount={200} /> · win <Gold amount={400} /> back · gold moves only when you both tap Ready</p>
          </div>
          {cta}
          <p className="fine center">Also offered: Suggest another time · Pass</p>
        </div>
      );

    case 'booked':
      return (
        <div className="screen">
          <p className="eyebrow">Booked</p>
          <h1 className="title">See you tomorrow</h1>
          <div className="card card-gold ticket">
            <p className="ticket-time">{formatSlot(r!.window!, s.opening.settledAt, TZ)} <span className="tz">IST</span></p>
            <div className="ticket-players"><span className="tp"><Avatar state={s} id="riya" size={30} />Riya</span><span className="tp"><Avatar state={s} id="gunjan" size={30} />Gunjan</span></div>
            <p className="small">Singles · entry <Gold amount={200} /> each</p>
          </div>
          <p className="smart-inline">✨ Booked on a day Riya would likely skip: +1 active day</p>
          {cta}
        </div>
      );

    case 'checkin':
      return (
        <div className="screen">
          <div className="banner-static"><strong>Your table is ready</strong><span>Check in within 30 minutes</span></div>
          <h1 className="title">Check in</h1>
          <Score s={s} />
          <ul className="seats">
            {liveSeats(s, r!).map((x) => (
              <li key={x.id} className={`seat${x.status === 'ready' ? ' seat-ready' : ''}`}>
                <Avatar state={s} id={x.playerId as PlayerId} size={30} />
                <span className="seat-main"><strong>{s.players[x.playerId!].name}</strong><small>{x.status === 'ready' ? 'Ready ✓' : 'Not ready yet'}</small></span>
              </li>
            ))}
          </ul>
          {cta}
        </div>
      );

    case 'rematch':
    case 'grudge': {
      const g = r!.game!;
      const colors = g.seats.map((x) => x.color);
      return (
        <div className="screen screen-game">
          <p className="badla-banner">{step.screen === 'grudge' ? 'Grudge Night · decider · 2v2' : 'Badla match'}</p>
          <Score s={s} />
          <Board tokens={gameTokens(g)} meta={metaFor(s, colors)} perspective="red" label="Badla board" />
          <ol className="turn-order">
            {g.seats.map((x) => <li key={x.playerId}><Avatar state={s} id={x.playerId as PlayerId} size={22} /><span>{s.players[x.playerId as PlayerId].name}</span><small>{x.pos === 56 ? 'home' : `${56 - x.pos} to go`}</small></li>)}
          </ol>
          {cta}
        </div>
      );
    }

    case 'oneEach':
      return (
        <div className="screen">
          <h1 className="title">You win! One each.</h1>
          <Score s={s} />
          <p className="result-money">Won <Gold amount={400} /> · balance <Gold amount={balance(s, me)} /></p>
          <div className="card">
            <p className="small">Play the decider:</p>
            {cta}
            <p className="fine">Also offered: Private decider now · Book the decider</p>
          </div>
        </div>
      );

    case 'backup':
      return (
        <div className="screen">
          <p className="eyebrow">Grudge Night · tomorrow 21:00 · 100 gold a seat</p>
          <h1 className="title">Bring backup</h1>
          <ul className="seats">
            <li className="seat seat-ready"><Avatar state={s} id="riya" size={30} /><span className="seat-main"><strong>Riya (you)</strong><small>Captain</small></span></li>
            <li className="seat"><span className="seat-empty">+</span><span className="seat-main"><strong>Your partner</strong><small>Ananya, a friend from your club</small></span></li>
            <li className="seat seat-ready"><Avatar state={s} id="gunjan" size={30} /><span className="seat-main"><strong>Gunjan</strong><small>Captain · chose 21:00</small></span></li>
            <li className="seat"><Avatar state={s} id="shruti" size={30} /><span className="seat-main"><strong>Shruti</strong><small>Invited by Gunjan</small></span></li>
          </ul>
          {cta}
        </div>
      );

    case 'partnerInvite':
      return (
        <div className="screen">
          <p className="eyebrow">Partner invitation</p>
          <div className="invite-from"><Avatar state={s} id="riya" size={48} /><h1 className="title">Riya and Gunjan are 1‑1. Join Riya's side?</h1></div>
          <p className="big-price">Entry <Gold amount={100} />. Win <Gold amount={200} /> back.</p>
          <p className="muted small">Grudge Night · tomorrow 21:00 · listed in Chai & Dice Club</p>
          {cta}
          <p className="fine center">Or: Decline</p>
        </div>
      );

    case 'club':
    case 'clubResult': {
      const f = Object.values(s.fixtures)[0];
      const settled = f?.status === 'settled';
      return (
        <div className="screen">
          <p className="eyebrow">Club · Chai & Dice Club</p>
          <div className={`card ${settled ? 'card-gold' : 'card-ember'} fixture`}>
            <p className="eyebrow">Grudge Night · {settled ? 'Result' : 'Tomorrow 21:00'}</p>
            <h2 className="fx-teams">Riya & Ananya <span className="vs">vs</span> Gunjan & Shruti</h2>
            <p className="fx-score">Captains 1-1 · decider</p>
            {settled ? (
              <>
                <p className="fx-winner">Riya & Ananya win the series</p>
                <p className="ok">You picked Riya & Ananya. Riya & Ananya won.</p>
              </>
            ) : <p className="pick-h">Pick a side · free, no gold</p>}
          </div>
          {cta}
        </div>
      );
    }

    case 'seriesEnd': {
      const net = s.wallet.filter((e) => e.playerId === me && e.roundId).reduce((t, e) => t + e.amount, 0);
      return (
        <div className="screen">
          <h1 className="title">Riya wins the series 2-1</h1>
          <Score s={s} />
          <div className="card card-gold">
            <p className="eyebrow">Your gold</p>
            <p className="receipt-net">Series net <Gold amount={net} signed /></p>
            <p className="small">Balance <Gold amount={balance(s, me)} /></p>
          </div>
          <div className="card"><p className="eyebrow">Rivalry</p><p>Riya 2 – 1 Gunjan · rivals since {new Intl.DateTimeFormat('en-GB', { timeZone: TZ, day: 'numeric', month: 'short' }).format(s.opening.settledAt)}</p></div>
          {cta}
        </div>
      );
    }
  }
}

/** Original loading screen: curtain, lights, a bouncing die and a progress bar. */
function Splash({ onDone, label }: { onDone: () => void; label: string }) {
  const [pct, setPct] = useState(0);
  const ref = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (pct >= 100) { ref.current?.focus({ preventScroll: true }); return; }
    const t = setTimeout(() => setPct((p) => Math.min(100, p + 7)), 90);
    return () => clearTimeout(t);
  }, [pct]);
  return (
    <div className="splash">
      <div className="splash-lights" aria-hidden="true">{Array.from({ length: 14 }, (_, k) => <span key={k} />)}</div>
      <div className="splash-sparkles" aria-hidden="true"><span>✦</span><span>★</span><span>✦</span><span>◆</span></div>
      <h1 className="splash-title"><span className="st-ludo">Ludo</span><span className="st-badla">Badla</span></h1>
      <svg className="splash-die" viewBox="-12 -12 24 24" aria-hidden="true">
        <rect x="-10" y="-10" width="20" height="20" rx="5" fill="#fff4e6" stroke="#e9b36a" strokeWidth="1" />
        {[[-5, -5], [5, -5], [0, 0], [-5, 5], [5, 5]].map(([x, y]) => <circle key={`${x}${y}`} cx={x} cy={y} r="2" fill="#e63a35" />)}
      </svg>
      <div className="splash-board" aria-hidden="true"><span className="q g" /><span className="q y" /><span className="q r" /><span className="q b" /></div>
      <div className="splash-bottom">
        {pct < 100 ? (
          <>
            <p className="splash-loading">Loading ..</p>
            <div className="splash-bar" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}><span style={{ width: `${pct}%` }} /><em>{pct}%</em></div>
          </>
        ) : (
          <button ref={ref} type="button" className="btn btn-ember btn-big lin-cta" onClick={onDone}>{label}</button>
        )}
        <p className="splash-tag">One capture can start a rivalry</p>
      </div>
    </div>
  );
}

export function LinearApp() {
  const [i, setI] = useState(loadStep);
  const [handoff, setHandoff] = useState<PlayerId | null>(null);
  const step = STEPS[i];
  const { state: s, at } = useStory(step.n);
  const r = latestRound(s);
  const clock = step.atWindow && r?.window ? r.window.start : at;

  useEffect(() => {
    try { localStorage.setItem(KEY, String(i)); } catch { /* storage blocked: stays in memory */ }
  }, [i]);

  const go = (to: number) => {
    const next = (to + STEPS.length) % STEPS.length;
    if (STEPS[next].who !== step.who) {
      setHandoff(STEPS[next].who);
      setTimeout(() => setHandoff(null), 700);
    }
    setI(next);
  };

  return (
    <div className="lin">
      <header className="topbar lin-top">
        <div className="tb-left"><span className="wordmark">Badla</span><span className="tb-label">Concept prototype · not affiliated with Gameberry</span></div>
        <div className="clock-chip num">{formatClock(clock, TZ)}</div>
        <div className="lin-who"><Avatar state={s} id={step.who} size={28} /> {s.players[step.who].name}'s phone</div>
      </header>
      <main className="lin-stage">
        <div className="phone">
          <div className="statusbar" aria-hidden="true"><span className="num">{formatTime(clock, TZ)}</span><span>{s.players[step.who].name} · ●●●● LTE</span></div>
          <div className="phone-body" key={i}>
            <Screen step={step} s={s} clock={clock} onCta={() => go(i + 1)} />
          </div>
          {handoff && <div className="handoff" role="status"><Avatar state={s} id={handoff} size={64} /><p>Now on {s.players[handoff].name}'s phone</p></div>}
        </div>
        <aside className="lin-panel" aria-live="polite">
          <p className="eyebrow">Step {i + 1} of {STEPS.length} · {step.chapter}</p>
          <div className="lin-progress" aria-hidden="true"><span style={{ width: `${((i + 1) / STEPS.length) * 100}%` }} /></div>
          <p className="lin-what">{step.what}</p>
          <div className="why"><strong>Why it matters</strong><p>{step.why}</p></div>
          <button type="button" className="btn btn-ember btn-big" onClick={() => go(i + 1)}>{step.cta} →</button>
          <div className="row">
            <button type="button" className="btn btn-quiet" onClick={() => go(i - 1)} disabled={i === 0}>← Back</button>
            <button type="button" className="btn btn-quiet" onClick={() => setI(0)}>Restart</button>
          </div>
          <p className="fine">Tap the yellow button on the phone, or the one here: they do the same thing.</p>
        </aside>
      </main>
    </div>
  );
}
