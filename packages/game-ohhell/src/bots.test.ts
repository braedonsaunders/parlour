import { describe, expect, it } from 'vitest';
import { makeRng, sessionApply } from '@parlour/engine';
import { TIER_BOTS, profileForTier } from './bots';
import { PERSONAS, makePersonaBot } from './bots/personas';
import { ohhellGame } from './game';
import type { OhHellSession } from './test-util';
import { openSession } from './test-util';

function legalFor(session: OhHellSession) {
  const seat = session.state.turn;
  return ohhellGame.flow.legalMovesFor?.(session.state, session.phase, seat) ?? [];
}

function applyLegal(
  session: OhHellSession,
  move: { id: string; payload?: unknown },
): OhHellSession {
  const outcome = sessionApply(ohhellGame, session, session.state.turn, move.id, move.payload);
  if (outcome.rejected) throw new Error(outcome.rejected.code);
  return outcome.session;
}

describe('bot roster', () => {
  it('ships three distinct tiers and six personas', () => {
    expect(TIER_BOTS.map((bot) => bot.tier)).toEqual([1, 2, 3]);
    expect(PERSONAS.length).toBeGreaterThanOrEqual(6);
    expect(makePersonaBot('otto').persona.name).toBe('Otto');
    expect(profileForTier(3)).not.toEqual(profileForTier(1));
    expect(() => makePersonaBot('nobody')).toThrow(/unknown persona/);
  });

  it('every tier returns a legal move at every decision of a real round', () => {
    for (const bot of TIER_BOTS) {
      let session = openSession({
        seed: bot.tier * 111,
        config: { handArc: 'down', maxHand: 4 },
        seats: 4,
      });
      let guard = 0;
      while (session.status === 'playing') {
        if (guard++ > 200) throw new Error(`${bot.id} never finished the round`);
        const seat = session.state.turn;
        const legal = legalFor(session);
        const choice = bot.chooseMove(
          ohhellGame.playerView(session.state, seat),
          seat,
          legal,
          makeRng(guard * 31 + bot.tier),
          {
            thinkMs: () => 0,
          },
        );
        expect(choice).not.toBeNull();
        const accepted = legal.find(
          (move) =>
            move.id === choice!.id &&
            JSON.stringify(move.payload ?? null) === JSON.stringify(choice!.payload ?? null),
        );
        expect(accepted).toBeDefined();
        session = applyLegal(session, accepted!);
      }
      expect(session.status).toBe('ended');
      expect(session.result).not.toBeNull();
    }
  });

  it('personas keep their own temperament fields', () => {
    const mina = PERSONAS.find((persona) => persona.name === 'Mina')!;
    const bruno = PERSONAS.find((persona) => persona.name === 'Bruno')!;
    expect(mina.profile.bid.aggression).toBeLessThan(bruno.profile.bid.aggression);
    expect(bruno.profile.bid.aggression).toBeGreaterThan(0);
    // the hard personas carry the hook awareness the easy ones lack
    expect(PERSONAS.find((p) => p.name === 'Vega')!.profile.bid.hookAware).toBe(true);
    expect(PERSONAS.find((p) => p.name === 'Pip')!.profile.bid.hookAware).toBe(false);
  });
});
