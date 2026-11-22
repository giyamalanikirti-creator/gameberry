import { useId, useState } from 'react';

export const GLOSSARY: Record<string, string> = {
  entry: 'Entry: the gold each player puts in to sit down. It is only taken when every seat is ready.',
  pot: 'Pot: all entries together. Winners split it.',
  'check-in window': 'Check-in window: the 30 minutes in which everyone taps Ready. If anyone is missing when it closes, nothing is charged.',
  decider: 'Decider: the third round, played at 1-1. First to two wins the series.',
  'Grudge Night': 'Grudge Night: a decider played 2v2 and listed in your club, so clubmates can pick a side for free.',
  sweep: 'Sweep: winning the series 2-0.',
};

/** Jargon explained on first use: tap or focus to read. */
export function Term({ t, children }: { t: keyof typeof GLOSSARY; children?: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <span className="term-wrap">
      <button type="button" className="term" aria-describedby={open ? id : undefined} aria-expanded={open}
        onClick={() => setOpen((o) => !o)} onBlur={() => setOpen(false)}>
        {children ?? t}
      </button>
      {open && <span role="tooltip" id={id} className="term-tip">{GLOSSARY[t]}</span>}
    </span>
  );
}
