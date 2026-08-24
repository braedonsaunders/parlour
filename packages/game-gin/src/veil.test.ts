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
import { ginConfigSchema, type GinConfig } from './config';
import type { GinState } from './state';
import { createGinHandDef } from './rules';
import { createGinMatchDef } from './matchGame';

const def = createGinHandDef();
const DEFAULTS = ginConfigSchema.defaults();

function veiled(seats = 2, starter: CardId = 'S2') {
  const deckOrder = veiledDeckOrder(def.veil!, seats, [starter], DEFAULTS);
  return {
    deckOrder,
    session: createSession(def, {
      seed: 21,
      config: DEFAULTS,
      seats,
      veiled: true,
      deckOrder,
    }),
  };
}

/**
 * Drives to seat 0 holding an eleven-card act decision:
 * option passes (forced stock draw for the leader applies inside the log),
 * the leader throws back, seat 0 draws from the stock.
 */
function toElevenCardAct(session: GameSession<GinState, GinConfig>) {
  let current = sessionApply(def, session, 1, 'option.pass', undefined).session;
  current = sessionApply(def, current, 0, 'option.pass', undefined).session;
  // the settle loop auto-applied seat 1's forced stock draw — throw one back
  const throwMove = def.flow.legalMovesFor!(current.state, current.phase, 1).find(
    (move) => move.id === 'discard',
  );
  current = sessionApply(def, current, 1, 'discard', throwMove!.payload).session;
  current = sessionApply(def, current, 0, 'draw.stock', undefined).session;
  return current;
}

const KNOCK_FACES: readonly CardId[] = [
  'S5',
  'S6',
  'S7',
  'S8',
  'H7',
  'H8',
  'H9',
  'D5',
  'D6',
  'D7',
  'C11',
];
const DEFENDER_FACES: readonly CardId[] = [
  'C2',
  'C3',
  'C13',
  'D12',
  'H2',
  'H3',
  'S4',
  'S9',
  'D10',
  'C6',
];

