import { formatDuration, formatSlot } from '../domain/time';
import type { PlayerId } from '../domain/types';
import { pReturn } from '../smart/smartFixture';
import { liveSeats } from '../state/selectors';
import { useStore } from '../state/store';
import { Avatar, Card, Gold } from '../ui/kit';
import { useTarget } from '../ui/shell';
import { Term } from '../ui/Term';
import { Back, Terminal, useMe } from './common';

/** Flow 3: the fixture ticket, with one tap to fixture time. */
export function Booked({ roundId }: { roundId: string }) {
  const { state, me, now, tz, go } = useMe();
  const { setClockOffset, clockOffset, demo } = useStore();
  const skipT = useTarget('skip-ahead', 'btn btn-ember btn-big');
  const r = state.rounds[roundId];
  if (!r || !r.window) return <Terminal title="Not available" body="This round has no booked time." />;
  const seats = liveSeats(state, r);
  if (!seats.some((x) => x.playerId === me)) return <Terminal title="Not available" body="This ticket belongs to the players in the round." />;
  const time = formatSlot(r.window, now, tz);
  const start = new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(r.window.start);
  const ahead = r.window.start - now;
  const skip = () => {
    setClockOffset(clockOffset + (r.window!.start - now));
    demo({ type: 'DEMO_NOTE', name: 'story_skip_ahead', detail: { to: 'fixture time' } });
    go({ name: 'round', id: r.id });
  };
  const likelySkip = state.settings.variant === 'D' && pReturn(me, r.window.start) < 0.5;

  return (
    <div className="screen">
      <Back to={{ name: 'badla' }} label="Badla" />
      <p className="eyebrow">Booked</p>
      <h1 className="title">Your Badla is booked</h1>
      <Card tone="gold" className="ticket">
        <p className="ticket-time">{time} <span className="tz">IST</span></p>
        <div className="ticket-players">
          {seats.map((x) => x.playerId && (
            <span key={x.id} className="tp"><Avatar state={state} id={x.playerId as PlayerId} size={30} />{state.players[x.playerId].name}</span>
          ))}
        </div>
        <p className="small"><Term t="entry">Entry</Term> <Gold amount={r.entryGold} /> each · <Term t="pot">pot</Term> <Gold amount={r.entryGold * seats.length} /> · {r.format}</p>
        <p className="countdown num">{ahead > 0 ? `Starts in ${formatDuration(ahead)}` : 'Check-in is open'}</p>
      </Card>
      {likelySkip && <p className="smart-inline">✨ Smart Fixture booked this on a day you'd likely skip: +1 active day</p>}
      {ahead > 0 ? (
        <button type="button" {...skipT} onClick={skip}>Skip to tomorrow {start}</button>
      ) : (
        <button type="button" className="btn btn-ember btn-big" onClick={() => go({ name: 'round', id: r.id })}>Go to check-in</button>
      )}
      <p className="fine">Prototype shortcut: skipping ahead moves the simulated clock. It never plays or settles the match.</p>
    </div>
  );
}
