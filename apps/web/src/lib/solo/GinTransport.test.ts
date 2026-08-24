import { stateHash } from '@parlour/engine';
import { describe, expect, it } from 'vitest';
import { GinTransport } from './GinTransport';

describe('GinTransport', () => {
  it('deals a deterministic match snapshot for a seed', () => {
    const make = () => {
      const t = new GinTransport({
        mode: 'classic',
        botTier: 2,
        seed: 99,
        player: { name: 'You', avatarId: 'ember' },
      });
      return t.getSnapshot();
    };
    const a = make();
    const b = make();
    expect(stateHash(a.session.state)).toBe(stateHash(b.session.state));
    expect(a.players).toHaveLength(2);
    expect(a.players[0]).toMatchObject({ seat: 0, isBot: false });
    expect(a.players[1]?.isBot).toBe(true);
    expect(a.session.state.hand.hands[0]).toHaveLength(10);
    expect(a.session.state.scores).toEqual([0, 0]);
  });

  it('applies preset rule values per mode', () => {
    const quick = new GinTransport({
      mode: 'quick',
      botTier: 1,
      seed: 5,
      player: { name: 'You', avatarId: 'ember' },
    });
    expect(quick.getSnapshot().session.config.matchTarget).toBe(50);
  });

  it('rejects moves outside the local turn without changing state', () => {
    const t = new GinTransport({
      mode: 'classic',
      botTier: 2,
      seed: 11,
      player: { name: 'You', avatarId: 'ember' },
    });
    const outcome = t.dispatch('draw.stock');
    expect(outcome.rejected).not.toBeNull();
    // the non-dealer option phase belongs to the bot; either way nothing moved
    expect(t.getSnapshot().session.log.length).toBeLessThanOrEqual(1);
  });

  it('plays a complete bot-vs-bot-paced match when the human taps along', () => {
    const t = new GinTransport({
      mode: 'quick',
      botTier: 2,
      seed: 77,
      player: { name: 'You', avatarId: 'ember' },
    });
    let guard = 0;
    while (t.getSnapshot().session.status === 'playing' && guard++ < 8000) {
      const actor = t.getSnapshot().session.phase.actor;
      if (actor === null || actor !== 0) {
        // bot seats answer for themselves until the human must act
        const botOutcomes = t.playBotsUntilHuman();
        if (botOutcomes.length === 0) break;
        continue;
      }
      // the human plays whatever is legal first — enough to finish matches
      const legal = t.legalMoves();
      if (legal.length === 0) break;
      const choice =
        legal.find((move) => move.id === 'ready') ??
        legal.find((move) => move.id === 'knock') ??
        legal[0]!;
      const outcome = t.dispatch(choice.id, choice.payload);
      if (outcome.rejected) throw new Error(outcome.rejected.message);
    }
    const final = t.getSnapshot();
    expect(final.session.status).toBe('ended');
    expect(final.matchWinner).not.toBeNull();
    const winner = final.matchWinner!;
    expect(final.session.state.scores[winner]).toBeGreaterThanOrEqual(50);
  });
});
