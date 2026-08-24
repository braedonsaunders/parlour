import { describe, expect, it } from 'vitest';
import { EIGHTS_BOTS } from './bots';
import { cardValue, handValue, orderEightsHand, rankOf, suitOf } from './cards';
import { createEightsDef } from './game';
import { canPlay, hasPlayable, stockDry } from './round';
import { ctx, fxKinds, rules, state } from './test-util';
import type { EightsState } from './state';

const def = createEightsDef({ bots: EIGHTS_BOTS });

function play(current: EightsState, seat: number, card: string): EightsState {
  const verdict = def.moves.playCard!.validate(current, seat, { card });
  expect(verdict, `playing ${card}`).toBe(true);
  return def.moves.playCard!.apply(current, seat, { card }, ctx());
}

describe('the pack', () => {
  it('values a hand the way the table does', () => {
    expect(cardValue('S8')).toBe(50);
    expect(cardValue('H13')).toBe(10);
    expect(cardValue('D10')).toBe(10);
    expect(cardValue('C1')).toBe(1);
    expect(cardValue('C7')).toBe(7);
    expect(handValue(['S8', 'H13', 'C1', 'C7'])).toBe(68);
  });

  it('reads suits and ranks off the standard ids', () => {
    expect(suitOf('S12')).toBe('S');
    expect(rankOf('S12')).toBe(12);
    expect(rankOf('H10')).toBe(10);
    expect(() => suitOf('X3')).toThrow(/unknown eights card/);
    expect(() => rankOf('S14')).toThrow(/unknown eights card/);
  });

  it('leads a hand with its eights, then sorts into suit blocks', () => {
    expect(orderEightsHand(['C3', 'H8', 'S2', 'S13', 'S8'], {})).toEqual([
      'S8',
      'H8',
      'S2',
      'S13',
      'C3',
    ]);
  });
});

describe('what goes on the pile', () => {
  it('takes a matching suit or a matching rank', () => {
    const table = state({ hands: [['D9', 'H5', 'C9', 'S2'], []], discard: ['D5'] });
    expect(canPlay(table.round, table.rules, 'D9')).toBe(true);
    expect(canPlay(table.round, table.rules, 'C9')).toBe(false);
    expect(canPlay(table.round, table.rules, 'H5')).toBe(true);
    expect(canPlay(table.round, table.rules, 'S2')).toBe(false);
  });

  it('takes an eight on anything, and asks the player to name a suit', () => {
    const table = state({ hands: [['H8', 'C3'], ['D2']], discard: ['D5'] });
    const played = play(table, 0, 'H8');
    expect(played.round.awaitingSuit).toBe(0);
    expect(played.round.turn).toBe(0);
    // The eight's own suit is not the answer — the player still has to say.
    expect(played.round.activeSuit).toBe('D');

    const named = def.moves.chooseSuit!.apply(played, 0, { suit: 'C' }, ctx());
    expect(named.round.activeSuit).toBe('C');
    expect(named.round.awaitingSuit).toBeNull();
    expect(named.round.turn).toBe(1);
  });

  it('refuses a card that matches neither, and a card nobody is holding', () => {
    const table = state({ hands: [['C9'], []], discard: ['D5'] });
    expect(def.moves.playCard!.validate(table, 0, { card: 'C9' })).toMatchObject({
      code: 'card-not-playable',
    });
    expect(def.moves.playCard!.validate(table, 0, { card: 'D9' })).toMatchObject({
      code: 'not-in-hand',
    });
  });

  it('will not let the seat off turn play', () => {
    const table = state({ hands: [['D9'], ['D3']], discard: ['D5'] });
    expect(def.moves.playCard!.validate(table, 1, { card: 'D3' })).toMatchObject({
      code: 'not-your-turn',
    });
  });
});

