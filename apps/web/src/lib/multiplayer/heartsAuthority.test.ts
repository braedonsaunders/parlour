import { createSession, stateHash } from '@parlour/engine';
import type { AppliedPacket } from './types';
import { heartsConfigSchema, heartsGame } from '@parlour/game-hearts';
import { describe, expect, it } from 'vitest';
import { EngineAuthority } from './EngineAuthority';
import type { PlayerAction, RoomSettings } from './types';

/**
 * Hearts on the shared P2P authority stack: a host and a guest both hold an
 * EngineAuthority over the same seed. Every host-applied action replays on the
 * guest through applyRemote, and after EVERY move — including the simultaneous
 * pass wall and the final trick — both sides must agree on the log and the
 * state hash. Divergence detection for free, exactly like Wild.
 */

const settings: RoomSettings = {
  gameId: 'hearts',
  seats: 4,
  config: heartsConfigSchema.resolve({ passDirection: 'left' }),
};

function makeAuthority(seed: number) {
  const session = createSession(heartsGame, { seed, config: settings.config, seats: 4 });
  return new EngineAuthority({
    def: heartsGame,
    session,
    settings,
    now: () => 1_000,
  });
}

/** Drives one open-tier hand: bots pick passes, the host plays every card low. */
function actionsFor(seed: number): PlayerAction[] {
  const host = makeAuthority(seed);
  const actions: PlayerAction[] = [];
  let seq = 0;
  let guard = 0;

  const apply = (seat: number, move: string, payload?: unknown) => {
    const action: PlayerAction = { id: `a${seq++}`, seat, move, payload };
    const packet: AppliedPacket = host.apply(action);
    actions.push(action);
    void packet;
  };

  while (host.getSession().status === 'playing' && guard++ < 500) {
    const session = host.getSession();
    const { state, phase } = session;
    if (state.passing) {
      for (const seat of [0, 1, 2, 3]) {
        if (state.selections[seat] !== null) continue;
        const hand = [...(state.hands[seat] ?? [])].sort();
        apply(seat, 'passCards', { cards: [hand[0], hand[1], hand[2]] });
      }
      continue;
    }
    const seat = state.turn;
    const moves = heartsGame.flow.legalMovesFor?.(state, phase, seat) ?? [];
    const cards = moves.flatMap((move) =>
      move.id === 'playCard' && typeof (move.payload as { card?: unknown })?.card === 'string'
        ? [(move.payload as { card: string }).card]
        : [],
    );
    const lowest = cards.sort(
      (a, b) => Number.parseInt(a.slice(1), 10) - Number.parseInt(b.slice(1), 10),
    )[0];
    if (!lowest) break;
    apply(seat, 'playCard', { card: lowest });
  }
  return actions;
}

describe('hearts multiplayer authority', () => {
  it('keeps guest and host logs and state hashes identical after every move', () => {
    for (const seed of [4_001, 4_002, 4_003]) {
      const host = makeAuthority(seed);
      const guest = makeAuthority(seed);
      const actions = actionsFor(seed);
      expect(actions.length).toBeGreaterThan(52); // passes + 52 plays

      let applied = 0;
      for (const action of actions) {
        const packet = host.apply(action);
        const result = guest.applyRemote(packet);
        expect(result.accepted).toBe(true);
        expect(result.stateHash).toBe(packet.stateHash);
        applied += 1;
        // spot-check identity at every tenth move and at the end
        if (applied % 10 === 0) {
          expect(stateHash(guest.getSession().state)).toBe(stateHash(host.getSession().state));
          expect(guest.getSession().log.length).toBe(host.getSession().log.length);
        }
      }
      expect(host.getSession().status).toBe('ended');
      expect(guest.getSession().status).toBe('ended');
      expect(stateHash(guest.getSession().state)).toBe(stateHash(host.getSession().state));
      expect(guest.getSession().result).toEqual(host.getSession().result);
    }
  });

  it('rejects a guest replay whose seq does not extend the log', () => {
    const host = makeAuthority(4_100);
    const guest = makeAuthority(4_100);
    const state = host.getSession().state;
    const hand = [...(state.hands[0] ?? [])].sort();
    const packet = host.apply({
      id: 'a0',
      seat: 0,
      move: 'passCards',
      payload: { cards: [hand[0], hand[1], hand[2]] },
    });
    // a packet claiming a seq the guest has not reached is refused, not guessed
    const guestBefore = stateHash(guest.getSession().state);
    const forged: AppliedPacket = { ...packet, events: [{ ...packet.events[0]!, seq: 5 }] };
    expect(guest.applyRemote(forged).accepted).toBe(false);
    expect(stateHash(guest.getSession().state)).toBe(guestBefore);
  });

  it('exports and imports a resync snapshot that reproduces the host exactly', () => {
    const host = makeAuthority(4_200);
    const guest = makeAuthority(4_200);
    const actions = actionsFor(4_200).slice(0, 30);
    for (const action of actions) {
      guest.applyRemote(host.apply(action));
    }
    const snapshot = host.exportSnapshot();
    const fresh = makeAuthority(4_200);
    fresh.importSnapshot(snapshot);
    expect(stateHash(fresh.getSession().state)).toBe(stateHash(host.getSession().state));
    expect(fresh.getSession().log.length).toBe(host.getSession().log.length);
  });
});
