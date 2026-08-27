import { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MultiplayerRoomSnapshot, MultiplayerSecurity } from '@/app/_multiplayer/roomSession';
import { recoveryPolicyFor } from '@/lib/multiplayer/veil';
import { useLocaleStore } from '@/stores/locale';
import { RoomLobby } from './RoomLobby';

type LobbySnapshot = Pick<
  MultiplayerRoomSnapshot,
  'settings' | 'security' | 'seats' | 'connection' | 'error' | 'listed'
>;

function roomSecurity(tier: MultiplayerSecurity['tier'], seats: number): MultiplayerSecurity {
  return {
    tier,
    audit: tier === 'veil' ? 'veiled' : 'open',
    label: tier === 'veil' ? 'Veiled' : 'Fair deal',
    detail: '',
    recovery: recoveryPolicyFor(seats),
    ceremony: { laid: 0, seats, ready: tier === 'open' },
    recoveredSeats: [],
    paused: null,
  };
}

function lobbySnapshot({
  tier = 'open',
  seats = 2,
  withBot = false,
  listed = false,
}: {
  tier?: MultiplayerSecurity['tier'];
  seats?: number;
  withBot?: boolean;
  listed?: boolean;
} = {}): LobbySnapshot {
  return {
    listed,
    settings: { gameId: seats === 4 ? 'spades' : 'gin', seats, config: {}, security: tier },
    security: roomSecurity(tier, seats),
    seats: [
      {
        seat: 0,
        name: 'Luz',
        avatarId: 'ember',
        profileId: 'luz',
        bot: false,
        connected: true,
      },
      ...(withBot
        ? [
            {
              seat: 1,
              name: 'Río',
              avatarId: 'bot',
              profileId: 'bot-1',
              bot: true,
              connected: true,
            },
          ]
        : []),
    ],
    connection: 'connected',
    error: null,
  };
}

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
          snapshot={lobbySnapshot({ withBot: true })}
          code="ABCD"
          shareUrl="https://example.test/ABCD"
          seats={[
            { seat: 0, name: 'Luz', avatar: '🔥', bot: false, connected: true },
            { seat: 1, name: 'Río', avatar: '🌊', bot: true, connected: true },
          ]}
          isHost={false}
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

  /**
   * Listing publishes a display name to relays parlour neither runs nor
   * moderates. A guest cannot do it at all, and a host has to ask.
   */
  it('offers the public listing box to the host only, unticked', () => {
    useLocaleStore.setState({ locale: 'en', chosen: true });
    const seats = [{ seat: 0, name: 'Luz', avatar: '🔥', bot: false, connected: true }];

    act(() =>
      root.render(
        <RoomLobby
          snapshot={lobbySnapshot()}
          code="ABCD"
          shareUrl="https://example.test/ABCD"
          seats={seats}
          isHost={false}
          onListedChange={() => undefined}
        />,
      ),
    );
    expect(container.querySelector('[data-testid="list-publicly"]')).toBeNull();

    const changes: boolean[] = [];
    act(() =>
      root.render(
        <RoomLobby
          snapshot={lobbySnapshot()}
          code="ABCD"
          shareUrl="https://example.test/ABCD"
          seats={seats}
          isHost
          onListedChange={(listed) => changes.push(listed)}
        />,
      ),
    );

    const box = container.querySelector<HTMLInputElement>(
      '[data-testid="list-publicly"] input[type="checkbox"]',
    );
    expect(box?.checked).toBe(false);
    expect(container.textContent).toContain('List this table publicly');

    act(() => box?.click());
    expect(changes).toEqual([true]);
  });

  it('says what a listed table is telling strangers', () => {
    useLocaleStore.setState({ locale: 'en', chosen: true });
    act(() =>
      root.render(
        <RoomLobby
          snapshot={lobbySnapshot({ listed: true })}
          code="ABCD"
          shareUrl="https://example.test/ABCD"
          seats={[{ seat: 0, name: 'Luz', avatar: '🔥', bot: false, connected: true }]}
          isHost
          onListedChange={() => undefined}
        />,
      ),
    );

    const toggle = container.querySelector('[data-testid="list-publicly"]');
    expect(toggle?.querySelector('input')?.checked).toBe(true);
    expect(toggle?.textContent).toContain('Listed until the last chair fills');
  });
});
