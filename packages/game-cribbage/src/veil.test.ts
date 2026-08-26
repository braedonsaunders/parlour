import { describe, expect, it } from 'vitest';
import {
  createSession,
  sessionApply,
  sessionInject,
  stdDeck,
  veilHandles,
  isVeilHandle,
} from '@parlour/engine';
import { createCribbageDef } from './index';
import { cardValue } from './cards';
import type { CribbageState } from './state';

/**
 * Cribbage's veil contract: six cards a seat under handles, the crib dark
 * until the show, and the show phase refusing to score anything a reveal
 * has not opened. The tricky boundary cribbage has that most packs do not is
 * `deal.next` — a veiled match spans many deals, so the redeal must come out
 * of a fresh ceremony rather than the session rng.
 *
 * The strategy: drive a full deal through the engine's own legal moves,
 * supplying each handle's face as a reveal the moment it becomes public —
 * exactly what the room's peel chain does — and assert the engine never
 * rejects.
 */

const DECK_IDS = stdDeck().cardIds;

/** A veiled session whose handle→face map the test controls. */
function veiledSession(seed = 8_000) {
  const def = createCribbageDef();
  const deckOrder = veilHandles(DECK_IDS.length);
  const faceOf = new Map<string, string>();
  DECK_IDS.forEach((id, index) => faceOf.set(deckOrder[index]!, id));
  const session = createSession(def, {
    seed,
    config: def.configSchema.resolve({}),
    seats: 2,
    veiled: true,
    deckOrder,
  });
  return { def, session, faceOf };
}

