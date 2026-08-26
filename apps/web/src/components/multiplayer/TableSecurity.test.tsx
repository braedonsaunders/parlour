import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { MultiplayerSecurity } from '@/app/_multiplayer/roomSession';
import { recoveryPolicyFor } from '@/lib/multiplayer/veil';
import { useLocaleStore } from '@/stores/locale';
import { RoomSecurityDisclosure } from './TableSecurity';

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

  it('localises the guarantee and recovery policy together', () => {
    useLocaleStore.setState({ locale: 'es', chosen: true });
    const roomSecurity = security('veil', 4);

    act(() => root.render(<RoomSecurityDisclosure security={roomSecurity} hasBot={false} />));

    expect(container.textContent).toContain('Nadie en esta mesa puede ver tu mano');
    expect(container.textContent).toContain('2 de los otros 3 jugadores');
    expect(container.textContent).not.toContain(roomSecurity.recovery.disclosure);
  });
});
