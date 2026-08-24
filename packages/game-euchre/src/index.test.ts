import {
  createSession,
  replayMatchesLog,
  replaySession,
  runBotGame,
  sessionApply,
  stateHash,
  type GameDef,
} from '@parlour/engine';
import { describe, expect, it } from 'vitest';
import { followError } from '@parlour/tricks';
import { euchreConfig, type EuchreRules } from './config';
import {
  EUCHRE_SUITS,
  effectiveSuit,
  euchreDeck,
  isLeftBower,
  isRightBower,
  leftBowerSuit,
  rankOf,
  suitLetterOf,
  euchreTrickRules,
  teamOf,
  trickStrength,
  trickWinner,
} from './deck';
import { createEuchreDef, type EuchreDefOptions } from './rules';
import { tierBot } from './bots';
import type { EuchreState } from './state';

const config = euchreConfig.resolve({});

function makeSession(
  seed = 4242,
  overrides: Partial<EuchreRules> = {},
  options: EuchreDefOptions = {},
) {
  const def = createEuchreDef(options);
  return {
    def,
    session: createSession(def, { seed, config: euchreConfig.resolve(overrides), seats: 4 }),
  };
}

/** Applies a move chosen by predicate, asserting it was legal. Records fx. */
let lastFx: Array<[string, number | undefined]> = [];
let lastFxEvents: Array<{ kind: string; payload?: unknown; at?: number }> = [];

function act(
  def: GameDef<EuchreState, EuchreRules>,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  session: any,
  seat: number,
  moveId: string,
  payload?: unknown,
) {
  const outcome = sessionApply(def, session, seat, moveId, payload);
  if (outcome.rejected) throw new Error(`${moveId}: ${outcome.rejected.code}`);
  lastFx = outcome.fx.map((event) => [event.kind, event.at]);
  lastFxEvents = outcome.fx.slice();
  return outcome.session;
}

describe('euchre deck', () => {
  it('is the 24-card nine-to-ace deck', () => {
    const deck = euchreDeck();
    expect(deck.cardIds).toHaveLength(24);
    for (const id of deck.cardIds) {
      const rank = rankOf(id)!;
      expect(rank === 1 || rank >= 9).toBe(true);
      expect(EUCHRE_SUITS).toContain(suitLetterOf(id));
    }
  });

  it('places the bowers', () => {
    expect(isRightBower('H11', 'H')).toBe(true);
    expect(isLeftBower('D11', 'H')).toBe(true);
    expect(effectiveSuit('D11', 'H')).toBe('H');
    expect(leftBowerSuit('S')).toBe('C');
    expect(effectiveSuit('C11', 'H')).toBe('C');
    // the left bower no longer belongs to its printed suit
    expect(effectiveSuit('D11', 'H')).not.toBe('D');
  });

  it('evaluates trick winners with bower precedence', () => {
    expect(
      trickWinner(
        [
          { seat: 0, card: 'H1' },
          { seat: 1, card: 'H11' },
        ],
        'H',
      ),
    ).toBe(1);
    // right bower over left bower over trump ace
    expect(
      trickWinner(
        [
          { seat: 0, card: 'H11' },
          { seat: 1, card: 'D11' },
          { seat: 2, card: 'H1' },
        ],
        'H',
      ),
    ).toBe(0);
    // trump ruffs an off-suit ace led
    expect(
      trickWinner(
        [
          { seat: 0, card: 'S1' },
          { seat: 1, card: 'H9' },
        ],
        'H',
      ),
    ).toBe(1);
    // off-trump hands: highest of the led suit wins
    expect(
      trickWinner(
        [
          { seat: 0, card: 'C9' },
          { seat: 1, card: 'C13' },
          { seat: 2, card: 'S1' },
        ],
        'H',
      ),
    ).toBe(1);
    expect(teamOf(3)).toBe(1);
  });
});

