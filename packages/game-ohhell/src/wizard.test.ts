import { describe, expect, it } from 'vitest';
import { openTrick, playToTrick, type Trick } from '@parlour/tricks';
import { isJester, isWizard, ohhellTrickRules, resolveOhHellWinner } from './cards';
import { ohhellGame } from './game';
import type { OhHellState } from './state';
import { mustStep, openSession, playOut, bidAround, step } from './test-util';

const RULES_NO_TRUMP = ohhellTrickRules(null);

function trickFrom(
  plays: readonly { seat: number; card: string }[],
  trump: string | null = null,
): Trick {
  const rules = ohhellTrickRules(trump);
  let trick = openTrick(plays[0]!.seat);
  for (const play of plays) trick = playToTrick(trick, play.seat, play.card, rules);
  return trick;
}

/** Legal playCard payloads for `seat` against a crafted state. */
function legalPlays(state: OhHellState, seat: number): string[] {
  const phase = { phase: state.stage, actor: seat, round: 1 };
  const moves =
    ohhellGame.flow.legalMovesFor?.(state, phase, seat) ?? ohhellGame.flow.legalMoves(state, phase);
  return moves.flatMap((move) =>
    move.id === 'playCard' && typeof (move.payload as { card?: unknown }).card === 'string'
      ? [(move.payload as { card: string }).card]
      : [],
  );
}

describe('winner resolution', () => {
  it('the FIRST Wizard wins, even against later Wizards or high trump', () => {
    const trick = trickFrom(
      [
        { seat: 0, card: 'H5' },
        { seat: 1, card: 'W2' },
        { seat: 2, card: 'S13' },
        { seat: 3, card: 'W1' },
      ],
      'spades',
    );
    expect(resolveOhHellWinner(trick, 'spades')).toBe(1);
  });

  it('an all-Jester trick goes to the first Jester', () => {
    const trick = trickFrom([
      { seat: 0, card: 'J3' },
      { seat: 1, card: 'J1' },
      { seat: 2, card: 'J4' },
    ]);
    expect(resolveOhHellWinner(trick, null)).toBe(0);
    expect(resolveOhHellWinner(trick, 'hearts')).toBe(0);
  });

  it('Jesters lose to any real card; real cards settle among themselves', () => {
    const trick = trickFrom(
      [
        { seat: 0, card: 'J1' },
        { seat: 1, card: 'C5' },
        { seat: 2, card: 'C9' },
      ],
      null,
    );
    expect(resolveOhHellWinner(trick, null)).toBe(2);
    const ruffed = trickFrom(
      [
        { seat: 0, card: 'J1' },
        { seat: 1, card: 'D9' },
        { seat: 2, card: 'S2' },
      ],
      'spades',
    );
    expect(resolveOhHellWinner(ruffed, 'spades')).toBe(2);
  });

  it('delegates plain-card resolution to @parlour/tricks', () => {
    const trick = trickFrom(
      [
        { seat: 0, card: 'H13' },
        { seat: 1, card: 'S1' },
      ],
      'spades',
    );
    expect(resolveOhHellWinner(trick, 'spades')).toBe(1); // ace of trump
    expect(resolveOhHellWinner(trick, 'clubs')).toBe(0); // ace-high off suit
  });
});

describe('led-suit bending', () => {
  function stateWithHands(
    plays: readonly { seat: number; card: string }[],
    trump: string | null,
    hands: readonly string[][],
    turn: number,
  ): OhHellState {
    const base = openSession({
      seed: 61,
      seats: hands.length,
      config: { handSize: hands[0]?.length ?? 4, wizards: true },
    }).state;
    return {
      ...base,
      stage: 'playing',
      hands: hands.map((cards) => [...cards]),
      turn,
      leader: plays[0]!.seat,
      trick: trickFrom(plays, trump),
      trumpSuit: trump,
    };
  }

  it('a led Wizard leaves everyone free to discard anything', () => {
    const hands = [
      ['C2', 'D3'],
      ['H9', 'D10'],
      ['W1', 'J2'],
    ];
    const state = stateWithHands([{ seat: 0, card: 'W2' }], 'hearts', hands, 1);
    expect(state.trick!.ledSuit).toBeNull(); // a Wizard sets no led suit
    expect(legalPlays(state, 1)).toEqual(['H9', 'D10']);
  });

  it('a led Jester defers the led suit to the next real card', () => {
    let trick = trickFrom([{ seat: 0, card: 'J1' }], null);
    expect(trick.ledSuit).toBeNull();
    trick = playToTrick(trick, 1, 'H9', RULES_NO_TRUMP);
    expect(trick.ledSuit).toBe('hearts');

    // seat 2 holds no hearts but may always shed Wizards and Jesters
    const hands = [
      ['C2', 'H4'],
      ['H2', 'C7'],
      ['W1', 'J2'],
    ];
    const state = stateWithHands(
      [
        { seat: 0, card: 'J1' },
        { seat: 1, card: 'H9' },
      ],
      null,
      hands,
      2,
    );
    expect(state.trick!.ledSuit).toBe('hearts');
    expect(legalPlays(state, 2)).toEqual(['W1', 'J2']);

    // a heart-holder IS bound once the Jester defers to a real heart
    const boundHands = [
      ['C2', 'H4'],
      ['H9', 'C7'],
      ['W1', 'D6'],
    ];
    const bound = stateWithHands(
      [
        { seat: 0, card: 'J1' },
        { seat: 1, card: 'H9' },
      ],
      null,
      boundHands,
      0,
    );
    expect(legalPlays(bound, 0)).toEqual(['H4']);
  });
});

