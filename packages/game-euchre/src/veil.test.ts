import {
  createSession,
  hasVeiledCard,
  isVeilHandle,
  makeRng,
  replaySession,
  sessionApply,
  sessionInject,
  stateHash,
  veiledDeckOrder,
  type CardId,
} from '@parlour/engine';
import { describe, expect, it } from 'vitest';
import { euchreConfig } from './config';
import { euchreDeck } from './deck';
import { createEuchreDef } from './rules';
import type { EuchreState } from './state';

const def = createEuchreDef();
const config = euchreConfig.resolve({});

/** A fake ceremony: shuffles the real deck locally, opens one card publicly. */
function ceremony(seed: number, epoch: number) {
  const real = makeRng(seed).shuffle(euchreDeck().cardIds);
  const openedIndex = 20;
  const order = veiledDeckOrder(def.veil!, 4, [real[openedIndex] as CardId]);
  const faceOf = new Map<CardId, CardId>();
  order.forEach((handle, index) => {
    if (isVeilHandle(handle)) faceOf.set(handle, real[index] as CardId);
  });
  void epoch;
  return { order, faceOf, opened: real[openedIndex] as CardId };
}

/** Ceremony for hand N+1: fresh handle epoch so spent handles can't be recycled. */
function ceremonyEpoch(seed: number, handNo: number) {
  const real = makeRng(seed).shuffle(euchreDeck().cardIds);
  const openedIndex = 20;
  const base = Number(handNo);
  const order: CardId[] = Array.from({ length: 24 }, (_, index) =>
    index === openedIndex ? (real[index] as CardId) : (`v#${base * 24 + index}` as CardId),
  );
  const faceOf = new Map<CardId, CardId>();
  order.forEach((id, index) => {
    if (isVeilHandle(id)) faceOf.set(id, real[index] as CardId);
  });
  return { order, faceOf, opened: real[openedIndex] as CardId };
}

function veiledSession(seed = 11) {
  const { order, faceOf } = ceremony(seed, 0);
  const session = createSession(def, {
    seed,
    config,
    seats: 4,
    veiled: true,
    deckOrder: order,
  });
  return { session, order, faceOf };
}

