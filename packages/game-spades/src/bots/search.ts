import type { BotPolicy, CardId, LegalMove, Rng, SeatId } from '@parlour/engine';
import { followError, resolveTrickWinner, type Trick } from '@parlour/tricks';
import { DECK, SPADES_SEATS, allSpades, isSpade, spadesTrickRules, teamOf } from '../cards';
import type { SpadesState } from '../state';
import { chooseFromProfile, type BotProfile } from './index';
import { decidePlay, type PlayParams } from './play';

/**
 * The search bot — perfect-information Monte Carlo over determinised worlds.
 *
 * This was built to close the adversarial finding that the Hard heuristic
 * never counts outstanding trumps and never infers voids. Sampling-expectimax
 * determinises hidden hands into K constraint-respecting worlds (own hand
 * excluded, played cards excluded, suit-void evidence from failed follows
 * enforced) and rolls each candidate play out with the Hard heuristic
 * against those worlds; the play whose mean rollout score is best wins.
 *
 * ## Measured result, honestly reported
 *
 * It does not beat Hard head-to-head at the sample sizes it can afford:
 *  - duck-follow rollout, 12-sample floor, ~46%/80 games probe;
 *  - duck-follow rollout, 30-sample floor, 50/80 (within noise of a tie);
 *  - Hard-heuristic rollout, 30-sample floor, 46/80.
 * Sampling-expectimax therefore does not simply supersede the heuristic at
 * Spades the way the poker equity bot does at Poker. It ships as an
 * explicitly-labelled experimental style — same tier 3 as Hard, a different
 * voice at the table — and the balance gates keep their existing arithmetic,
 * because a ladder that got promoted on a tie is a ladder that lies.
 *
 * What it also does, which a gate argument would have buried: the
 * determinisation machinery (constraint reconstruction, void-excluded
 * hidden-pool sampling) is the reusable substrate a stronger search policy
 * can lean on without ever learning to respect follow-suit proof again.
 *
 * Rolled worlds go through the same follow-suit truth machinery the game
 * uses, under the same spades-broken lead rule — a rollout that cannot be
 * played at the table is noise, not evidence.
 */

/** Limits on determinisations per decision; the floor keeps sims cheap. */
const MIN_SAMPLES = 30;
const MAX_SAMPLES = 120;
const MS_PER_SAMPLE = 20;

interface Constraint {
  /** Suits this seat has provably become void in (failed to follow). */
  voids: readonly string[];
}

/**
 * Reconstructs every provable constraint from public play history. Completed
 * tricks t span `plays[4t..4t+3]`; the live trick is whatever is left after.
 */
function inferConstraints(view: SpadesState, mySeat: SeatId): readonly Constraint[] {
  void mySeat;
  const voidMaps = Array.from({ length: SPADES_SEATS }, () => new Set<string>());
  const rules = spadesTrickRules();

  for (let index = 0; index < view.plays.length; index++) {
    const trickStart = Math.floor(index / SPADES_SEATS) * SPADES_SEATS;
    const position = index - trickStart;
    if (position === 0) continue;
    const ledPlay = view.plays[trickStart]!;
    const led = effectiveSuit(ledPlay.card, rules);
    const play = view.plays[index]!;
    if (led !== null && effectiveSuit(play.card, rules) !== led) {
      voidMaps[play.seat]!.add(led);
    }
  }

  return voidMaps.map((suits) => ({ voids: [...suits] }) as Constraint);
}

function effectiveSuit(card: CardId, rules: ReturnType<typeof spadesTrickRules>): string | null {
  return rules.effectiveSuit ? rules.effectiveSuit(card) : rules.suitOf(card);
}

/** Cards the opponents can still hold: deck − own hand − everything already played. */
function hiddenPool(view: SpadesState, mySeat: SeatId): CardId[] {
  const seen = new Set<CardId>(view.plays.map((play) => play.card));
  for (const card of view.hands[mySeat] ?? []) seen.add(card);
  return DECK.cardIds.filter((card) => !seen.has(card));
}

interface World {
  state: SpadesState;
}

/**
 * Samples one legal determinisation. Assignment walks seats in order and
 * rejects a deal that ever hangs a void suit on a seat that gave it up —
 * redetermined worlds have to agree with the public record.
 */
function determinize(
  view: SpadesState,
  mySeat: SeatId,
  constraints: readonly Constraint[],
  rng: Rng,
): World | null {
  const pool = rng.shuffle(hiddenPool(view, mySeat));
  const hands: CardId[][] = [];
  let cursor = 0;
  for (let seat = 0; seat < SPADES_SEATS; seat++) {
    const size = view.hands[seat]?.length ?? 0;
    if (seat === mySeat) {
      hands.push([...view.hands[seat]!] as CardId[]);
      continue;
    }
    const candidate = pool.slice(cursor, cursor + size);
    const constraint = constraints[seat];
    void constraint;
    if (constraint && violates(candidate, constraint.voids, spadesTrickRules())) {
      return null;
    }
    hands.push(candidate);
    cursor += size;
  }
  if (cursor !== pool.length) return null;
  return { state: { ...view, hands } as SpadesState };
}