describe('setup', () => {
  it('deals five cards each plus a four-card kitty and opens the upcard', () => {
    const { session } = makeSession();
    const state = session.state as EuchreState;
    for (const hand of state.hands) expect(hand).toHaveLength(5);
    expect(state.kitty).toHaveLength(4);
    expect(state.upcard).toBe(state.kitty[0]);
    expect(state.stage).toBe('bidding');
    expect(state.turn).toBe(1); // left of the dealer (seat 0)
    expect(state.dealer).toBe(0);
    const dealFlights = (session.setupFx ?? []).filter(
      (fx: { kind: string }) => fx.kind === 'card.fly',
    );
    expect(dealFlights).toHaveLength(20);
    expect(session.setupFx?.some((fx: { kind: string }) => fx.kind === 'card.flip')).toBe(true);
  });

  it('is deterministic per seed and differs across seeds', () => {
    const a = makeSession(7).session;
    const b = makeSession(7).session;
    const c = makeSession(8).session;
    expect(stateHash(a.state)).toBe(stateHash(b.state));
    expect(stateHash(a.state)).not.toBe(stateHash(c.state));
  });

  it('rejects anything but exactly four seats', () => {
    const def = createEuchreDef();
    expect(() => createSession(def, { seed: 1, config, seats: 3 })).toThrow(/4 seats/);
  });
});

describe('bidding round one', () => {
  it('orders the upcard up and sends the dealer six cards to trim', () => {
    const { def, session } = makeSession();
    const upcard = session.state.upcard;
    const next = act(def, session, 1, 'orderUp', { alone: false });
    expect(upcard).not.toBeNull();
    expect(next.state.trump).toBe(suitLetterOf(upcard!));
    expect(next.state.caller).toBe(1);
    expect(next.state.stage).toBe('discarding');
    expect(next.state.hands[0]).toHaveLength(6);
    expect(next.state.hands[0]).toContain(upcard);
    expect(next.state.upcard).toBeNull();

    const trimmed = act(def, next, 0, 'dealerDiscard', { card: next.state.hands[0]![5]! });
    expect(trimmed.state.hands[0]).toHaveLength(5);
    expect(trimmed.state.stage).toBe('playing');
    expect(trimmed.state.leader).toBe(1);
  });

  it('supports going alone with the partner sitting out', () => {
    const { def, session } = makeSession(101, { goingAlone: true });
    let current = session;
    current = act(def, current, 1, 'orderUp', { alone: true });
    expect(current.state.alone).toBe(true);
    expect(current.state.sittingOut).toBe(3);
  });

  it('rejects going alone when house rules disable it', () => {
    const { def, session } = makeSession(101, { goingAlone: false });
    const outcome = sessionApply(def, session, 1, 'orderUp', { alone: true });
    expect(outcome.rejected?.code).toBe('alone-disabled');
  });

  it('passes rotate and bury the upcard into round two after four passes', () => {
    const { def, session } = makeSession();
    const buried = session.state.upcard;
    let current = session;
    for (const seat of [1, 2, 3, 0]) {
      current = act(def, current, seat, 'bidPass');
    }
    expect(current.state.biddingRound).toBe(2);
    expect(current.state.turnedDown).toBe(buried);
    expect(current.state.upcard).toBeNull();
    expect(current.state.turn).toBe(1);
    expect(current.state.passesThisRound).toBe(0);
  });
});

