import {
  createSession,
  replaySession,
  sessionApply,
  stateHash,
  veiledDeckOrder,
  type CardId,
  type GameSession,
} from '@parlour/engine';
import { describe, expect, it } from 'vitest';
import { presidentConfig } from './config';
import { giftCountFor, presidentGame, roleFor, MIN_SEATS, orderOf } from './game';
import type { PresidentRules, PresidentState } from './index';

const DEFAULTS = presidentConfig.defaults();

type Session = GameSession<PresidentState, PresidentRules>;

/** A veiled room: the ceremony order is opaque handles for the whole deck. */
function veiled(seats = MIN_SEATS) {
  const deckOrder = veiledDeckOrder(presidentGame.veil!, seats, [], DEFAULTS);
  const session = createSession(presidentGame, {
    seed: 21,
    config: DEFAULTS,
    seats,
    veiled: true,
    deckOrder,
  });
  return { deckOrder, session };
}

/** Maps a seat's handles to deterministic real faces so moves can open them. */
function revealPlan(
  session: Session,
  seat: number,
  cards: readonly CardId[],
): readonly [CardId, CardId][] {
  const hand = session.state.hands[seat] ?? [];
  return cards.map((card, index) => [hand[index] as CardId, card] as [CardId, CardId]);
}

describe('president under Veil', () => {
  it('deals opaque hands to every seat', () => {
    const { session } = veiled(5);
    expect(session.state.hands.every((hand) => hand.every((card) => card.startsWith('v#')))).toBe(
      true,
    );
    const total = session.state.hands.reduce((sum, hand) => sum + hand.length, 0);
    expect(total).toBe(52);
    expect(session.status).toBe('playing');
  });

  it('keeps the open-room deal untouched when Veil is off', () => {
    const open = createSession(presidentGame, { seed: 21, config: DEFAULTS, seats: 4 });
    expect(open.state.hands.flat().every((card) => !card.startsWith('v#'))).toBe(true);
  });

  it('plays an opened set through the ordinary move with meta reveals', () => {
    const { session, deckOrder } = veiled();
    const leader = session.state.turn!;
    const plan = revealPlan(session, leader, ['S3', 'H3']);
    const [first, second] = plan;
    const outcome = sessionApply(
      presidentGame,
      session,
      leader,
      'playSet',
      {
        cards: [second![1], first![1]],
      },
      {
        reveals: plan,
      },
    );
    expect(outcome.rejected).toBeUndefined();
    const next = outcome.session!;
    // the pile holds the real faces; the rest of the hand stays veiled
    expect(next.state.pile.slice(0, 2).sort()).toEqual(['H3', 'S3']);
    expect(next.state.hands[leader]!.every((card) => card.startsWith('v#'))).toBe(true);
    // and the log replays to the same hash
    const replayed = replaySession(presidentGame, 21, next.log, {
      config: DEFAULTS,
      seats: MIN_SEATS,
      veiled: true,
      deckOrder,
    });
    expect(stateHash(replayed.state)).toBe(next.log[next.log.length - 1]!.hash);
  });

  it('rejects a play whose payload was never opened instead of crashing', () => {
    const { session } = veiled();
    const leader = session.state.turn!;
    const outcome = sessionApply(presidentGame, session, leader, 'playSet', { cards: ['S3'] });
    expect(outcome.rejected?.code).toBe('illegal-move');
  });

  it('enumerates no face-dependent sets for a seat that has not resolved its hand', () => {
    const { session } = veiled();
    const leader = session.state.turn!;
    const legal = presidentGame.flow.legalMovesFor!(session.state, session.phase, leader);
    // handles carry no rank, so nothing is enumerated — the client enumerates
    // against its locally resolved view in real rooms
    expect(legal.filter((move) => move.id === 'playSet')).toEqual([]);
  });

  it('runs the exchange under Veil by opening gifted cards', () => {
    let { session } = veiled(4);
    // deterministic supply of every real face, lowest-first
    const queue: CardId[] = ['D', 'C', 'H', 'S'].flatMap((suit) =>
      [3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 1, 2].map((rank) => `${suit}${rank}` as CardId),
    );
    /** Lazily mints a unique unseen face for a handle, respecting a floor rank. */
    const mint = new Map<CardId, CardId>();
    const faceFor = (handle: CardId, minRank: number): CardId | null => {
      const known = mint.get(handle);
      if (known) return known;
      const taken = new Set([...mint.values()]);
      for (const candidate of queue) {
        if (taken.has(candidate)) continue;
        if (orderOf(candidate) < minRank) continue;
        mint.set(handle, candidate);
        return candidate;
      }
      return null;
    };

    let guard = 0;
    while (session.state.lastOrder === null && guard++ < 3000) {
      const actor = session.phase.actor!;
      const state = session.state;

      // exchange moves
      if (state.awaitingReturn?.seat === actor || state.awaitingGive.includes(actor)) {
        const giving = state.awaitingGive.includes(actor);
        const count = giving
          ? giftCountFor(roleFor(state.lastOrder!, actor) ?? 'neutral')
          : (state.awaitingReturn?.count ?? 1);
        const hand = state.hands[actor] ?? [];
        const picks: CardId[] = [];
        const reveals: [CardId, CardId][] = [];
        for (const held of hand) {
          if (picks.length >= count) break;
          const face = faceFor(held, 3);
          if (!face || picks.includes(face)) continue;
          picks.push(face);
          if (held !== face) reveals.push([held, face]);
        }
        const outcome = sessionApply(
          presidentGame,
          session,
          actor,
          giving ? 'giveCards' : 'returnCards',
          { cards: picks },
          { reveals },
        );
        if (outcome.rejected) throw new Error(`${outcome.rejected.message}`);
        session = outcome.session!;
        continue;
      }

      // plays and passes
      const standing = state.standing;
      const size = standing ? standing.cards.length : 1;
      const minRank = standing ? standing.rank + 1 : 3;
      const hand = state.hands[actor] ?? [];
      const picks: CardId[] = [];
      const reveals: [CardId, CardId][] = [];
      for (const held of hand) {
        if (picks.length >= size) break;
        const face = faceFor(held, minRank);
        if (!face || picks.includes(face)) continue;
        picks.push(face);
        if (held !== face) reveals.push([held, face]);
      }
      if (picks.length < size) {
        if (!standing) throw new Error('blind leader could not open');
        const passOutcome = sessionApply(presidentGame, session, actor, 'pass');
        if (passOutcome.rejected) throw new Error(`pass: ${passOutcome.rejected.message}`);
        session = passOutcome.session!;
        continue;
      }
      const outcome = sessionApply(
        presidentGame,
        session,
        actor,
        'playSet',
        { cards: picks },
        {
          reveals,
        },
      );
      if (outcome.rejected) throw new Error(`playSet: ${outcome.rejected.message}`);
      session = outcome.session!;
    }
    expect(session.state.lastOrder).not.toBeNull();
    expect(session.state.deal).toBe(1);
    // the deal reshuffled conserved ids — every card is an opaque handle or a
    // face the driver deliberately opened; privacy held through the transition
    const openedFaces = new Set([...mint.values()]);
    const offenders = session.state.hands
      .flat()
      .filter((card) => !card.startsWith('v#') && !openedFaces.has(card));
    expect(offenders).toEqual([]);
    expect(openedFaces.size).toBeGreaterThan(0);
  }, 30_000);

  it('hashes identically across peers while veiled', () => {
    const { session } = veiled();
    const leader = session.state.turn!;
    const plan = revealPlan(session, leader, ['S7']);
    const [, face] = plan[0]!;
    const host = sessionApply(
      presidentGame,
      session,
      leader,
      'playSet',
      { cards: [face!] },
      {
        reveals: plan,
      },
    ).session!;
    const guest = createSession(presidentGame, {
      seed: 21,
      config: DEFAULTS,
      seats: MIN_SEATS,
      veiled: true,
      deckOrder: veiledDeckOrder(presidentGame.veil!, MIN_SEATS, [], DEFAULTS),
    });
    const guestApplied = sessionApply(
      presidentGame,
      guest,
      leader,
      'playSet',
      { cards: [face!] },
      {
        reveals: plan,
      },
    ).session!;
    expect(guestApplied.lastAppliedHash).toBe(host.log[host.log.length - 1]!.hash);
    expect(stateHash(guestApplied.state)).toBe(stateHash(host.state));
  });
});
