import { createSession, isActingSeat, veiledDeckOrder } from '@parlour/engine';
import { blitzConfigSchema, createBlitzDef } from '@parlour/game-blitz';
import { describe, expect, it } from 'vitest';
import { isBlitzTurn } from './blitz';

/**
 * The report: in a friend room every player was shown the "Your turn" whisper,
 * the piles ring and the lit hand for the whole match, whoever was actually to
 * play. A veiled round is the cause — it widens `phase.actors` to every live
 * seat so that anybody can claim a blitz nobody else can see.
 */
describe('isBlitzTurn', () => {
  const def = createBlitzDef();
  const config = blitzConfigSchema.defaults();
  const session = createSession(def, {
    seed: 21,
    config,
    seats: 3,
    veiled: true,
    deckOrder: veiledDeckOrder(def.veil!, 3, ['S2'], config),
  });

  it('gives the turn to one seat even when every seat may act', () => {
    const { phase } = session;
    const actor = phase.actor ?? 0;
    const other = [0, 1, 2].find((seat) => seat !== actor) ?? 1;

    expect(isActingSeat(phase, other), 'every seat may claim under Veil').toBe(true);
    expect(isBlitzTurn(phase, actor)).toBe(true);
    expect(isBlitzTurn(phase, other)).toBe(false);
  });

  it('gives it to nobody while the room is opening hands for the showdown', () => {
    expect(isBlitzTurn({ phase: 'showdown.reveal', actor: 0, actors: [0, 1], round: 1 }, 0)).toBe(
      false,
    );
  });
});
