import { createSession, sessionApply } from '@parlour/engine';
import { describe, expect, it } from 'vitest';
import { wildpileConfig, wildpileGame } from './index';

describe('Wild Pile presentation fx', () => {
  it('announces when a player reaches their last card', () => {
    const session = createSession(wildpileGame, {
      seed: 91,
      config: wildpileConfig.defaults(),
      seats: 2,
    });
    const state = {
      ...session.state,
      hands: [
        ['red-5-0', 'red-6-0'],
        ['blue-2-0', 'green-3-0'],
      ],
      discard: ['red-3-0'],
      activeColor: 'red' as const,
      turn: 0,
      calledLastCard: [true, false],
    };
    const played = sessionApply(
      wildpileGame,
      { ...session, state, phase: wildpileGame.flow.start(state, 2) },
      0,
      'playCard',
      { card: 'red-5-0' },
    );

    expect(played.fx).toContainEqual({ kind: 'wildpile.last-card', payload: { seat: 0 } });
  });
});
