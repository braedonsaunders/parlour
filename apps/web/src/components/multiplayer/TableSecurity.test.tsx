import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { MultiplayerSecurity } from '@/app/_multiplayer/roomSession';
import { recoveryPolicyFor } from '@/lib/multiplayer/veil';
import { useLocaleStore } from '@/stores/locale';
import { SecurityBadge } from './TableSecurity';

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

  /*
   * The pre-deal disclosure card this file used to cover is gone. It explained
   * a recovery threshold — "2 of the other 3 players must agree to restore a
   * dropped seat's cards" — to somebody who had come to play cards, and the
   * owner asked for the whole card removed. What is left is the badge, and the
   * badge still has to speak the player's language.
   */
  it('localises the guarantee it names', () => {
    act(() => root.render(<SecurityBadge security={security('veil', 4)} />));

    expect(container.querySelector('[data-testid="table-security"]')?.textContent).toContain(
      'Oculto',
    );
  });

  it('localises a seat whose hand had to be reopened', () => {
    act(() =>
      root.render(<SecurityBadge security={{ ...security('veil', 4), recoveredSeats: [1] }} />),
    );

    expect(
      container.querySelector('[data-testid="table-security-recovered"]')?.textContent,
    ).toContain('Asiento 2');
  });

  it('localises a round that has stopped for a dropped seat', () => {
    const paused = {
      ...security('veil', 4),
      paused: 'Seat 2 dropped. Waiting for them to come back…',
    };

    act(() => root.render(<SecurityBadge security={paused} />));

    expect(container.querySelector('[data-testid="table-security-paused"]')?.textContent).toContain(
      'El asiento 2 se desconectó',
    );
  });
});