describe('Cribbage Veil', () => {
  it('a veiled deal leaves every dealt card a handle and the starter dark', () => {
    const { session } = veiledSession();
    const state = session.state;
    expect(state.veiled).toBe(true);
    for (const hand of state.hands) {
      for (const card of hand) expect(isVeilHandle(card)).toBe(true);
    }
    for (const card of state.crib) expect(isVeilHandle(card)).toBe(true);
    expect(state.starter).toBeNull();
  });

  it('plays a full veiled deal end-to-end: discard, cut, peg, reveal, score', () => {
    const { def, faceOf } = veiledSession(9_001);
    let session = veiledSession(9_001).session;

    const open = (
      seat: number,
      moveId: string,
      payload: unknown,
      known?: readonly (readonly [string, string])[],
    ) => {
      // The payload may name real cards (the driving client knows its own
      // faces); pair each one with the handle that holds it in this state.
      const cards = payloadCards(payload);
      const reveals: [string, string][] = [];
      for (const face of cards) {
        const handle = handleHolding(session.state, seat, face, faceOf);
        if (handle) reveals.push([handle, face]);
      }
      for (const pair of known ?? []) reveals.push(pair as [string, string]);
      const outcome = sessionApply(def, session, seat, moveId, payload, {
        reveals: reveals as readonly (readonly [string, string])[],
      });
      if (outcome.rejected) throw new Error(`${moveId} rejected: ${outcome.rejected.code}`);
      session = outcome.session;
    };

    // 1. Both seats throw two to the crib (reveals pair the handle for each face).
    for (const seat of [0, 1]) {
      const hand = session.state.hands[seat] ?? [];
      const throwTwo = hand.slice(0, 2).map((h) => faceOf.get(h)!);
      open(seat, 'crib.discard', { cards: throwTwo });
    }
    // 2. Dealer cuts — the cut move reveals the starter it turns.
    const dealer = session.state.dealer;
    const starterHandle = session.state.stock[0]!;
    open(dealer, 'cut', undefined, [[starterHandle, faceOf.get(starterHandle)!]]);
    // 3. Peg until the show: the driver resolves its own hand and plays the
    // first card that fits, the way a real client does — the bare `playCard`
    // enumeration under veil carries no payload, so the choice is the
    // client's, not the list's.
    let guard = 0;
    while (!session.state.showDone && guard++ < 100) {
      const actor = session.state.pegging.turn;
      if (actor === null) break;
      const hand = session.state.hands[actor] ?? [];
      if (hand.length === 0) {
        open(
          actor,
          'go',
          undefined,
          hand.map((h) => [h, faceOf.get(h)!] as [string, string]),
        );
        continue;
      }
      const count = session.state.pegging.count;
      const playable = hand.find((h) => cardValueOf(h, faceOf) + count <= 31);
      if (playable) {
        open(actor, 'playCard', { card: faceOfCard(playable, faceOf) });
      } else {
        open(
          actor,
          'go',
          undefined,
          hand.filter((h) => isVeilHandle(h)).map((h) => [h, faceOf.get(h)!] as [string, string]),
        );
      }
    }
    // 4. The show: whoever the reveal phase names opens their hand through
    // show.open; the crib opens through crib.open; only then does the engine
    // score it.
    let guard2 = 0;
    while (session.phase.phase === 'show.reveal' && guard2++ < 10) {
      const actors = session.phase.actors ?? [];
      const seat = actors[0] ?? session.state.dealer;
      const hand = session.state.hands[seat] ?? [];
      if (hand.some(isVeilHandle)) {
        const pairs = hand.filter(isVeilHandle).map((h) => [h, faceOf.get(h)!] as [string, string]);
        open(seat, 'show.open', undefined, pairs);
      } else if (session.state.crib.some(isVeilHandle)) {
        const pairs = session.state.crib
          .filter(isVeilHandle)
          .map((h) => [h, faceOf.get(h)!] as [string, string]);
        open(session.state.dealer, 'crib.open', undefined, pairs);
      } else {
        break;
      }
    }

    // show.score is automatic — the flow emits it once everything is open.
    expect(session.state.showDone).toBe(true);
    expect(session.log.some((event) => event.move === 'show.score')).toBe(true);

    // 5. A veiled match's next deal must wait for a fresh ceremony — the
    // host injects deal.next, and without a ceremony-produced deck it
    // refuses with the pending code rather than dealing.
    if (session.status === 'playing') {
      const next = sessionInject(def, session, 'deal.next', undefined);
      expect(next.rejected).toBeDefined();
      expect(next.rejected!.code).toBe('no-veiled-deck');
    }
  });

  it('reveals land in the log so a veiled round replays byte-for-byte', () => {
    const { def, faceOf } = veiledSession(9_001);
    let session = veiledSession(9_001).session;
    const open = (
      seat: number,
      moveId: string,
      payload: unknown,
      known?: readonly (readonly [string, string])[],
    ) => {
      const cards = payloadCards(payload);
      const reveals: [string, string][] = [];
      for (const face of cards) {
        const handle = handleHolding(session.state, seat, face, faceOf);
        if (handle) reveals.push([handle, face]);
      }
      for (const pair of known ?? []) reveals.push(pair as [string, string]);
      const outcome = sessionApply(def, session, seat, moveId, payload, {
        reveals: reveals as readonly (readonly [string, string])[],
      });
      if (outcome.rejected) throw new Error(`${moveId} rejected: ${outcome.rejected.code}`);
      session = outcome.session;
    };
    for (const seat of [0, 1]) {
      const hand = session.state.hands[seat] ?? [];
      open(seat, 'crib.discard', { cards: hand.slice(0, 2).map((h) => faceOf.get(h)!) });
    }
    open(session.state.dealer, 'cut', undefined, [
      [session.state.stock[0]!, faceOf.get(session.state.stock[0]!)!],
    ]);
    const withReveals = session.log.filter((event) => event.reveals && event.reveals.length > 0);
    expect(withReveals.length).toBeGreaterThan(0);
  });
});

/** A card's face under either spelling: handles resolve, real ids stand. */
function faceOfCard(card: string, faceOf: Map<string, string>): string {
  return isVeilHandle(card) ? (faceOf.get(card) ?? card) : card;
}

/** Value as the pegging count reads it; the driver knows its own faces. */
function cardValueOf(card: string, faceOf: Map<string, string>): number {
  return cardValue(faceOfCard(card, faceOf) as never);
}

function payloadCards(payload: unknown): string[] {
  const value = payload as { card?: unknown; cards?: unknown } | undefined;
  const out: string[] = [];
  if (typeof value?.card === 'string') out.push(value.card);
  if (Array.isArray(value?.cards)) {
    for (const card of value.cards) if (typeof card === 'string') out.push(card);
  }
  return out;
}

/** The handle in `seat`'s hand or the crib that the reveal would open. */
function handleHolding(
  state: CribbageState,
  seat: number,
  face: string,
  faceOf: Map<string, string>,
): string | null {
  const search = (cards: readonly string[]) =>
    cards.find((card) => isVeilHandle(card) && faceOf.get(card) === face);
  return (
    search(state.hands[seat] ?? []) ??
    search(state.crib) ??
    search(state.stock as readonly string[]) ??
    null
  );
}
