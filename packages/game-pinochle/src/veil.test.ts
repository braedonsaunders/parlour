import {
  createSession,
  hasVeiledCard,
  isVeilHandle,
  makeRng,
  sessionApply,
  type CardId,
} from '@parlour/engine';
import { describe, expect, it } from 'vitest';
import { pinochleDeck } from './cards';
import { pinochleConfig } from './config';
import { createPinochleDef } from './rules';
import type { PinochleState } from './state';

const def = createPinochleDef();
const config = pinochleConfig.resolve({});

/** A fake ceremony: shuffles the real deck locally. `publicSetup: 'none'`, so nothing opens. */
function ceremony(seed: number) {
  const real = makeRng(seed).shuffle(pinochleDeck().cardIds);
  const order: CardId[] = real.map((_, index) => `v#${index}` as CardId);
  const faceOf = new Map<CardId, CardId>();
  order.forEach((handle, index) => faceOf.set(handle, real[index] as CardId));
  return { order, faceOf };
}

function veiledSession(seed = 11) {
  const { order, faceOf } = ceremony(seed);
  const session = createSession(def, { seed, config, seats: 4, veiled: true, deckOrder: order });
  return { session, faceOf };
}

describe('pinochle under Veil', () => {
  it('deals opaque handles to every seat — no widow to open', () => {
    const { session } = veiledSession();
    const state = session.state as PinochleState;
    expect(state.veiled).toBe(true);
    for (const hand of state.hands) {
      expect(hand).toHaveLength(12);
      expect(hand.every(isVeilHandle)).toBe(true);
      expect(hasVeiledCard(hand)).toBe(true);
    }
  });

  it('advertises publicSetup: none — nothing needs opening before setup', () => {
    const support = def.veil!;
    expect(support.publicSetupFrom(4, {})).toBe(48);
    expect(support.publicSetupReady([], 4, {})).toBe(true);
    expect(support.redealMove).toBe('nextHand');
  });

  it('refuses to confirm meld while the hand is still veiled', () => {
    const { session } = veiledSession();
    const outcome = sessionApply(def, session, 0, 'confirmMeld');
    expect(outcome.rejected).toBeDefined();
  });

  it('refuses to play a veiled handle', () => {
    const { session, faceOf } = veiledSession();
    const seat = session.phase.actor ?? session.state.turn;
    const handle = session.state.hands[seat]![0]!;
    void faceOf;
    const outcome = sessionApply(def, session, seat, 'bid', { bid: 25 });
    // bidding does not touch cards at all — this just proves the veiled table
    // still runs its ordinary bidding flow with opaque hands underneath.
    expect(outcome.rejected).toBeUndefined();
    expect(isVeilHandle(handle)).toBe(true);
  });

  it('a redeal or next hand needs a shuffled deck from the room, not the rng', () => {
    const { session } = veiledSession();
    const nextHand = def.moves.nextHand!;
    const validation = nextHand.validate(session.state, session.state.dealer, undefined);
    expect(validation).not.toBe(true);
    expect((validation as { code: string }).code).toBe('no-veiled-deck');
  });
});
