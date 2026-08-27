import { createFx } from '@parlour/engine';
import { describe, expect, it } from 'vitest';
import { DURAK_BOTS } from './bots';
import { beats, durakDeck, rankOf, suitOf } from './cards';
import { durakConfig } from './config';
import { createDurakDef } from './game';
import { boutBeaten, resolveBout } from './round';
import { ctx, state } from './test-util';
import type { DurakState } from './state';

const def = createDurakDef({ bots: DURAK_BOTS });

function act(current: DurakState, seat: number, id: string, payload?: unknown): DurakState {
  const move = def.moves[id]!;
  const verdict = move.validate(current, seat, payload);
  expect(verdict, `${id} by seat ${seat}`).toBe(true);
  return move.apply(current, seat, payload, ctx());
}

describe('the pack', () => {
  it('reads suits and ranks off the ids', () => {
    expect(suitOf('S14')).toBe('S');
    expect(rankOf('S14')).toBe(14);
    expect(rankOf('H10')).toBe(10);
    expect(() => suitOf('X6')).toThrow(/unknown durak card/);
    expect(durakDeck.cardIds).toHaveLength(36);
  });

  it('beats by rank within a suit, and by trump across suits', () => {
    expect(beats('S6', 'S7', 'H')).toBe(true);
    expect(beats('S7', 'S6', 'H')).toBe(false);
    expect(beats('S6', 'H6', 'H')).toBe(true);
    expect(beats('H6', 'S6', 'H')).toBe(false);
    expect(beats('H6', 'H14', 'H')).toBe(true);
    expect(beats('S6', 'D6', 'H')).toBe(false);
  });

  it('ships classic, transfer and heads-up presets', () => {
    expect(durakConfig.presets.map((p) => p.id)).toEqual(['classic', 'transfer', 'heads-up']);
    expect(durakConfig.resolve({}).transfer).toBe(false);
  });
});

describe('attacking', () => {
  it('only the primary attacker may open an empty table', () => {
    const table = state({
      hands: [['S10'], ['S9', 'D6']],
      trumpCard: 'H8',
      attacker: 0,
      defender: 1,
      attackers: [0],
    });
    expect(def.moves.attack!.validate(table, 1, { card: 'S9' })).toMatchObject({
      code: 'cannot-attack',
    });
    const opened = act(table, 0, 'attack', { card: 'S10' });
    expect(opened.table).toEqual([{ attack: 'S10', defend: null }]);
  });

  it('never exceeds the attack cap', () => {
    const table = state({
      hands: [['S9'], ['H6', 'H7'], ['C10']],
      trumpCard: 'H8',
      attacker: 0,
      defender: 1,
      attackers: [0, 2],
      table: [
        { attack: 'S10', defend: 'H6' },
        { attack: 'S11', defend: 'H7' },
      ],
      attackCap: 2,
    });
    expect(def.moves.attack!.validate(table, 2, { card: 'C10' })).toMatchObject({
      code: 'cannot-attack',
    });
  });
});

describe('defending', () => {
  const base = () =>
    state({
      hands: [['S10'], ['S9', 'H6', 'D6']],
      trumpCard: 'H8',
      attacker: 0,
      defender: 1,
      attackers: [0],
      table: [{ attack: 'S10', defend: null }],
    });

  it('needs a higher card of the same suit, or any trump', () => {
    const table = base();
    expect(def.moves.defend!.validate(table, 1, { attack: 'S10', card: 'S9' })).toMatchObject({
      code: 'cannot-defend',
    });
    expect(def.moves.defend!.validate(table, 1, { attack: 'S10', card: 'D6' })).toMatchObject({
      code: 'cannot-defend',
    });
    expect(def.moves.defend!.validate(table, 1, { attack: 'S10', card: 'H6' })).toBe(true);
  });

  it('beats the attack, and the bout resolves once the sole attacker passes', () => {
    let table = act(base(), 1, 'defend', { attack: 'S10', card: 'H6' });
    expect(table.table).toEqual([{ attack: 'S10', defend: 'H6' }]);
    expect(boutBeaten(table)).toBe(false);
    table = act(table, 0, 'pass');
    expect(boutBeaten(table)).toBe(true);
  });

  it('refuses to let anyone but the defender beat a card', () => {
    const table = base();
    expect(def.moves.defend!.validate(table, 0, { attack: 'S10', card: 'H6' })).toMatchObject({
      code: 'not-defender',
    });
  });
});