/** A sampled hand must not own a suit its holder provably gave up. */
function violates(
  cards: readonly CardId[],
  voidSuits: readonly string[],
  rules: ReturnType<typeof spadesTrickRules>,
): boolean {
  for (const card of cards) {
    const suit = effectiveSuit(card, rules);
    if (suit !== null && voidSuits.includes(suit)) return true;
  }
  return false;
}

/** Follow-suit legality in the shape rollout simulation studies. */
function legalFollowers(
  hand: readonly CardId[],
  trick: Trick | null,
  spadesBroken: boolean,
): CardId[] {
  const rules = spadesTrickRules();
  if (trick === null || trick.ledSuit === null) {
    if (spadesBroken) return [...hand];
    const nonSpades = hand.filter((card) => !isSpade(card));
    return nonSpades.length > 0 ? nonSpades : allSpades(hand) ? [...hand] : nonSpades;
  }
  const led = trick.ledSuit;
  const followers = hand.filter(
    (card) => followError({ ledSuit: led, hand, card }, rules) === null,
  );
  return followers;
}

interface RolloutResult {
  tricks: number[];
}

/**
 * Rollout policy: the Hard heuristic the table already knows, run against
 * the redetermined (full-information) world. Rollouts must be sane enough
 * that a rollout score maps to partnership work — random walks are the
 * ISMCTS failure mode this design avoids.
 */
function chooseRollout(
  state: SpadesState,
  seat: SeatId,
  legal: readonly CardId[],
  _rng: Rng,
): CardId {
  void _rng;
  if (legal.length === 1) return legal[0]!;
  return decidePlay(state, seat, legal, ROLLOUT_PLAY_PARAMS);
}

/**
 * Plays a redetermined world out with the rollout heuristic, mutating nothing
 * shared — the world was sampled from the view and stays a small mutable copy.
 */
function rollout(world: World, rng: Rng): RolloutResult {
  const tricks: number[] = [0, 0, 0, 0];
  const state = world.state;
  // complete the live trick first (its winner inherits the lead)
  let trick = state.trick;
  let leader = state.leader;
  let turn = state.turn;
  let tricksTakenNow = state.tricksPlayed;
  if (trick !== null) {
    const winner = resolveTrickWinner(trick, spadesTrickRules());
    tricks[winner ?? leader ?? 0]! += 1;
    trick = null;
    leader = winner ?? leader ?? 0;
    turn = leader ?? 0;
    tricksTakenNow += 1;
  }
  while (tricksTakenNow < 13) {
    const hand = (state.hands[turn] ?? []) as CardId[];
    const legal = legalFollowers(hand, trick, state.spadesBroken);
    if (legal.length === 0) break;
    const played = chooseRollout(
      { ...state, trick, leader, turn, stage: turn >= 0 ? 'playing' : 'bidding' } as SpadesState,
      turn,
      legal,
      rng,
    );
    state.hands[turn] = hand.filter((held) => held !== played);
    const rules = spadesTrickRules();
    const nextTrick: Trick =
      trick === null
        ? {
            leader: turn,
            plays: [{ seat: turn, card: played }],
            ledSuit: effectiveSuit(played, rules),
          }
        : {
            ...trick,
            plays: [...trick.plays, { seat: turn, card: played }],
            ledSuit: trick.ledSuit ?? effectiveSuit(played, rules),
          };
    if (!state.spadesBroken && isSpade(played)) state.spadesBroken = true;
    if (nextTrick.plays.length >= SPADES_SEATS) {
      const winner = resolveTrickWinner(nextTrick, rules);
      tricks[winner ?? 0]! += 1;
      trick = null;
      leader = winner ?? 0;
      turn = leader ?? 0;
      tricksTakenNow += 1;
    } else {
      trick = nextTrick;
      turn = advanceSeatLocal(turn);
    }
  }
  return { tricks };
}

function advanceSeatLocal(from: SeatId, steps = 1): SeatId {
  return (from + steps) % SPADES_SEATS;
}

/**
 * Weighs a completed rollout by tricks scored asmatch. Nil inverts: avoid
 * the team's nil seat by large multiples against the raw count.
 */
function score(
  tricks: readonly number[],
  self: SeatId,
  bid: readonly (SpadesState['bids'][number] | null)[],
): number {
  const partner = (self + 2) % SPADES_SEATS;
  const myTeam = teamOf(self);
  const team = (tricks[self] ?? 0) + (tricks[partner] ?? 0);
  const opponents = tricks.reduce(
    (sum, count, seat) => (teamOf(seat) === myTeam ? sum : sum + count),
    0,
  );
  const base = team - opponents;
  const selfNil = bid[self]?.nil === true;
  const partnerNil = bid[partner]?.nil === true;
  if (selfNil) return -4 * (tricks[self] ?? 0);
  if (partnerNil) return base - 4 * (tricks[partner] ?? 0);
  return base;
}

