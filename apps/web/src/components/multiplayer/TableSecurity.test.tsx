import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { MultiplayerSecurity } from '@/app/_multiplayer/roomSession';
import { useLocaleStore } from '@/stores/locale';
import { SecurityBadge } from './TableSecurity';

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
