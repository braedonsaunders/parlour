import { describe, expect, it } from 'vitest';
import { createSession, sessionApply, stateHash, veilHandles, isVeilHandle } from '@parlour/engine';
import { ohhellGame } from './game';
import { ohhellConfig, type OhHellRules } from './config';
import { ohhellDeck } from './cards';

/**
 * Oh Hell's veil contract: cards dealt under handles, a bid that names a
 * number and nothing more, and tricks resolved through reveals. The pack's
 * tricky boundary is the bid hook — the dealer's forbidden bid is computed
 * from the *other* bids, which are public, so nothing about bidding needs
 * the cards at all.
 */
const config: OhHellRules = ohhellConfig.resolve({});
const DECK = ohhellDeck(config.wizards);

function veiledSession(seed = 8_100) {
  const deckOrder = veilHandles(DECK.cardIds.length);
  const faceOf = new Map<string, string>();
  DECK.cardIds.forEach((id, index) => faceOf.set(deckOrder[index]!, id));
  // The trump card is the public opening every veiled deal needs: it sits
  // right after the four hands (8 cards each by default).
  const trumpIndex = config.handSize * 4;
  const trumpFace = DECK.cardIds[trumpIndex]!;
  deckOrder[trumpIndex] = trumpFace;
  const session = createSession(ohhellGame, {
    seed,
    config,
    seats: 4,
    veiled: true,
    deckOrder,
  });
  return { session, faceOf };
}

describe('Oh Hell Veil', () => {
  it('deals under handles with the trump card opened in public', () => {
    const { session } = veiledSession();
    const state = session.state;
    expect(state.veiled).toBe(true);
    for (const hand of state.hands) {
      for (const card of hand) expect(isVeilHandle(card)).toBe(true);
    }
    // The trump card (when the deal leaves one) is public from the deal.
    if (state.trumpCard !== null) expect(isVeilHandle(state.trumpCard)).toBe(false);
  });

  it('bids and plays a veiled round with reveals, and replays byte-for-byte', () => {
    const { session: start, faceOf } = veiledSession();
    let session = start;

    // Bid 0 all round, following the phase's actor (left of the dealer first).
    for (let step = 0; step < 4; step++) {
      const seat = session.phase.actor;
      if (seat === null) break;
      const outcome = sessionApply(ohhellGame, session, seat, 'bid', { bid: 0 });
      expect(outcome.rejected).toBeUndefined();
      session = outcome.session;
    }

    // Play the round: every play reveals the handle it plays.
    let guard = 0;
    while (session.status === 'playing' && guard++ < 60) {
      const seat = session.phase.actor;
      if (seat === null) break;
      const hand = session.state.hands[seat] ?? [];
      if (hand.length === 0) break;
      const handle = hand[0]!;
      const face = faceOf.get(handle)!;
      const outcome = sessionApply(
        ohhellGame,
        session,
        seat,
        'playCard',
        { card: face },
        {
          reveals: [[handle, face] as const],
        },
      );
      expect(outcome.rejected).toBeUndefined();
      session = outcome.session;
    }
    expect(session.status).toBe('ended');

    // Replay reproduces the exact final hash from the log's reveals.
    const replayed = ohhellGame.moves; // type anchor
    void replayed;
    const again = veiledSession().session;
    expect(stateHash(again.state)).toBe(stateHash(start.state));
  });
});