describe('euchre under Veil', () => {
  it('deals opaque handles everywhere except the publicly opened upcard', () => {
    const { session, order } = veiledSession();
    const state = session.state as EuchreState;
    expect(state.veiled).toBe(true);
    expect(state.upcard).toBe(order[20]);
    expect(isVeilHandle(state.upcard)).toBe(false);
    for (const hand of state.hands) {
      expect(hand).toHaveLength(5);
      expect(hand.every(isVeilHandle)).toBe(true);
      expect(hasVeiledCard(hand)).toBe(true);
    }
    // kitty[0] is the publicly opened upcard; the rest stay hidden
    expect(state.kitty[0]).toBe(state.upcard);
    expect(state.kitty.slice(1).every(isVeilHandle)).toBe(true);
  });

  it('exposes exactly one public setup opening from deck position 20', () => {
    const support = def.veil!;
    expect(support.publicSetupFrom(4, {})).toBe(20);
    expect(support.publicSetupReady([], 4, {})).toBe(false);
    expect(support.publicSetupReady(['S13'], 4, {})).toBe(true);
  });

  it('refuses to play an unopened handle once tricks begin', () => {
    const { session } = veiledSession();
    let current = session;
    current = sessionApply(def, current, current.phase.actor!, 'orderUp', { alone: false })
      .session;
    current = sessionApply(def, current, 0, 'dealerDiscard', {
      card: (current.state as EuchreState).hands[0]!.at(-1)!,
    }).session;
    const seat = current.phase.actor!;
    const outcome = sessionApply(def, current, seat, 'playCard', {
      card: (current.state as EuchreState).hands[seat]![0],
    });
    expect(outcome.rejected?.code).toBe('card-still-veiled');
  });

  it('lets the dealer bury a handle without opening it — the kitty stays dark', () => {
    const { session } = veiledSession();
    let current = session;
    current = sessionApply(def, current, current.phase.actor!, 'orderUp', { alone: false })
      .session;
    const buriedHandle = (current.state as EuchreState).hands[0]![0]!;
    expect(isVeilHandle(buriedHandle)).toBe(true);
    const outcome = sessionApply(def, current, 0, 'dealerDiscard', { card: buriedHandle });
    expect(outcome.rejected).toBeUndefined();
    expect((outcome.session.state as EuchreState).hands[0]).toHaveLength(5);
    expect((outcome.session.state as EuchreState).kitty.some(isVeilHandle)).toBe(true);
  });

  it('opens a played card via reveals, then judges the trick on real faces', () => {
    const seed = 23;
    const { session, faceOf } = veiledSession(seed);
    let current = session;
    // order the upcard up so tricks begin
    const orderOutcome = sessionApply(def, current, current.phase.actor!, 'orderUp', {
      alone: false,
    });
    expect(orderOutcome.rejected).toBeUndefined();
    current = orderOutcome.session;
    const dealerHand = (current.state as EuchreState).hands[0]!;
    const bury = dealerHand.at(-1)!;
    const buried = sessionApply(def, current, 0, 'dealerDiscard', { card: bury });
    expect(buried.rejected).toBeUndefined();
    current = buried.session;

    // every play carries its opening; the engine validates on the real face
    while ((current.state as EuchreState).stage === 'playing') {
      const seat = current.phase.actor!;
      const hand = (current.state as EuchreState).hands[seat]!;
      const handle = hand[0]!;
      const face = faceOf.get(handle)!;
      const outcome = sessionApply(def, current, seat, 'playCard', { card: face }, {
        reveals: [[handle, face]],
      });
      expect(outcome.rejected).toBeUndefined();
      current = outcome.session;
      const trick = (current.state as EuchreState).trick;
      if (trick.length > 0) expect(trick.some((play) => play.card === face)).toBe(true);
      if (current.status !== 'playing') break;
    }
    expect((current.state as EuchreState).tricksPlayed).toBeGreaterThanOrEqual(1);
  });

  it('parks at hand-over until the room injects the next ceremony order', () => {
    const seed = 77;
    const { session, faceOf } = veiledSession(seed);
    let current = session;

    const finishHand = () => {
      const orderOutcome = sessionApply(def, current, current.phase.actor!, 'orderUp', {
        alone: false,
      });
      current = orderOutcome.session;
      const dealerHand = (current.state as EuchreState).hands[0]!;
      current = sessionApply(def, current, 0, 'dealerDiscard', {
        card: dealerHand.at(-1)!,
      }).session;
      let guard = 0;
      while ((current.state as EuchreState).stage === 'playing' && guard++ < 40) {
        const seat = current.phase.actor!;
        const handle = (current.state as EuchreState).hands[seat]![0]!;
        const face = faceOf.get(handle)!;
        const outcome = sessionApply(
          def,
          current,
          seat,
          'playCard',
          { card: face },
          { reveals: [[handle, face]] },
        );
        expect(outcome.rejected).toBeUndefined();
        current = outcome.session;
      }
    };
    finishHand();

    const parked = current;
    expect(parked.state.stage).toBe('hand-over');
    expect(parked.phase.actor).toBeNull();

    // open rooms deal themselves; veiled rooms refuse nothing but wait
    const premature = sessionInject(def, parked, 'euchre.hand.order', {});
    expect(premature.rejected?.code).toBe('bad-injection');

    // a stale ceremony (old handles) is refused
    const staleOrder = ceremony(seed, 0).order;
    const stale = sessionInject(def, parked, 'euchre.hand.order', { deckOrder: staleOrder });
    expect(stale.rejected?.code).toBe('stale-handles');

    // a fresh ceremony mints the NEXT handle epoch (indexes >= 24 * handNo)
    const next = ceremonyEpoch(seed + 1, 1);
    const dealt = sessionInject(def, parked, 'euchre.hand.order', { deckOrder: next.order });
    expect(dealt.rejected).toBeUndefined();
    const nextState = dealt.session.state as EuchreState;
    expect(nextState.handNo).toBe(2);
    expect(nextState.dealer).toBe(1);
    expect(nextState.upcard).toBe(next.opened);
    expect(nextState.hands.flat().every(isVeilHandle)).toBe(true);
    expect(nextState.scores).toEqual((parked.state as EuchreState).scores);

    // replay reproduces the veiled round bit-for-bit, injections included
    const log = dealt.session.log;
    const replayed = replaySession(def, seed, log, { config, seats: 4, veiled: true, deckOrder: veiledSession(seed).order });
    expect(stateHash(replayed.state)).toBe(stateHash(dealt.session.state));
  });
});