describe('throw-ins', () => {
  it('only accepts a rank already showing on the table', () => {
    const table = state({
      hands: [['S9'], ['H6'], ['C10', 'D7']],
      trumpCard: 'H8',
      attacker: 0,
      defender: 1,
      attackers: [0, 2],
      table: [{ attack: 'S10', defend: 'H6' }],
    });
    expect(def.moves.attack!.validate(table, 2, { card: 'D7' })).toMatchObject({
      code: 'cannot-attack',
    });
    expect(def.moves.attack!.validate(table, 2, { card: 'C10' })).toBe(true);
  });

  it('is refused while a card on the table is still unmatched', () => {
    const table = state({
      hands: [['S9'], ['H6'], ['C10']],
      trumpCard: 'H8',
      attacker: 0,
      defender: 1,
      attackers: [0, 2],
      table: [{ attack: 'S10', defend: null }],
    });
    expect(def.moves.attack!.validate(table, 2, { card: 'C10' })).toMatchObject({
      code: 'cannot-attack',
    });
  });

  it('is refused outright when the house turns throw-ins off', () => {
    const table = state(
      {
        hands: [['S9'], ['H6'], ['C10']],
        trumpCard: 'H8',
        attacker: 0,
        defender: 1,
        attackers: [0, 2],
        table: [{ attack: 'S10', defend: 'H6' }],
      },
      { throwIns: false },
    );
    expect(def.moves.attack!.validate(table, 2, { card: 'C10' })).toMatchObject({
      code: 'cannot-attack',
    });
  });
});

describe('picking up', () => {
  it("sweeps the whole table into the defender's hand and moves attack on past them", () => {
    const table = state({
      hands: [['S9'], ['D6'], ['C10']],
      trumpCard: 'H8',
      attacker: 0,
      defender: 1,
      attackers: [0, 2],
      table: [{ attack: 'S10', defend: null }],
    });
    expect(def.moves.takeCards!.validate(table, 1, undefined)).toBe(true);
    const taken = def.moves.takeCards!.apply(table, 1, undefined, ctx());
    expect(taken.hands[1]).toEqual(expect.arrayContaining(['D6', 'S10']));
    expect(taken.table).toEqual([]);
    // The failed defender does not attack — play resumes after them.
    expect(taken.attacker).toBe(2);
  });
});

describe('refilling after a beaten bout', () => {
  it('refills the new attacker, then the other attackers, then the defender last', () => {
    const used = new Set(['S10', 'H7', 'H8']);
    const stock = durakDeck.cardIds.filter((card) => !used.has(card)).slice(0, 18);
    const seed = state({
      hands: [[], [], []],
      trumpCard: 'H8',
      attacker: 0,
      defender: 1,
      attackers: [0, 2],
      table: [{ attack: 'S10', defend: 'H7' }],
      stock,
    });
    const fx = createFx();
    const resolved = resolveBout(seed, false, fx);
    // A beaten bout hands the attack to the seat who just defended.
    expect(resolved.attacker).toBe(1);
    expect(resolved.defender).toBe(2);
    expect(resolved.hands[0]).toHaveLength(6);
    expect(resolved.hands[1]).toHaveLength(6);
    expect(resolved.hands[2]).toHaveLength(6);

    const targets = fx.events
      .filter((event) => event.kind === 'card.fly')
      .map((event) => (event.payload as { to: string }).to);
    expect(targets.slice(0, 6).every((to) => to === 'hand:1')).toBe(true);
    expect(targets.slice(6, 12).every((to) => to === 'hand:0')).toBe(true);
    expect(targets.slice(12, 18).every((to) => to === 'hand:2')).toBe(true);
  });
});