describe('action cards', () => {
  it('makes the next seat pick up two, and takes their turn with it', () => {
    const table = state({
      hands: [['D2', 'C9'], ['H4', 'C10'], ['C13']],
      discard: ['D5'],
      stock: ['S3', 'S4'],
    });
    const played = play(table, 0, 'D2');
    expect(played.round.pendingDraw).toBe(2);
    expect(played.round.turn).toBe(1);

    const paid = def.moves.draw!.apply(played, 1, undefined, ctx());
    expect(paid.round.hands[1]).toEqual(['H4', 'C10', 'S3', 'S4']);
    expect(paid.round.pendingDraw).toBe(0);
    expect(paid.round.turn).toBe(2);
  });

  it('stacks a two onto a two only when the table says so', () => {
    const stacking = state(
      {
        hands: [['D2', 'C9'], ['H2', 'C10'], ['C13']],
        discard: ['D5'],
        stock: ['S3', 'S4', 'S5', 'S6'],
      },
      { stackDrawTwo: true },
    );
    const first = play(stacking, 0, 'D2');
    const second = play(first, 1, 'H2');
    expect(second.round.pendingDraw).toBe(4);
    const paid = def.moves.draw!.apply(second, 2, undefined, ctx());
    expect(paid.round.hands[2]).toHaveLength(5);

    const plain = state({
      hands: [['D2', 'C9'], ['H2', 'C10'], ['C13']],
      discard: ['D5'],
      stock: ['S3', 'S4'],
    });
    const opened = play(plain, 0, 'D2');
    expect(def.moves.playCard!.validate(opened, 1, { card: 'H2' })).toMatchObject({
      code: 'card-not-playable',
    });
  });

  it('steps a queen over the next seat', () => {
    const table = state({ hands: [['D12', 'C9'], ['H4'], ['C13']], discard: ['D5'] });
    const played = play(table, 0, 'D12');
    expect(played.round.turn).toBe(2);
  });

  it('turns the table around on an ace, and skips head-to-head', () => {
    const three = state({ hands: [['D1', 'C9'], ['H4'], ['C13']], discard: ['D5'] });
    const reversed = play(three, 0, 'D1');
    expect(reversed.round.direction).toBe(-1);
    expect(reversed.round.turn).toBe(2);

    const two = state({ hands: [['D1', 'C3'], ['H4']], discard: ['D5'] });
    const skipped = play(two, 0, 'D1');
    expect(skipped.round.turn).toBe(0);
  });

  it('leaves the action cards inert when the table turns them off', () => {
    const table = state(
      { hands: [['D2', 'C9'], ['H4'], ['C13']], discard: ['D5'] },
      { twosDrawTwo: false, queensSkip: false, acesReverse: false },
    );
    const played = play(table, 0, 'D2');
    expect(played.round.pendingDraw).toBe(0);
    expect(played.round.turn).toBe(1);
  });
});

describe('drawing', () => {
  it('draws until something is playable, then offers the card back', () => {
    const table = state({
      hands: [['C9'], ['H4']],
      discard: ['D5'],
      stock: ['S3', 'C4', 'D7', 'H2'],
    });
    const drawn = def.moves.draw!.apply(table, 0, undefined, ctx());
    expect(drawn.round.hands[0]).toEqual(['C9', 'S3', 'C4', 'D7']);
    expect(drawn.round.drawnCard).toBe('D7');
    expect(drawn.round.turn).toBe(0);

    const legal = def.flow.legalMoves(drawn, def.flow.start(drawn, 2));
    expect(legal.map((move) => move.id)).toEqual(['playCard', 'pass']);
  });

  it('takes exactly one card when the table draws one', () => {
    const table = state(
      { hands: [['C9'], ['H4']], discard: ['D5'], stock: ['S3', 'C4', 'D7'] },
      { drawUntilPlayable: false },
    );
    const drawn = def.moves.draw!.apply(table, 0, undefined, ctx());
    expect(drawn.round.hands[0]).toEqual(['C9', 'S3']);
    expect(drawn.round.drawnCard).toBeNull();
    expect(drawn.round.turn).toBe(1);
  });

  it('makes a playable drawn card compulsory when the table forces the play', () => {
    const table = state(
      { hands: [['C9'], ['H4']], discard: ['D5'], stock: ['D7'] },
      { forcePlay: true },
    );
    const drawn = def.moves.draw!.apply(table, 0, undefined, ctx());
    expect(drawn.round.drawnCard).toBe('D7');
    expect(def.moves.pass!.validate(drawn, 0, undefined)).toMatchObject({ code: 'force-play' });
    expect(def.flow.legalMoves(drawn, def.flow.start(drawn, 2)).map((move) => move.id)).toEqual([
      'playCard',
    ]);
  });

  it('shuffles the spent pile back into the stock', () => {
    const table = state({
      hands: [['C9'], ['H4']],
      discard: ['D5', 'S3', 'S4', 'S6'],
      stock: [],
    });
    const context = ctx();
    const drawn = def.moves.draw!.apply(table, 0, undefined, context);
    expect(fxKinds(context)).toContain('stock.shuffle');
    expect(drawn.round.discard).toEqual(['D5']);
    expect(drawn.round.hands[0]!.length).toBeGreaterThan(1);
  });

  it('will not let a seat pass while it can still draw or play', () => {
    const table = state({ hands: [['C9'], ['H4']], discard: ['D5'], stock: ['S3'] });
    expect(def.moves.pass!.validate(table, 0, undefined)).toMatchObject({ code: 'draw-first' });

    const playable = state({ hands: [['D9'], ['H4']], discard: ['D5'] });
    expect(def.moves.pass!.validate(playable, 0, undefined)).toMatchObject({ code: 'play-a-card' });
  });
});

