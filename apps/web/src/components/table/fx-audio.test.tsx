import { act, createElement } from 'react';
import { Fx, type FxEvent } from '@parlour/engine';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useTableAudio } from './fx-animation';

const { play, preload } = vi.hoisted(() => ({ play: vi.fn(), preload: vi.fn() }));

vi.mock('@/lib/audio/AudioManager', () => ({
  getAudioManager: () => ({ play, preload }),
}));

function Table({ fx, fxKey }: { fx: readonly FxEvent[]; fxKey: number }) {
  useTableAudio(fx, fxKey, 'wildpile');
  return null;
}

/**
 * Wild's authored callouts land after the motion that earned them: the burst is
 * a 180ms discard flight plus an 80ms settle, and "Last card!" speaks at 320ms.
 * The next burst therefore arrives while the line is still pending, which is
 * the normal case when the move came from someone else's device and its turn
 * ring is already queued behind it. Cancelling then meant a player only ever
 * heard their own last-card call.
 */
describe('useTableAudio', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    vi.useFakeTimers();
    play.mockClear();
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.useRealTimers();
  });

  const lastCardBurst: FxEvent[] = [
    { kind: Fx.DiscardCard, payload: { card: 'red-5-0', seat: 1 }, at: 0 },
    { kind: 'wildpile.last-card', payload: { seat: 1 }, at: 0 },
  ];

  it('speaks a callout the next burst arrives on top of', () => {
    act(() => {
      root.render(createElement(Table, { fx: lastCardBurst, fxKey: 1 }));
    });
    act(() => {
      vi.advanceTimersByTime(260);
    });
    act(() => {
      root.render(
        createElement(Table, {
          fx: [{ kind: Fx.TurnRing, payload: { seat: 0 }, at: 0 }],
          fxKey: 2,
        }),
      );
    });
    act(() => {
      vi.advanceTimersByTime(200);
    });

    expect(play.mock.calls.map(([id]) => id)).toContain('wildpile.voice.last-card');
  });

  it('drops pending cues when the table goes away', () => {
    act(() => {
      root.render(createElement(Table, { fx: lastCardBurst, fxKey: 1 }));
    });
    act(() => root.unmount());
    act(() => {
      vi.advanceTimersByTime(1_000);
    });

    expect(play.mock.calls.map(([id]) => id)).not.toContain('wildpile.voice.last-card');

    root = createRoot(container);
  });
});