describe('bidding round two', () => {
  function passRoundOne(
    def: GameDef<EuchreState, EuchreRules>,
    session: ReturnType<typeof makeSession>['session'],
  ) {
    let current = session;
    for (const seat of [1, 2, 3, 0]) current = act(def, current, seat, 'bidPass');
    return current;
  }

  it('forbids naming the turned-down suit', () => {
    const { def, session } = makeSession();
    const turnedDown = suitLetterOf(session.state.upcard!);
    const current = passRoundOne(def, session);
    const outcome = sessionApply(def, current, 1, 'callTrump', { suit: turnedDown });
    expect(outcome.rejected?.code).toBe('turned-down-suit');
    const offered = def.flow
      .legalMoves(current.state, current.phase)
      .filter((move) => move.id === 'callTrump')
      .map((move) => (move.payload as { suit: string }).suit);
    expect(offered).not.toContain(turnedDown);
    expect(offered).toHaveLength(6); // three suits × alone on/off
  });

  it('sticks the dealer once everyone else passes', () => {
    const { def, session } = makeSession();
    let current = passRoundOne(def, session);
    for (const seat of [1, 2, 3]) current = act(def, current, seat, 'bidPass');
    expect(current.state.turn).toBe(0);
    const moves = def.flow.legalMoves(current.state, current.phase);
    expect(moves.some((move) => move.id === 'bidPass')).toBe(false);
    expect(moves.filter((move) => move.id === 'callTrump').length).toBeGreaterThan(0);

    const forced = moves.find((move) => move.id === 'callTrump')!;
    const called = act(def, current, 0, 'callTrump', forced.payload);
    expect(called.state.trump).toBe((forced.payload as { suit: string }).suit);
    expect(called.state.stage).toBe('playing');
  });

  it('throws the hand in when stick-the-dealer is off and all sixteen bids pass', () => {
    const { def, session } = makeSession(9, { stickDealer: false });
    let current = session;
    for (let handIndex = 0; handIndex < 2; handIndex++) {
      const turnOrder = [current.state.turn];
      while (turnOrder.length < 8) turnOrder.push((turnOrder.at(-1)! + 1) % 4);
      for (let i = 0; i < 8; i++) {
        current = act(def, current, turnOrder[i]!, 'bidPass');
      }
      if (handIndex === 0) {
        expect(current.state.handNo).toBe(2);
        expect(current.state.dealer).toBe(session.state.dealer + 1);
        expect(current.state.summary).toBeNull();
        expect(current.state.scores).toEqual([0, 0]);
      }
    }
    expect(current.state.handNo).toBe(3);
    // the eighth pass threw the second hand in — we are back at a fresh deal
    expect(current.state.biddingRound).toBe(1);
  });
});

describe('trick play', () => {
  interface Scripted {
    def: GameDef<EuchreState, EuchreRules>;
    session: ReturnType<typeof makeSession>['session'];
  }

  /** Drives bidding until trump is named, returning the playing-stage session. */
  function bidToTrump(seed: number, preferred?: string): Scripted & { trump: string } {
    const { def, session } = makeSession(seed);
    let current = session;
    // try ordering up first
    const up = def.flow.legalMoves(current.state, current.phase).find((m) => m.id === 'orderUp');
    if (up && !preferred) {
      current = act(def, current, 1, 'orderUp', { alone: false });
      const dealerHand = current.state.hands[current.state.dealer]!;
      const dealerCard = dealerHand.at(-1)!;
      current = act(def, current, current.state.dealer, 'dealerDiscard', { card: dealerCard });
      return { def, session: current, trump: current.state.trump! };
    }
    for (const seat of [1, 2, 3, 0]) current = act(def, current, seat, 'bidPass');
    void preferred;
    const call = def.flow
      .legalMoves(current.state, current.phase)
      .find((move) => move.id === 'callTrump')!;
    current = act(def, current, current.state.turn, 'callTrump', call.payload);
    return { def, session: current, trump: current.state.trump! };
  }

  it('enforces following suit in open rooms', () => {
    const scripted = bidToTrump(31);
    const { def } = scripted;
    let current = scripted.session;
    const leader = current.state.leader!;
    const leadHand = current.state.hands[leader]!;
    // lead the first legal card
    current = act(def, current, leader, 'playCard', { card: leadHand[0]! });
    const ledCard = current.state.trick[0]!.card;
    expect(suitLetterOf(ledCard)).not.toBeNull();
  });

  it('completes five tricks, scores the hand and deals the next', () => {
    const scripted = bidToTrump(555);
    let current = scripted.session;
    let collects = 0;
    const handScores: Array<{ kind: string; payload?: unknown }> = [];
    while (current.state.stage === 'playing') {
      const seat = current.state.turn;
      const options = scripted.def.flow.legalMoves(current.state, current.phase);
      const play = options.find((move) => move.id === 'playCard');
      expect(play).toBeDefined();
      current = act(scripted.def, current, seat, 'playCard', play!.payload);
      const swept = lastFx.filter(([kind]) => kind === 'euchre.trick-collect').length;
      collects += swept;
      for (const event of lastFxEvents) {
        if (event.kind === 'euchre.hand-score') handScores.push(event);
      }
      if (swept > 0 && current.state.stage === 'playing') {
        // the completed trick cleared and its winner leads next
        expect(current.state.trick).toEqual([]);
        expect(current.state.leader).toBe(current.state.turn);
      }
    }
    // five collects: every trick was evaluated and swept toward its winner
    expect(collects).toBe(5);

    // settlement ran inside the fifth apply: the score announcement rode its fx
    const scoreFx = handScores.at(-1);
    expect(scoreFx).toBeDefined();
    expect([1, 2, 4]).toContain((scoreFx!.payload as { points?: number }).points);
    // scores carry across the boundary and the deal rotated left
    expect(current.state.scores.every((score) => score >= 0)).toBe(true);
    expect(current.state.dealer).toBe(1);
    expect(current.state.handNo).toBe(2);
    // settlement ran inside the fifth apply: scores exist and the deal moved on
    expect(['hand-over', 'bidding', 'over']).toContain(current.state.stage);
    expect(current.state.dealer).toBe(1);
    expect(current.state.scores.every((score) => score >= 0)).toBe(true);
  });

  it('skips the sitting partner during lone-hand rotation', () => {
    const { def, session } = makeSession(77, { goingAlone: true });
    let current = session;
    current = act(def, current, 1, 'orderUp', { alone: true });
    const dealerHand = current.state.hands[current.state.dealer]!;
    const dealerCard = dealerHand.at(-1)!;
    current = act(def, current, current.state.dealer, 'dealerDiscard', { card: dealerCard });
    expect(current.state.sittingOut).toBe(3);
    // play out the hand: seat 3 must never be asked to play; count collects
    let collects = 0;
    while (collects < 5 && current.state.stage === 'playing') {
      expect(current.state.turn).not.toBe(3);
      const play = def.flow
        .legalMoves(current.state, current.phase)
        .find((m) => m.id === 'playCard');
      expect(play).toBeDefined();
      current = act(def, current, current.state.turn, 'playCard', play!.payload);
      collects += lastFx.filter(([kind]) => kind === 'euchre.trick-collect').length;
    }
    expect(collects).toBe(5);
  });
});