describe('the trump flip with specials', () => {
  const SEATS = 4;
  const HAND = 5;

  function seedWhereFlipIs(kind: 'wizard' | 'jester'): number {
    for (let seed = 1; seed < 500; seed++) {
      const card = openSession({ seed, seats: SEATS, config: { handSize: HAND, wizards: true } })
        .state.trumpCard;
      if (card !== null && (kind === 'wizard' ? isWizard(card) : isJester(card))) return seed;
    }
    throw new Error(`no seed turns a ${kind} within range`);
  }

  it('a turned Wizard hands the choice to the dealer', () => {
    const session = openSession({
      seed: seedWhereFlipIs('wizard'),
      seats: SEATS,
      config: { handSize: HAND, wizards: true },
    });
    expect(session.state.stage).toBe('trumping');
    expect(isWizard(session.state.trumpCard!)).toBe(true);
    expect(session.state.trumpSuit).toBeNull(); // nothing chosen yet
    expect(session.state.turn).toBe(session.state.dealer);

    const dealer = session.state.dealer;
    const other = (dealer + 1) % SEATS;
    expect(step(session, other, 'chooseTrump', { suit: 'hearts' }).rejected).toBe('not-your-turn');
    expect(step(session, dealer, 'chooseTrump', { suit: 'bananas' }).rejected).toBe('bad-suit');

    const chosen = mustStep(session, dealer, 'chooseTrump', { suit: 'hearts' });
    expect(chosen.state.trumpSuit).toBe('hearts');
    expect(chosen.state.stage).toBe('bidding');
    expect(chosen.state.turn).toBe((dealer + 1) % SEATS);
  });

  it('a turned Jester means the round is no-trump', () => {
    const session = openSession({
      seed: seedWhereFlipIs('jester'),
      seats: SEATS,
      config: { handSize: HAND, wizards: true },
    });
    expect(isJester(session.state.trumpCard!)).toBe(true);
    expect(session.state.trumpSuit).toBeNull();
    expect(session.state.stage).toBe('bidding');
    expect(session.state.turn).toBe((session.state.dealer + 1) % SEATS);
  });

  it('every trumping stage offers the dealer exactly four suits', () => {
    for (let seed = 1; seed < 60; seed++) {
      const session = openSession({
        seed,
        seats: SEATS,
        config: { handSize: HAND, wizards: true },
      });
      if (session.state.stage !== 'trumping') continue;
      const moves = ohhellGame.flow.legalMoves(session.state, session.phase);
      expect(moves).toHaveLength(4);
      expect(new Set(moves.map((move) => (move.payload as { suit: string }).suit)).size).toBe(4);
    }
  });
});

describe('a wizard round end to end', () => {
  it('plays out with specials in the deck and scores cleanly', () => {
    let session = openSession({
      seed: 77,
      seats: 4,
      config: { handSize: 4, wizards: true },
    });
    if (session.state.stage === 'trumping') {
      session = mustStep(session, session.state.dealer, 'chooseTrump', { suit: 'spades' });
    }
    session = playOut(bidAround(session, [1, 1, 0, 0]));
    const summary = session.state.summary!;
    expect(summary.points).toHaveLength(4);
    expect(summary.tricksWon.reduce((a, b) => a + b, 0)).toBe(4);
  });
});
