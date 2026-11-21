import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { STORAGE_KEY, loadSnapshot } from '../persistence/storage';
import { App } from './App';

function click(name: string | RegExp) {
  fireEvent.click(screen.getByRole('button', { name }));
}
function guide(name: string) {
  fireEvent.click(within(screen.getByRole('note', { name: 'Demo guide' })).getByRole('button', { name }));
}

beforeEach(() => {
  localStorage.clear();
  window.matchMedia = ((q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {} })) as unknown as typeof window.matchMedia;
});
afterEach(cleanup);

describe('App', () => {
  it('starts on the original result with the capture as the hero', () => {
    render(<App tickMs={60_000} />);
    expect(screen.getByRole('heading', { name: 'Ahmed wins.' })).toBeTruthy();
    expect(screen.getByLabelText('Head to head: Ahmed 1 · Kirti 0')).toBeTruthy();
    expect(screen.getAllByText('Ahmed caught your last token just before safety.').length).toBeGreaterThan(0);
    expect(screen.getByText(/Viewing as Kirti/)).toBeTruthy();
  });

  it('challenge → guided handoff to Ahmed → pass leaves no pending card', () => {
    render(<App tickMs={60_000} />);
    click('Ask for Badla');
    expect(screen.getByText('You challenged Ahmed.')).toBeTruthy();
    guide("Try Ahmed's view");
    expect(screen.getByText(/Viewing as Ahmed/)).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Kirti wants a rematch' })).toBeTruthy();
    expect(screen.getAllByText("You caught Kirti's last token just before safety.").length).toBeGreaterThan(0);
    click('Pass');
    expect(screen.queryByText('Kirti wants a rematch')).toBeNull();
    guide("Back to Kirti's view");
    expect(screen.queryByText('You challenged Ahmed.')).toBeNull();
    expect(screen.queryByText(/Waiting for Ahmed/)).toBeNull();
  });

  it('shows the proposed window in each player’s own time zone', () => {
    render(<App tickMs={60_000} />);
    click('Ask for Badla');
    guide("Try Ahmed's view");
    click('Tomorrow evening');
    expect(screen.getByText(/Kirti sees Mon 23 Nov, 19:30–20:00/)).toBeTruthy();
    click('Suggest this time');
    guide("Back to Kirti's view");
    expect(screen.getByText('Mon 23 Nov, 19:30–20:00')).toBeTruthy();
    expect(screen.getByText(/19:00–19:30 for Ahmed/)).toBeTruthy();
  });

  it('persists navigation and state across a remount (refresh)', () => {
    const { unmount } = render(<App tickMs={60_000} />);
    click('Ask for Badla');
    unmount();
    const saved = loadSnapshot(localStorage);
    expect(saved.status).toBe('ok');
    render(<App tickMs={60_000} />);
    expect(screen.getByText('You challenged Ahmed.')).toBeTruthy();
  });

  it('reduced motion shows the static before/after pair', () => {
    render(<App tickMs={60_000} />);
    click('Demo controls');
    fireEvent.click(screen.getByRole('button', { name: 'Reduced' }));
    fireEvent.click(screen.getByRole('button', { name: 'Close demo controls' }));
    expect(screen.getByText('Reduced motion: showing before and after frames.')).toBeTruthy();
    expect(screen.getByText(/After: Ahmed rolled 3 and landed on it/)).toBeTruthy();
  });

  it('offers a reset when saved data fails validation', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, domain: {}, ui: {} }));
    render(<App tickMs={60_000} />);
    expect(screen.getByRole('alertdialog')).toBeTruthy();
    act(() => click('Reset demo'));
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(screen.getByRole('heading', { name: 'Ahmed wins.' })).toBeTruthy();
  });
});