describe('transfer', () => {
  it('lets an unbeaten defender pass a matching rank to the next seat', () => {
    const table = state(
      {
        hands: [['S9'], ['H10', 'D6'], ['C6', 'C7']],
        trumpCard: 'H8',
        attacker: 0,
        defender: 1,
        attackers: [0, 2],
        table: [{ attack: 'S10', defend: null }],
      },
      { transfer: true },
    );
    expect(def.moves.transfer!.validate(table, 1, { card: 'D6' })).toMatchObject({
      code: 'cannot-transfer',
    });
    expect(def.moves.transfer!.validate(table, 1, { card: 'H10' })).toBe(true);
    const transferred = act(table, 1, 'transfer', { card: 'H10' });
    expect(transferred.defender).toBe(2);
    expect(transferred.table).toEqual([
      { attack: 'S10', defend: null },
      { attack: 'H10', defend: null },
    ]);
    expect(transferred.hands[1]).toEqual(['D6']);
  });

  it('is refused once the defender has beaten anything this bout', () => {
    const table = state(
      {
        hands: [['S9'], ['H10'], ['C6']],
        trumpCard: 'H8',
        attacker: 0,
        defender: 1,
        attackers: [0],
        table: [{ attack: 'S10', defend: 'H9' }],
      },
      { transfer: true },
    );
    expect(def.moves.transfer!.validate(table, 1, { card: 'H10' })).toMatchObject({
      code: 'cannot-transfer',
    });
  });

  it('is refused when the next seat cannot take on that many cards', () => {
    const table = state(
      {
        hands: [['S9'], ['H10'], ['C6']],
        trumpCard: 'H8',
        attacker: 0,
        defender: 1,
        attackers: [0, 2],
        table: [{ attack: 'S10', defend: null }],
      },
      { transfer: true },
    );
    // Seat 2 holds one card; transferring would show them two.
    expect(def.moves.transfer!.validate(table, 1, { card: 'H10' })).toMatchObject({
      code: 'cannot-transfer',
    });
  });

  it('is refused outright when the table has transfers switched off', () => {
    const table = state(
      {
        hands: [['S9'], ['H10', 'D6'], ['C6', 'C7']],
        trumpCard: 'H8',
        attacker: 0,
        defender: 1,
        attackers: [0, 2],
        table: [{ attack: 'S10', defend: null }],
      },
      { transfer: false },
    );
    expect(def.moves.transfer!.validate(table, 1, { card: 'H10' })).toMatchObject({
      code: 'transfer-off',
    });
  });
});

describe('ending the hand', () => {
  it('marks an emptied hand out once the stock is spent, and finds the durak', () => {
    const seed = state({
      hands: [[], ['S9']],
      trumpCard: 'H8',
      attacker: 0,
      defender: 1,
      attackers: [0],
      table: [{ attack: 'H6', defend: 'H7' }],
      stock: [],
    });
    const resolved = resolveBout(seed, false, createFx());
    expect(resolved.out).toEqual([0]);
    expect(resolved.outcome).toEqual({ loser: 1, order: [0] });
    expect(def.end(resolved)).toMatchObject({ winner: 0, reason: 'durak' });
  });

  it('calls a shared final exchange a draw rather than inventing a fool', () => {
    const seed = state({
      hands: [[], []],
      trumpCard: 'H8',
      attacker: 0,
      defender: 1,
      attackers: [0],
      table: [{ attack: 'H6', defend: 'H7' }],
      stock: [],
    });
    const resolved = resolveBout(seed, false, createFx());
    expect(resolved.outcome).toEqual({ loser: null, order: [0, 1] });
    expect(def.end(resolved)).toMatchObject({ winner: 0, reason: 'durak-draw' });
  });
});

describe('what a seat can see', () => {
  it('hides every other hand, and every stock card but the trump', () => {
    const table = state({
      hands: [
        ['S10', 'S9'],
        ['H6', 'H7'],
      ],
      trumpCard: 'H8',
      attacker: 0,
      defender: 1,
      attackers: [0],
      stock: ['C6', 'C7', 'H8'],
    });
    const view = def.playerView(table, 0);
    expect(view.hands[0]).toEqual(['S10', 'S9']);
    expect(view.hands[1]).toEqual(['??', '??']);
    expect(view.stock).toEqual(['??', '??', 'H8']);
    expect(view.trumpCard).toBe('H8');
  });
});