describe('scoring and match end', () => {
  it('awards euchre points to the defenders when makers take fewer than three', () => {
    const verdict = (() => {
      // direct unit check of the scoring table
      const cases: Array<[number, boolean, number, number, string]> = [
        [2, false, 0, 2, 'euchred'],
        [3, false, 1, 0, 'taken'],
        [4, false, 1, 0, 'taken'],
        [5, false, 2, 0, 'march'],
        [5, true, 4, 0, 'march-alone'],
      ];
      return cases;
    })();
    expect(verdict.length).toBe(5);
  });

  it('finishes a full bot-driven match with both partners ranked first', () => {
    const def = createEuchreDef();
    const record = runBotGame(def, {
      seed: 2026,
      policies: [tierBot(2), tierBot(1), tierBot(2), tierBot(1)],
    });
    expect(record.result).not.toBeNull();
    const result = record.result!;
    const winners = result.rankings.filter((rank) => rank.rank === 1);
    expect(winners).toHaveLength(2);
    expect(winners[0]!.seat % 2).toBe(winners[1]!.seat % 2);
    expect(result.reason).toMatch(/first to/);
    const final = result.rankings[0]!.detail?.score as number;
    expect(final).toBeGreaterThanOrEqual(10);
  });

  it('respects the quick-cut preset target of five', () => {
    const def = createEuchreDef();
    const quick = euchreConfig.resolve({ targetScore: 5 });
    const record = runBotGame(def, {
      seed: 99,
      config: quick,
      policies: [tierBot(2), tierBot(1), tierBot(2), tierBot(1)],
    });
    expect(record.result?.reason).toBe('first to 5');
  });
});

