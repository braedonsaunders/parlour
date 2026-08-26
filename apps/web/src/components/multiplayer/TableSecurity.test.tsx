import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { MultiplayerSecurity } from '@/app/_multiplayer/roomSession';
import { recoveryPolicyFor } from '@/lib/multiplayer/veil';
import { roomGame } from '@/lib/rooms/gameRegistry';
import { useLocaleStore } from '@/stores/locale';
import { GameVeilRefusal, RoomSecurityDisclosure, SecurityBadge } from './TableSecurity';

function security(tier: MultiplayerSecurity['tier'], seats: number): MultiplayerSecurity {
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

describe('SecurityBadge localisation', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    useLocaleStore.setState({ locale: 'es', chosen: true });
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it('translates the audit state, recovery disclosure and known pause copy', () => {
    const security = {
      tier: 'open',
      audit: 'open',
      label: 'Fair deal',
      detail: '',
      recoveredSeats: [0, 2],
      paused: 'Seat 2 dropped. Waiting for them to come back…',
    } as unknown as MultiplayerSecurity;

    act(() => root.render(<SecurityBadge security={security} />));

    expect(container.textContent).toContain('Reparto justo');
    expect(container.textContent).toContain('Asiento 1 y Asiento 3');
    expect(container.textContent).toContain('sus manos se reabrieron');
    expect(container.textContent).toContain('El asiento 2 se desconectó');
  });
});

describe('RoomSecurityDisclosure', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    useLocaleStore.setState({ locale: 'en', chosen: true });
    container = document.createElement('div');
    document.body.append(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    useLocaleStore.setState({ locale: 'en', chosen: false });
  });

  it('states the actual two- and four-seat recovery bargain before a veiled deal', () => {
    for (const seats of [2, 4]) {
      act(() =>
        root.render(
          <RoomSecurityDisclosure
            security={security('veil', seats)}
            gameId={seats === 2 ? 'gin' : 'spades'}
            hasBot={false}
          />,
        ),
      );

      const disclosure = container.querySelector<HTMLElement>(
        '[data-testid="room-security-disclosure"]',
      )!;
      expect(disclosure.dataset.security).toBe('veil');
      expect(disclosure.textContent).toContain('Nobody at this table can see your hand');
      expect(disclosure.textContent).toContain(recoveryPolicyFor(seats).disclosure);
    }
  });

  it('announces the open-table downgrade as soon as a bot occupies a seat', () => {
    const roomSecurity = security('veil', 4);
    act(() =>
      root.render(
        <RoomSecurityDisclosure security={roomSecurity} gameId="spades" hasBot={false} />,
      ),
    );
    expect(container.querySelector('[data-security="veil"]')).not.toBeNull();

    act(() =>
      root.render(<RoomSecurityDisclosure security={roomSecurity} gameId="spades" hasBot />),
    );

    const disclosure = container.querySelector<HTMLElement>('[data-security="open"]')!;
    expect(disclosure.getAttribute('role')).toBe('status');
    expect(disclosure.textContent).toContain('house bots hold no Veil key');
    expect(disclosure.textContent).toContain('house bot takes their seat until they return');
    expect(disclosure.textContent).not.toContain(roomSecurity.recovery.disclosure);
  });

  it('never claims hidden hands when the room reports an open tier', () => {
    act(() =>
      root.render(
        <RoomSecurityDisclosure security={security('open', 4)} gameId="spades" hasBot={false} />,
      ),
    );

    const disclosure = container.querySelector<HTMLElement>('[data-security="open"]')!;
    expect(disclosure.textContent).toContain('modified client can read every hand');
    expect(disclosure.textContent).not.toContain('Nobody at this table can see your hand');
  });

  it('shows each refusing game’s registry reason where its room is chosen', () => {
    for (const gameId of ['scopa', 'spite'] as const) {
      act(() => root.render(<GameVeilRefusal gameId={gameId} />));
      expect(container.textContent).toBe(roomGame(gameId).veilRefusal);
    }

    act(() =>
      root.render(
        <RoomSecurityDisclosure security={security('veil', 4)} gameId="scopa" hasBot={false} />,
      ),
    );
    expect(container.querySelector('[data-security="open"]')?.textContent).toContain(
      roomGame('scopa').veilRefusal,
    );

    act(() => root.render(<GameVeilRefusal gameId="spades" />));
    expect(container.querySelector('[data-testid="game-veil-refusal"]')).toBeNull();
  });

  it('localises the guarantee and recovery policy together', () => {
    useLocaleStore.setState({ locale: 'es', chosen: true });
    const roomSecurity = security('veil', 4);

    act(() =>
      root.render(
        <RoomSecurityDisclosure security={roomSecurity} gameId="spades" hasBot={false} />,
      ),
    );

    expect(container.textContent).toContain('Nadie en esta mesa puede ver tu mano');
    expect(container.textContent).toContain('2 de los otros 3 jugadores');
    expect(container.textContent).not.toContain(roomSecurity.recovery.disclosure);
  });
});