describe('gin under Veil', () => {
  it('deals opaque ten-card hands and one public upcard', () => {
    const { session } = veiled();
    expect(session.state.veiled).toBe(true);
    expect(session.state.hands[0]).toHaveLength(10);
    expect(session.state.hands[0]!.every((card) => card.startsWith('v#'))).toBe(true);
    expect(session.state.hands[1]!.every((card) => card.startsWith('v#'))).toBe(true);
    expect(session.state.stock.every((card) => card.startsWith('v#'))).toBe(true);
    expect(session.state.discard).toEqual(['S2']);
    expect(session.status).toBe('playing');
  });

  it('keeps the knock claim legal by count and honest by validation', () => {
    const { session } = veiled();
    const current = toElevenCardAct(session);

    // a knock with an unopened hand is refused outright
    expect(sessionApply(def, current, 0, 'knock').rejected?.code).toBe('claim-not-opened');

    // opening to a hand above the cap rejects the bluff before the log
    const hand = current.state.hands[0] ?? [];
    const bluffFaces: CardId[] = [
      'C2',
      'D3',
      'H4',
      'S6',
      'D8',
      'C9',
      'H10',
      'S12',
      'D13',
      'C7',
      'H13',
    ];
    const bluff = sessionApply(def, current, 0, 'knock', undefined, {
      reveals: hand.map((h, i) => [h, bluffFaces[i]!] as [CardId, CardId]),
    });
    expect(bluff.rejected?.code).toBe('deadwood-too-high');
    expect(bluff.events).toEqual([]);

    // a true low-deadwood claim settles into the defender reveal
    const claimed = sessionApply(def, current, 0, 'knock', undefined, {
      reveals: hand.map((h, i) => [h, KNOCK_FACES[i]!] as [CardId, CardId]),
    });
    expect(claimed.rejected).toBeUndefined();
    expect(claimed.session.state.knocker).toBe(0);
    expect(claimed.session.phase.phase).toBe('showdown.reveal');
    expect(
      def.flow.legalMovesFor!(claimed.session.state, claimed.session.phase, 1).map((m) => m.id),
    ).toEqual(['showdown.open']);
  });

  it('scores only after both hands come face up, fully revealed', () => {
    const { session } = veiled();
    const current = toElevenCardAct(session);
    const hand = current.state.hands[0] ?? [];
    const claimed = sessionApply(def, current, 0, 'knock', undefined, {
      reveals: hand.map((h, i) => [h, KNOCK_FACES[i]!] as [CardId, CardId]),
    }).session;

    const defenderHand = claimed.state.hands[1] ?? [];
    const opened = sessionApply(def, claimed, 1, 'showdown.open', undefined, {
      reveals: defenderHand.map((h, i) => [h, DEFENDER_FACES[i]!] as [CardId, CardId]),
    });
    expect(opened.rejected).toBeUndefined();
    expect(opened.session.status).toBe('ended');
    // the defender sheds S4/S9 onto the spade run but still trails by plenty
    expect(opened.session.result?.reason).toBe('knock');
    expect(opened.session.result?.winner).toBe(0);
    expect(opened.session.state.hands.flat().some((card) => card.startsWith('v#'))).toBe(false);
  });

  it('refuses knocks for seats that are not acting', () => {
    const { session } = veiled();
    expect(sessionApply(def, session, 0, 'knock').rejected?.code).toBe('not-your-turn');
  });

  it('replays a veiled knock from seed, ceremony order and log alone', () => {
    const { deckOrder, session } = veiled();
    const current = toElevenCardAct(session);
    const hand = current.state.hands[0] ?? [];
    const claimed = sessionApply(def, current, 0, 'knock', undefined, {
      reveals: hand.map((h, i) => [h, KNOCK_FACES[i]!] as [CardId, CardId]),
    }).session;
    const defenderHand = claimed.state.hands[1] ?? [];
    const ended = sessionApply(def, claimed, 1, 'showdown.open', undefined, {
      reveals: defenderHand.map((h, i) => [h, DEFENDER_FACES[i]!] as [CardId, CardId]),
    }).session;

    const replayed = replaySession(def, 21, ended.log, {
      config: DEFAULTS,
      seats: 2,
      veiled: true,
      deckOrder,
    });
    expect(stateHash(replayed.state)).toBe(stateHash(ended.state));
    expect(replayed.result?.reason).toBe('knock');
    expect(replayed.result?.winner).toBe(0);
  });

  it('plays exactly one hand in a veiled match room', () => {
    const matchDef = createGinMatchDef();
    const deckOrder = veiledDeckOrder(matchDef.veil!, 2, ['S2'], DEFAULTS);
    let session = createSession(matchDef, {
      seed: 21,
      config: DEFAULTS,
      seats: 2,
      veiled: true,
      deckOrder,
    });
    session = sessionApply(matchDef, session, 1, 'option.pass').session;
    session = sessionApply(matchDef, session, 0, 'option.pass').session;
    const throwMove = matchDef.flow.legalMovesFor!(session.state, session.phase, 1).find(
      (move) => move.id === 'discard',
    );
    session = sessionApply(matchDef, session, 1, 'discard', throwMove!.payload).session;
    session = sessionApply(matchDef, session, 0, 'draw.stock').session;

    const handles = session.state.hand.hands[0] ?? [];
    session = sessionApply(matchDef, session, 0, 'knock', undefined, {
      reveals: handles.map((h, i) => [h, KNOCK_FACES[i]!] as [CardId, CardId]),
    }).session;
    const defenderHandles = session.state.hand.hands[1] ?? [];
    session = sessionApply(matchDef, session, 1, 'showdown.open', undefined, {
      reveals: defenderHandles.map((h, i) => [h, DEFENDER_FACES[i]!] as [CardId, CardId]),
    }).session;

    // the fold banks the single hand, then the veiled match honestly ends
    expect(session.status).toBe('ended');
    expect(session.result?.winner).not.toBe(null);
    expect(session.state.handIndex).toBe(0);
  });

  it('resolves presets without the removed lock knob', () => {
    const purist = ginConfigSchema.resolve({ bigGin: false });
    expect(purist.bigGin).toBe(false);
    expect(purist.discardLock).toBeUndefined();
  });
});
