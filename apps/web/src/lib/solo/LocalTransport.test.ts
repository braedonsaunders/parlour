import { Fx } from '@parlour/engine';
import { describe, expect, it } from 'vitest';
import { LocalTransport } from './LocalTransport';

describe('LocalTransport M2 acceptance', () => {
  it.each(['classic', 'fast', 'timed'] as const)(
    'starts a deterministic, playable %s solo match through the engine',
    (mode) => {
      const transport = new LocalTransport({
        mode,
        seats: 3,
        botTier: 2,
        seed: 31,
        player: { name: 'You', avatarId: 'fox' },
      });

      const initial = transport.getSnapshot();
      expect(initial.mode).toBe(mode);
      expect(initial.players).toHaveLength(3);
      expect(initial.players.slice(1).every((player) => player.isBot)).toBe(true);
      expect(initial.session.phase.actor).toBe(0);
      expect(initial.session.setupFx?.some((event) => event.kind === Fx.DealCard)).toBe(true);
      expect(transport.legalMoves().map((move) => move.id)).toEqual(
        expect.arrayContaining(['draw.stock', 'draw.discard', 'knock']),
      );

      const drawn = transport.dispatch('draw.stock');
      expect(drawn.rejected).toBeNull();
      expect(drawn.fx.some((event) => event.kind === Fx.DrawCard)).toBe(true);
      const discard = transport.legalMoves().find((move) => move.id === 'discard');
      expect(discard).toBeDefined();

      const played = transport.dispatch('discard', discard?.payload);
      expect(played.rejected).toBeNull();
      expect(played.fx.some((event) => event.kind === Fx.DiscardCard)).toBe(true);
      expect(transport.getSnapshot().session.log.length).toBeGreaterThanOrEqual(2);

      const botTurns = transport.playBotsUntilHuman();
      expect(botTurns.length).toBeGreaterThan(0);
      expect(transport.getSnapshot().session.phase.actor).toBe(0);
    },
  );

  it('fails closed when the human sends an illegal action', () => {
    const transport = new LocalTransport({
      mode: 'classic',
      seats: 2,
      botTier: 1,
      seed: 8,
      player: { name: 'You', avatarId: 'fox' },
    });

    const outcome = transport.dispatch('discard', { card: 'not-a-card' });
    expect(outcome.rejected?.code).toBe('illegal-move');
    expect(transport.getSnapshot().session.log).toHaveLength(0);
  });

  it('tracks a human knock once when the round resolves', () => {
    const transport = new LocalTransport({
      mode: 'classic',
      seats: 2,
      botTier: 1,
      seed: 8,
      player: { name: 'You', avatarId: 'ember' },
    });

    expect(transport.dispatch('knock').rejected).toBeNull();
    transport.playBotsUntilHuman();

    const snapshot = transport.getSnapshot();
    expect(snapshot.session.status).toBe('ended');
    expect(snapshot.metrics[0]?.knocks).toBe(1);
    expect(snapshot.metrics[0]?.knockWins).toBe(
      snapshot.session.state.outcome?.winners.includes(0) ? 1 : 0,
    );
  });
});
