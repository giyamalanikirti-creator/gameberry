import { FormEvent, useState } from 'react';
import type { PlayerId } from '../domain/types';
import { useStore } from '../state/store';
import { Avatar } from '../ui/kit';
import { useSessionControls } from './SessionProvider';

const KIND_LABEL = { full: 'Full account · club member', partner: 'Partner account · invited in', clubOnly: 'Club-only account · no seat in the series' };

export function SignInCard({ player, onDone, onBack }: { player: PlayerId; onDone: () => void; onBack: () => void }) {
  const { state } = useStore();
  const { signIn } = useSessionControls();
  const p = state.players[player];
  const [pin, setPin] = useState('');
  const [remember, setRemember] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const error = signIn(player, pin, remember);
    if (error) setErr(error);
    else onDone();
  };

  return (
    <form className="signin" onSubmit={submit}>
      <button type="button" className="back" onClick={onBack}><span aria-hidden="true">‹</span> Accounts</button>
      <div className="signin-who">
        <Avatar state={state} id={player} size={52} />
        <div>
          <strong>{p.name}</strong>
          <small>{p.handle}</small>
          <small>{KIND_LABEL[p.accountKind]}</small>
        </div>
      </div>
      <label className="pin">
        4-digit PIN
        <input inputMode="numeric" pattern="[0-9]*" maxLength={4} autoComplete="off" value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))} aria-describedby="demo-pin" />
      </label>
      <p id="demo-pin" className="fine">Demo PIN {p.pin} <button type="button" className="link" onClick={() => setPin(p.pin)}>Fill it</button></p>
      <label className="check"><input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} /> Remember this device</label>
      {err && <p className="error" role="alert">{err}</p>}
      <button type="submit" className="btn btn-ember" disabled={pin.length !== 4}>Sign in</button>
    </form>
  );
}
