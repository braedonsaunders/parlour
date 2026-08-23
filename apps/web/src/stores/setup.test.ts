import { describe, expect, it } from 'vitest';
import { useSetupStore } from './setup';

describe('setup store', () => {
  it('defaults to a four-seat classic table with medium bots', () => {
    expect(useSetupStore.getState()).toMatchObject({ mode: 'classic', seats: 4, botTier: 2 });
  });

  it('accepts valid seat counts and bot tiers', () => {
    useSetupStore.getState().setSeats(2);
    useSetupStore.getState().setBotTier(3);
    useSetupStore.getState().setMode('timed');
    const state = useSetupStore.getState();
    expect(state).toMatchObject({ mode: 'timed', seats: 2, botTier: 3 });
  });

  it('clamps out-of-range values instead of storing them', () => {
    useSetupStore.getState().setSeats(7);
    useSetupStore.getState().setSeats(1);
    useSetupStore.getState().setBotTier(9);
    useSetupStore.getState().setBotTier(0);
    const state = useSetupStore.getState();
    expect(state.seats).toBe(4);
    expect(state.botTier).toBe(2);
  });
});