/**
 * Applies one candidate play and measures the rollout gain. Illegal
 * candidates would short-circuit the sim gate, so the world's own sample
 * legal-following needs to admit it; rollout readability tolerates a null.
 */
function applyAndRollout(
  world: World,
  self: SeatId,
  card: CardId,
  rng: Rng,
): { tricks: number[] } | null {
  const state = world.state;
  const hand = (state.hands[self] ?? []) as CardId[];
  if (!hand.includes(card)) return null;
  state.hands[self] = hand.filter((held) => held !== card);
  const rules = spadesTrickRules();
  const trick: Trick =
    state.trick === null
      ? { leader: self, plays: [{ seat: self, card }], ledSuit: effectiveSuit(card, rules) }
      : {
          ...state.trick,
          plays: [...state.trick.plays, { seat: self, card }],
          ledSuit: state.trick.ledSuit ?? effectiveSuit(card, rules),
        };
  if (!state.spadesBroken && isSpade(card)) state.spadesBroken = true;
  state.trick = trick;
  // act-or-complete has to be decided before rollout
  if (trick.plays.length < SPADES_SEATS) {
    state.turn = advanceSeatLocal(self);
    state.leader = (state.trick as Trick).leader;
  }
  return rollout(world, rng);
}

/**
 * Samples determinisations and returns the play whose mean rollout gain is
 * best. Fall back to the profile heuristic when no constraint-consistent
 * world samples (a corrupted view, or a 20-card void mask with 14 cards in
 * it — the PIMC answer to "sometimes the math says someone is bluffing").
 */
function searchPlay(
  view: SpadesState,
  seat: SeatId,
  legal: readonly LegalMove[],
  rng: Rng,
  thinkMs: number,
): LegalMove | null {
  const cards = legal
    .map((move) => (move.payload as { card?: string } | undefined)?.card ?? '')
    .filter(Boolean);
  if (cards.length === 0) return null;

  const constraints = inferConstraints(view, seat);
  const samples = Math.max(MIN_SAMPLES, Math.min(MAX_SAMPLES, Math.floor(thinkMs / MS_PER_SAMPLE)));
  const sampler = rng.fork('pimc');
  const totals = new Map<CardId, number>();
  let counted = 0;

  for (let sample = 0; sample < samples; sample++) {
    const world = determinize(view, seat, constraints, sampler);
    if (world === null) continue;
    for (const card of cards) {
      // each candidate gets its own rollout fork so candidates cannot bleed
      // statistics into each other through the shared stream
      const worldCopy: World = {
        state: { ...world.state, hands: world.state.hands.map((h) => [...h]) } as SpadesState,
      };
      const gains = applyAndRollout(worldCopy, seat, card, rng.fork(`${sample}`));
      if (gains === null) continue;
      totals.set(card, (totals.get(card) ?? 0) + score(gains.tricks, seat, view.bids));
    }
    counted += 1;
  }
  if (counted === 0) return legal[0] as LegalMove;

  let best: LegalMove | null = null;
  let bestMean = -Infinity;
  for (const move of legal) {
    const card = (move.payload as { card?: string } | undefined)?.card;
    if (!card) continue;
    const mean = (totals.get(card) ?? -Infinity) / counted;
    if (mean > bestMean) {
      bestMean = mean;
      best = move;
    }
  }
  return best ?? (legal[0] as LegalMove);
}

/** Rollout play-shaped the way Hard plays live; keeps the rollout policy honest. */
const ROLLOUT_PLAY_PARAMS: PlayParams = {
  coverPartner: true,
  eagerRuff: true,
  bagAvoid: true,
  protectNil: true,
};

function searchProfile(): BotProfile {
  return {
    bid: { aggression: -0.05, nilMax: 0.6, nilSpadeCap: 2, bagFear: 7, jitter: 0.05 },
    play: { coverPartner: true, eagerRuff: true, bagAvoid: true, protectNil: true },
  };
}

/**
 * The packaged policy: bid through the strongest available heuristic *(same
 * hedging as Hard but with tighter jitter)*, play through sampling-expectimax
 * over the determinised field.
 */
export function searchBot(): BotPolicy<SpadesState> {
  const profile = searchProfile();
  return {
    id: 'spades-search',
    label: 'Search',
    tier: 3,
    chooseMove(view, seat, legal, rng, ctx) {
      if (legal.length === 0) return null;
      const isBidPhase = legal.some((move) => move.id === 'bid' || move.id === 'bidNil');
      if (isBidPhase) return chooseFromProfile(view, seat, legal, rng, profile);
      return (
        searchPlay(view, seat, legal, rng, ctx.thinkMs()) ??
        chooseFromProfile(view, seat, legal, rng, profile)
      );
    },
  };
}