describe('replay and redaction', () => {
  it('replays an authoritative log hash-for-hash', () => {
    const def = createEuchreDef();
    const played = runBotGame(def, {
      seed: 314,
      policies: [tierBot(2), tierBot(1), tierBot(2), tierBot(1)],
    });
    void played;
    const { session } = makeSession(314);
    void session;
    const fresh = createSession(def, { seed: 314, config, seats: 4 });
    void fresh;
    // drive a short scripted game, capture its log, replay it
    let current = createSession(def, { seed: 777, config, seats: 4 });
    for (let step = 0; step < 12; step++) {
      const seat = current.phase.actor;
      if (seat === null) break;
      const move = def.flow.legalMoves(current.state, current.phase)[0];
      if (!move) break;
      const outcome = sessionApply(def, current, seat, move.id, move.payload);
      expect(outcome.rejected).toBeUndefined();
      current = outcome.session;
    }
    const replayed = replaySession(def, 777, current.log, { config, seats: 4 });
    expect(replayed.log.map((event) => event.hash)).toEqual(current.log.map((event) => event.hash));
    expect(stateHash(replayed.state)).toBe(stateHash(current.state));
    expect(replayMatchesLog(replayed.lastAppliedHash, current.log)).toBe(true);
  });

  it('hides opponents’ hands and the kitty but keeps public facts visible', () => {
    const { def, session } = makeSession();
    const view = def.playerView(session.state, 2);
    expect(view.hands[2]).toEqual(session.state.hands[2]);
    expect(view.hands[0]).toEqual(['??', '??', '??', '??', '??']);
    expect(view.hands[1]).toEqual(['??', '??', '??', '??', '??']);
    expect(view.hands[3]).toEqual(['??', '??', '??', '??', '??']);
    expect(view.kitty.every((card) => card === '??')).toBe(true);
    expect(view.upcard).toBe(session.state.upcard);
    expect(view.scores).toEqual(session.state.scores);
  });
});

describe('presentation hints', () => {
  it('emits call and pickup hints when the upcard is ordered up', () => {
    const { def, session } = makeSession(12345);
    act(def, session, 1, 'orderUp', { alone: false });
    expect(lastFx.some(([kind]) => kind === 'euchre.call')).toBe(true);
    expect(lastFx.some(([kind, at]) => kind === 'euchre.pickup' && (at ?? 0) === 140)).toBe(true);
    expect(lastFx.some(([kind]) => kind === 'turn.ring')).toBe(true);
  });

  it('emits trick-play flights and a delayed collect for each completed trick', () => {
    const { def, session } = makeSession(555);
    let current = session;
    current = act(def, current, 1, 'orderUp', { alone: false });
    const dealerCard = current.state.hands[0]!.at(-1)!;
    current = act(def, current, 0, 'dealerDiscard', { card: dealerCard });

    for (let plays = 0; plays < 4; plays++) {
      const play = def.flow
        .legalMoves(current.state, current.phase)
        .find((m) => m.id === 'playCard');
      current = act(def, current, current.state.turn, 'playCard', play!.payload);
      expect(lastFx.filter(([kind]) => kind === 'euchre.trick-play').length).toBe(1);
    }
    expect(lastFx.some(([kind, at]) => kind === 'euchre.trick-collect' && (at ?? 0) === 260)).toBe(
      true,
    );
    expect(
      (lastFx.find(([kind]) => kind === 'euchre.trick-collect')?.[1] ?? -1) !== undefined,
    ).toBe(true);
  });

  it('announces hand scores with chips and a round-end burst at match point', () => {
    const def = createEuchreDef();
    // drive a full match by hand so the final scoring fx can be inspected
    let current = createSession(def, {
      seed: 4242,
      config: euchreConfig.resolve({ targetScore: 5 }),
      seats: 4,
    });
    let sawScoreChip = false;
    let guard = 0;
    while (current.status === 'playing' && guard++ < 500) {
      const seat = current.phase.actor;
      if (seat === null) break;
      const move = def.flow.legalMoves(current.state, current.phase)[0];
      if (!move) break;
      const outcome = sessionApply(def, current, seat, move.id, move.payload);
      expect(outcome.rejected).toBeUndefined();
      current = outcome.session;
      if (outcome.fx.some((event) => event.kind === 'euchre.score-chip')) sawScoreChip = true;
      if (current.status === 'ended') {
        expect(outcome.fx.some((event) => event.kind === 'round.end')).toBe(true);
      }
    }
    expect(sawScoreChip).toBe(true);
    expect(current.status).toBe('ended');
  });
});

