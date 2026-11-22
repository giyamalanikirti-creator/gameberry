import { createContext, useContext } from 'react';
import type { PlayerId, Route } from '../domain/types';

export interface PaneRequest {
  /** Open straight on this player's sign-in card (or switch if already unlocked). */
  signInAs?: PlayerId | null;
  highlight?: PlayerId | null;
  /** Where that player lands after unlocking: navigation only, never consent. */
  afterRoute?: Route | null;
}

export interface Shell {
  openPane: (req?: PaneRequest) => void;
  /** Show a player's lock screen with their pushes (the phone is theirs, still locked). */
  showLock: (p: PlayerId | null) => void;
  /** 600 ms "Now on Gunjan's phone" card, then the pane on that player. */
  handoff: (p: PlayerId, afterRoute?: Route | null) => void;
  highlight: string | null;
  setHighlight: (k: string | null) => void;
  flash: (msg: string) => void;
}

export const ShellCtx = createContext<Shell | null>(null);

export function useShell(): Shell {
  const s = useContext(ShellCtx);
  if (!s) throw new Error('ShellCtx missing');
  return s;
}

/** Props for a button the story panel can point at. */
export function useTarget(key: string, extraClass = '') {
  const { highlight } = useShell();
  return { 'data-story': key, className: `${extraClass}${highlight === key ? ' story-pulse' : ''}`.trim() };
}