describe('closing a round', () => {
  it('scores the shedder for everything still in the other hands', () => {
    const table = state({ hands: [['D9'], ['S8', 'H13'], ['C1', 'C7']], discard: ['D5'] });
    const played = play(table, 0, 'D9');
    expect(played.round.outcome).toMatchObject({
      winner: 0,
      reason: 'shed',
      points: 68,
    });
    expect(played.round.outcome!.handValues).toEqual([0, 60, 8]);
  });

  it('does not stop to ask for a suit when the eight was the last card', () => {
    const table = state({ hands: [['H8'], ['C3']], discard: ['D5'] });
    const played = play(table, 0, 'H8');
    expect(played.round.awaitingSuit).toBeNull();
    expect(played.round.outcome).toMatchObject({ winner: 0, reason: 'shed' });
  });

  it('pays the lightest hand when the table is blocked', () => {
    const table = state({ hands: [['C9'], ['C13', 'C10']], discard: ['D5'], stock: [] });
    expect(stockDry(table.round)).toBe(true);
    expect(hasPlayable(table.round, table.rules, 0)).toBe(false);
    const passed = def.moves.pass!.apply(table, 0, undefined, ctx());
    expect(passed.round.outcome).toMatchObject({ winner: 0, reason: 'blocked', points: 11 });
  });

  it('banks the points, then deals again once the table is ready', () => {
    const table = state({ hands: [['D9'], ['S8', 'H13']], discard: ['D5'] });
    const played = play(table, 0, 'D9');

    const folded = def.moves['round.fold']!.apply(played, -1, undefined, ctx());
    expect(folded.scores).toEqual([60, 0]);
    expect(folded.roundsWon).toEqual([1, 0]);
    expect(folded.folded).toBe(true);

    const phase = def.flow.advance(folded, { seq: 0, seat: null, move: 'round.fold' }, 2).phase;
    expect(phase.phase).toBe('round-end');
    expect(phase.actors).toEqual([0, 1]);
    expect(def.flow.legalMovesFor!(folded, phase, 0).map((move) => move.id)).toEqual(['ready']);

    let readied = def.moves.ready!.apply(folded, 0, undefined, ctx());
    readied = def.moves.ready!.apply(readied, 1, undefined, ctx());
    const dealt = def.moves['next.round']!.apply(readied, -1, undefined, ctx());
    expect(dealt.roundIndex).toBe(1);
    expect(dealt.dealer).toBe(1);
    expect(dealt.folded).toBe(false);
    expect(dealt.round.hands.flat()).toHaveLength(2 * rules().handSize);
    // The deal starts left of the new dealer.
    expect(dealt.round.turn).toBe(0);
  });

  it('ends the match on a sole leader past the target, and keeps dealing on a tie', () => {
    const table = state({ hands: [['D9'], ['C3']], discard: ['D5'] }, { targetScore: 50 });
    const leader: EightsState = { ...table, folded: true, scores: [60, 10] };
    expect(def.end(leader)).toMatchObject({ winner: 0, reason: 'eights-match' });

    const tied: EightsState = { ...table, folded: true, scores: [60, 60] };
    expect(def.end(tied)).toBeNull();
    expect(def.moves['next.round']!.validate(tied, -1, undefined)).toBe(true);
  });
});

describe('what a seat can see', () => {
  it('hides every other hand and the whole stock', () => {
    const table = state({
      hands: [
        ['D9', 'C3'],
        ['S8', 'H13'],
      ],
      discard: ['D5'],
      stock: ['S2'],
    });
    const view = def.playerView(table, 0);
    expect(view.round.hands[0]).toEqual(['D9', 'C3']);
    expect(view.round.hands[1]).toEqual(['??', '??']);
    expect(view.round.stock).toEqual(['??']);
    expect(view.round.discard).toEqual(['D5']);
  });
});