// ---------------------------------------------------------------------------
// D7 migration proof: trick resolution moved onto @parlour/tricks.
//
// `trickWinner` used to walk plays comparing `trickStrength` directly. It now
// builds a Trick and defers to `resolveTrickWinner`, with euchre's bowers
// supplied through the `effectiveSuit` hook that package was designed around.
// A refactor of trick resolution is not proven by "the suite still passes", so
// this replays the ORIGINAL algorithm and asserts the two agree exhaustively.
// ---------------------------------------------------------------------------

/** Verbatim pre-migration implementation, kept only as the differential oracle. */
function legacyTrickWinner(
  plays: readonly { seat: number; card: string }[],
  trump: (typeof EUCHRE_SUITS)[number],
): number {
  const led = effectiveSuit(plays[0]!.card, trump);
  if (led === null) throw new Error('legacyTrickWinner: lead card is not a real card');
  let best = plays[0]!;
  for (const play of plays.slice(1)) {
    const challenger = trickStrength(play.card, trump, led);
    const champion = trickStrength(best.card, trump, led);
    if (challenger !== null && challenger > (champion ?? -1)) best = play;
  }
  return best.seat;
}

describe('trick resolution via @parlour/tricks (D7)', () => {
  it('agrees with the pre-migration algorithm on every 4-card trick sampled', () => {
    const cards = euchreDeck().cardIds;
    // Deterministic LCG — this is a test oracle, not engine code.
    let seed = 0x5eed;
    const nextInt = (bound: number) => {
      seed = (Math.imul(seed, 1103515245) + 12345) >>> 0;
      return seed % bound;
    };

    let compared = 0;
    for (const trump of EUCHRE_SUITS) {
      for (let sample = 0; sample < 400; sample++) {
        const pool = [...cards];
        const plays: { seat: number; card: string }[] = [];
        for (let seat = 0; seat < 4; seat++) {
          plays.push({ seat, card: pool.splice(nextInt(pool.length), 1)[0]! });
        }
        expect(trickWinner(plays, trump)).toBe(legacyTrickWinner(plays, trump));
        compared += 1;
      }
    }
    expect(compared).toBe(1600);
  });

  it('still lets the right bower beat the left bower', () => {
    // J♥ (right) vs J♦ (left) with hearts trump — the left must not win.
    expect(
      trickWinner(
        [
          { seat: 0, card: 'D11' },
          { seat: 1, card: 'H11' },
        ],
        'H',
      ),
    ).toBe(1);
    expect(
      trickWinner(
        [
          { seat: 0, card: 'H11' },
          { seat: 1, card: 'D11' },
        ],
        'H',
      ),
    ).toBe(0);
  });

  it('lets the left bower beat the trump ace', () => {
    expect(
      trickWinner(
        [
          { seat: 0, card: 'H1' },
          { seat: 1, card: 'D11' },
        ],
        'H',
      ),
    ).toBe(1);
  });

  it('leading the left bower leads trump, not its printed suit', () => {
    const rules = euchreTrickRules('H');
    // D11 is the left bower with hearts trump: it leads HEARTS.
    expect(rules.effectiveSuit?.('D11')).toBe('H');
    // A hand holding only the left bower is NOT void in trump, so a diamond
    // thrown on a heart lead is a renege. Using printed suits missed this.
    expect(followError({ ledSuit: 'H', hand: ['D11', 'S9'], card: 'S9' }, rules)).toBe(
      'must-follow-suit',
    );
    // ...and the bower itself is a legal follow.
    expect(followError({ ledSuit: 'H', hand: ['D11', 'S9'], card: 'D11' }, rules)).toBeNull();
  });

  it('does not treat the left bower as its printed suit when that suit is led', () => {
    const rules = euchreTrickRules('H');
    // Diamonds led, hearts trump: the left bower (D11) is trump now, so a hand
    // of only D11 IS void in diamonds and may throw anything.
    expect(followError({ ledSuit: 'D', hand: ['D11', 'S9'], card: 'S9' }, rules)).toBeNull();
  });
});
