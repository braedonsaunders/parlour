import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FxEvent } from '@parlour/engine';
import { translatorFor } from '@/lib/i18n';
import { useLocaleStore } from '@/stores/locale';
import { TableScreenFrame } from './TableScreenFrame';
import {
  narrateSolitaireFx,
  useSolitaireNarration,
  type SolitaireNarrationGame,
} from './useSolitaireNarration';

function NarrationProbe({
  game,
  fx,
  fxKey,
}: {
  game: SolitaireNarrationGame;
  fx: readonly FxEvent[];
  fxKey: string;
}) {
  useSolitaireNarration(game, fx, fxKey);
  return null;
}

describe('solitaire narration', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    useLocaleStore.setState({ locale: 'en', chosen: false });
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it('publishes one moved run and its reveal through the shell live region', () => {
    const fx: FxEvent[] = [
      {
        kind: 'klondike.cards-move',
        payload: { cards: ['S1'], from: 'tableau:0', to: 'foundation:spades' },
      },
      {
        kind: 'card.fly',
        payload: { card: 'S1', from: 'tableau:0', to: 'foundation:spades' },
      },
      {
        kind: 'card.flip',
        payload: { card: 'H13', from: 'tableau:0', to: 'tableau:0' },
      },
    ];

    act(() =>
      root.render(
        <TableScreenFrame
          rootRef={{ current: null }}
          hud={null}
          menu={{ isOpen: false, open: vi.fn(), close: vi.fn(), quit: vi.fn() }}
        >
          <NarrationProbe game="klondike" fx={fx} fxKey="move-1" />
        </TableScreenFrame>,
      ),
    );

    expect(container.querySelector('[data-table-announcer]')?.textContent).toBe(
      'ace of spades moved from tableau column 1 to the spades foundation. king of hearts revealed in tableau column 1.',
    );
  });

  it('summarises the distinct stock and removal actions without reading their flights', () => {
    const t = translatorFor('en');
    expect(
      narrateSolitaireFx(
        'golf',
        [{ kind: 'golf.stock-draw', payload: { card: 'D7', count: 1 } }],
        t,
      ),
    ).toBe('7 of diamonds moved from the stock to the hole.');
    expect(
      narrateSolitaireFx(
        'spider',
        [{ kind: 'spider.stock-deal', payload: { cards: [], count: 10 } }],
        t,
      ),
    ).toBe('10 cards dealt across the tableau.');
    expect(
      narrateSolitaireFx(
        'pyramid',
        [{ kind: 'pyramid.pair', payload: { cards: ['C5', 'H8'] } }],
        t,
      ),
    ).toBe('5 of clubs and 8 of hearts removed.');
  });
});
