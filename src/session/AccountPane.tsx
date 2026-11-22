import { useEffect, useRef, useState } from 'react';
import type { PlayerId, Route } from '../domain/types';
import { PLAYER_IDS } from '../state/seed';
import { balance, pendingActions, roleOf } from '../state/selectors';
import { useStore } from '../state/store';
import { Avatar, Gold } from '../ui/kit';
import { useSessionControls } from './SessionProvider';
import { SignInCard } from './SignInCard';

/** The product's account menu and the prototype's only way to change player. */
export function AccountPane({ open, onClose, highlight, startWith, afterRoute }: {
  open: boolean; onClose: () => void; highlight: PlayerId | null; startWith?: PlayerId | null; afterRoute?: Route | null;
}) {
  const { state, me, now, go } = useStore();
  const { switchTo, signOut, lockAll, isUnlocked } = useSessionControls();
  const [signingIn, setSigningIn] = useState<PlayerId | null>(null);
  const panel = useRef<HTMLDivElement>(null);
  const land = () => { if (afterRoute) go(afterRoute); };

  useEffect(() => {
    if (!open || !startWith || startWith === me) return;
    if (isUnlocked(startWith)) { switchTo(startWith); land(); onClose(); }
    else setSigningIn(startWith);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, startWith]);

  useEffect(() => {
    if (!open) { setSigningIn(null); return; }
    const first = panel.current?.querySelector<HTMLElement>('button:not([disabled]), input');
    first?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'Tab' && panel.current) {
        const els = [...panel.current.querySelectorAll<HTMLElement>('button:not([disabled]), input, [tabindex="0"]')];
        if (!els.length) return;
        const [a, z] = [els[0], els[els.length - 1]];
        if (e.shiftKey && document.activeElement === a) { e.preventDefault(); z.focus(); }
        else if (!e.shiftKey && document.activeElement === z) { e.preventDefault(); a.focus(); }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose, signingIn]);

  if (!open) return null;

  const pick = (p: PlayerId) => {
    if (p === me) return;
    if (isUnlocked(p)) { switchTo(p); land(); onClose(); }
    else setSigningIn(p);
  };

  return (
    <div className="scrim" onMouseDown={onClose}>
      <div className="account-pane" role="dialog" aria-modal="true" aria-label="Accounts" ref={panel} onMouseDown={(e) => e.stopPropagation()}>
        {signingIn ? (
          <SignInCard player={signingIn} onDone={() => { setSigningIn(null); land(); onClose(); }} onBack={() => setSigningIn(null)} />
        ) : (
          <>
            <p className="pane-h">Accounts</p>
            <ul className="acct-list">
              {PLAYER_IDS.map((p) => {
                const pending = pendingActions(state, p, now).length;
                const current = p === me;
                return (
                  <li key={p}>
                    <button type="button" className={`acct${current ? ' current' : ''}${highlight === p ? ' highlight' : ''}`} onClick={() => pick(p)} disabled={current} aria-current={current ? 'true' : undefined}>
                      <Avatar state={state} id={p} size={34} />
                      <span className="acct-main">
                        <strong>{state.players[p].name}{current ? ' · signed in' : ''}</strong>
                        <small>{roleOf(state, p)}</small>
                      </span>
                      <span className="acct-side">
                        <Gold amount={balance(state, p)} />
                        {!current && !isUnlocked(p) && <span className="lock" aria-label="locked">🔒</span>}
                      </span>
                      {pending > 0 && <span className="pending" aria-label={`${pending} pending`}>{pending}</span>}
                    </button>
                  </li>
                );
              })}
            </ul>
            <div className="pane-foot">
              <button type="button" onClick={() => { signOut(); onClose(); }} disabled={!me}>Sign out</button>
              <button type="button" onClick={() => { lockAll(); onClose(); }}>Lock all sessions</button>
            </div>
            <p className="fine">Demo roster · five seeded accounts on one device</p>
          </>
        )}
      </div>
    </div>
  );
}
