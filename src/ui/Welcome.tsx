import type { PlayerId } from '../domain/types';
import { useStore } from '../state/store';
import { Avatar } from './kit';

const CAST: Array<[PlayerId, string]> = [
  ['riya', 'You: loses a close public match'],
  ['gunjan', 'Rival: sent you home'],
  ['ananya', "Partner on Riya's side"],
  ['shruti', "Partner on Gunjan's side"],
  ['dev', 'Clubmate: picks a side'],
];

export function Welcome({ onGuided, onFree }: { onGuided: () => void; onFree: () => void }) {
  const { state } = useStore();
  return (
    <div className="welcome-scrim">
      <div className="welcome" role="dialog" aria-modal="true" aria-labelledby="w-title">
        <p className="eyebrow">Concept prototype · not affiliated with Gameberry</p>
        <h1 id="w-title" className="title">Badla: turn a capture into a rivalry.</h1>
        <p className="muted">A 4-minute walkthrough of how one capture brings five players back tomorrow.</p>
        <ul className="cast">
          {CAST.map(([id, role]) => (
            <li key={id}><Avatar state={state} id={id} size={36} /><span><strong>{state.players[id].name}</strong><small>{role}</small></span></li>
          ))}
        </ul>
        <button type="button" className="btn btn-ember btn-big" onClick={onGuided} autoFocus>Start guided demo</button>
        <button type="button" className="btn btn-quiet" onClick={onFree}>Explore freely</button>
        <p className="fine">The deck and the Excel model are shared separately. Each player signs in with their own demo PIN, shown on the sign-in card.</p>
      </div>
    </div>
  );
}
