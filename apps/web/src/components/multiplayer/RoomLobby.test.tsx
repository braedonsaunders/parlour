import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useLocaleStore } from '@/stores/locale';
import { RoomLobby } from './RoomLobby';

describe('RoomLobby localisation', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    useLocaleStore.setState({ locale: 'es', chosen: true });
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: vi.fn().mockRejectedValue(new Error('blocked')) },
    });
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it('translates sharing errors and bot labels with the rest of the lobby', async () => {
    await act(async () =>
      root.render(
        <RoomLobby
          code="ABCD"
          shareUrl="https://example.test/ABCD"
          seats={[
            { seat: 0, name: 'Luz', avatar: '🔥', bot: false, connected: true },
            { seat: 1, name: 'Río', avatar: '🌊', bot: true, connected: true },
          ]}
          capacity={2}
          isHost
          connection="connected"
          onStart={() => undefined}
        />,
      ),
    );

    expect(container.textContent).toContain('Río (bot)');
    expect(
      [...container.querySelectorAll('button')].some(
        (button) => button.textContent === 'Compartir',
      ),
    ).toBe(true);

    const copy = [...container.querySelectorAll('button')].find((button) =>
      button.textContent?.includes('Copiar enlace'),
    );
    await act(async () => copy?.click());
    expect(container.querySelector('[role="alert"]')?.textContent).toContain(
      'No se pudo abrir la opción de compartir',
    );
  });
});
