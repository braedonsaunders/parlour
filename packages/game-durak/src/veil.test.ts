import {
  createFx,
  createSession,
  isVeilHandle,
  veiledDeckOrder,
  veilHandle,
  type CardId,
} from '@parlour/engine';
import { describe, expect, it } from 'vitest';
import { canAttack, canDefend, canTransfer, resolveBout } from './round';
import { durakConfig, type DurakRules } from './config';
import { createDurakDef } from './game';
import { state } from './test-util';
import type { DurakState } from './state';

const GAME = createDurakDef();
const DEFAULTS: DurakRules = durakConfig.resolve({});
const SEATS = 3;

/** Any single card works as Durak's trump indicator — no rank is illegal to open. */
function openedTrump(): CardId[] {
  return ['H8'];
}

function veiledSession() {
  const opened = openedTrump();
  const deckOrder = veiledDeckOrder(GAME.veil!, SEATS, opened, DEFAULTS);
  return {
    opened,
    deckOrder,
    session: createSession(GAME, {
      seed: 71,
      config: DEFAULTS,
      seats: SEATS,
      veiled: true,
      deckOrder,
    }),
  };
}

describe('a veiled durak hand', () => {
  it('deals handles from the ceremony order and opens only the trump card', () => {
    const { session, deckOrder, opened } = veiledSession();
    expect(session.state.veiled).toBe(true);

    for (let seat = 0; seat < SEATS; seat++) {
      const hand = session.state.hands[seat] ?? [];
      expect(hand).toHaveLength(DEFAULTS.refillTo);
      expect(hand.every(isVeilHandle), `seat ${seat} hand is handles`).toBe(true);
      expect(hand.every((card) => deckOrder.includes(card))).toBe(true);
    }

    expect(session.state.trumpCard).toBe(opened[0]);
    expect(isVeilHandle(session.state.trumpCard)).toBe(false);
    // The trump card rides at the bottom of the stock, exactly as an open room deals it.
    expect(session.state.stock.at(-1)).toBe(opened[0]);
    expect(session.state.stock.slice(0, -1).every(isVeilHandle)).toBe(true);
  });

  it('never needs a redeal — one durak hand is the whole match', () => {
    expect(GAME.veil!.redealMove).toBeUndefined();
  });

  it('settles from hand length alone — a hand can go out without ever being opened', () => {
    const { session } = veiledSession();
    const handles = session.state.hands;
    const nearEnd: DurakState = {
      ...session.state,
      stock: [],
      attacker: 0,
      defender: 1,
      table: [{ attack: handles[1]![0]!, defend: handles[1]![1]! }],
      hands: handles.map((hand, seat) => (seat === 0 ? [] : seat === 1 ? hand.slice(2) : hand)),
    };
    const resolved = resolveBout(nearEnd, false, createFx());
    // Seat 0's hand emptied and the stock is spent — it is out, without this
    // check ever having to learn a single face behind seat 0's handles.
    expect(resolved.out).toEqual([0]);
    expect(resolved.outcome).toBeNull();
  });

  it('treats an unopened handle as unplayable, defensively, even if it reaches a move', () => {
    const handle = veilHandle(3);
    const attacking = state({
      hands: [[handle], ['H6', 'H7']],
      trumpCard: 'H8',
      attacker: 0,
      defender: 1,
      attackers: [0],
    });
    expect(canAttack(attacking, 0, handle)).toBe(false);

    const defending = state({
      hands: [['S9'], [handle, 'H7']],
      trumpCard: 'H8',
      attacker: 0,
      defender: 1,
      attackers: [0],
      table: [{ attack: 'S9', defend: null }],
    });
    expect(canDefend(defending, 'S9', handle)).toBe(false);
    expect(canTransfer(defending, handle)).toBe(false);
  });
});
