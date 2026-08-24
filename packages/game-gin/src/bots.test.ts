import { createSession, sessionApply, makeRng } from '@parlour/engine';
import { describe, expect, it } from 'vitest';
import { ginConfigSchema } from './config';
import { createGinHandDef } from './rules';
import {
  GIN_PERSONAS,
  GIN_TIER_BOTS,
  ginTierBot,
  makeGinPersonaBot,
} from './bots';

const def = createGinHandDef();
const DEFAULTS = ginConfigSchema.defaults();

/** Every persona must only ever pick moves the flow actually offered. */
describe('bot legality', () => {
  it('policies choose offered moves across full bot-driven hands', () => {
    for (let game = 0; game < 12; game++) {
      const policies = [GIN_TIER_BOTS[game % 3]!, GIN_TIER_BOTS[(game + 1) % 3]!];
      let session = createSession(def, { seed: 9000 + game, config: DEFAULTS, seats: 2 });
      let guard = 0;
      while (session.status === 'playing' && guard++ < 400) {
        const seat = session.phase.actor;
        if (seat === null) break;
        const legal = def.flow.legalMovesFor!(session.state, session.phase, seat);
        if (!legal || legal.length === 0) break;
        const policy = policies[seat]!;
        const choice = policy.chooseMove(
          def.playerView(session.state, seat),
          seat,
          legal,
          makeRng(1).fork(`${game}:${guard}`),
          { thinkMs: () => 0 },
        );
        expect(choice).not.toBeNull();
        const offered =
          legal.find((move) => move.id === choice!.id) ??
          legal.find((m) => m.id === choice!.id) ??
          null;
        expect(offered).not.toBeNull();
        const outcome = sessionApply(def, session, seat, choice!.id, choice!.payload);
        expect(outcome.rejected).toBeUndefined();
        session = outcome.session;
      }
      expect(session.status).toBe('ended');
    }
  });

  it('every persona completes hands without stalling', () => {
    for (const persona of GIN_PERSONAS) {
      const policy = makeGinPersonaBot(persona.id);
      let session = createSession(def, { seed: 4242, config: DEFAULTS, seats: 2 });
      let guard = 0;
      while (session.status === 'playing' && guard++ < 400) {
        const seat = session.phase.actor;
        if (seat === null) break;
        const legal = def.flow.legalMovesFor!(session.state, session.phase, seat);
        if (!legal || legal.length === 0) break;
        const rival = seat === 0 ? policy : ginTierBot(3);
        const choice =
          rival.chooseMove(def.playerView(session.state, seat), seat, legal, makeRng(7).fork(guard), {
            thinkMs: () => 0,
          }) ?? legal[0]!;
        session = sessionApply(def, session, seat, choice.id, choice.payload).session;
      }
      expect(session.status).toBe('ended');
    }
  });

  it('exposes six personas and three tiers', () => {
    expect(GIN_PERSONAS).toHaveLength(6);
    expect(GIN_TIER_BOTS.map((bot) => bot.tier)).toEqual([1, 2, 3]);
    expect(() => ginTierBot(4 as never)).toThrow();
  });
});
