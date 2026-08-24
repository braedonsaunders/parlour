import { createSession, stateHash, type LegalMove } from '@parlour/engine';
import {
  cribbageConfigSchema,
  createCribbageDef,
  type CribbageConfig,
  type CribbageState,
} from '@parlour/game-cribbage';
import { describe, expect, it } from 'vitest';
import { EngineAuthority } from './EngineAuthority';
import type { RoomSettings } from './types';

const def = createCribbageDef();
const config = cribbageConfigSchema.defaults();
const settings: RoomSettings = { gameId: 'cribbage', seats: 2, config, security: 'open' };

function authority(seed: number) {
  return new EngineAuthority<CribbageState, CribbageConfig>({
    def,
    session: createSession(def, { seed, config, seats: 2 }),
    settings,
    now: () => 10_000,
  });
}

function nextAction(session: ReturnType<ReturnType<typeof authority>['getSession']>): {
  seat: number;
  move: LegalMove;
} {
  for (const seat of session.phase.actors ?? [session.phase.actor]) {
    if (seat === null || seat === undefined) continue;
    const legal =
      def.flow.legalMovesFor?.(session.state, session.phase, seat) ??
      (session.phase.actor === seat ? def.flow.legalMoves(session.state, session.phase) : []);
    if (legal.length > 0) return { seat, move: legal[0]! };
  }
  throw new Error(`no actor in ${session.phase.phase}`);
}

describe('Cribbage multiplayer replay parity', () => {
  it('keeps host and guest logs and state hashes identical after every move', () => {
    const host = authority(915);
    const guest = authority(915);

    for (let index = 0; index < 24; index++) {
      const action = nextAction(host.getSession());
      const packet = host.apply({
        id: `cribbage:${index}`,
        seat: action.seat,
        move: action.move.id,
        payload: action.move.payload,
      });
      const accepted = guest.applyRemote(packet);

      expect(accepted.accepted).toBe(true);
      expect(accepted.stateHash).toBe(packet.stateHash);
      expect(stateHash(guest.getSession().state)).toBe(stateHash(host.getSession().state));
      expect(guest.getSession().log).toEqual(host.getSession().log);
    }

    expect(host.getSession().state.dealNo).toBeGreaterThanOrEqual(1);
    expect(guest.exportSnapshot()).toEqual(host.exportSnapshot());
  });
});
