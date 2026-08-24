import type { LegalMove, Rng, SeatId } from '@parlour/engine';
import { blindsForLevel } from '../config';
import { contestingSeats, potSoFar, toCall, type PokerState } from '../state';
import { equity } from './strength';

/**
 * Below this many big blinds a stack is short, and folding is no longer the
 * safe option — the blinds will take it anyway. A tournament player opens up
 * here; a bot that does not simply blinds out.
 */
const SHORT_STACK_BLINDS = 12;

/** Preflop equity converges fast and gets sampled a lot, so it is capped. */
const PREFLOP_SAMPLE_CAP = 80;

export interface BotProfile {
  /** Monte Carlo runs behind a read — the difficulty dial */
  samples: number;
  /**
   * How far above an even split of the pot a hand has to be before the bot
   * puts the first chips in, as a fraction of the distance from that split to
   * certainty. Negative plays hands that are behind.
   */
  entryRatio: number;
  /** the same measure, for opening or reraising before the flop */
  preflopRaiseRatio: number;
  /** the same measure, for betting after it */
  postflopRaiseRatio: number;
  /** how far above the pot odds a call has to look before it is taken */
  callMargin: number;
  /** 0..1 — how far up the raise ladder a bet reaches */
  aggression: number;
  /** 0..1 — chance of betting a hand that has nothing */
  bluff: number;
}

/**
 * Every threshold is expressed against an even split of the pot.
 *
 * Heads-up an even split is 50%; six-handed it is 17%. Stating the bars this
 * way means one set of numbers describes a profile at any table size, and the
 * bot tightens up as the table fills without being told to. The earlier
 * version compared a Chen score against a Monte Carlo equity as if they were
 * the same quantity, which is why the difficulty tiers barely separated.
 */
function barFor(opponents: number, ratio: number): number {
  const fairShare = 1 / (opponents + 1);
  return fairShare + ratio * (1 - fairShare);
}

function moveById(legal: readonly LegalMove[], id: string): LegalMove | undefined {
  return legal.find((move) => move.id === id);
}

function raisesIn(legal: readonly LegalMove[]): LegalMove[] {
  return legal.filter((move) => move.id === 'bet' || move.id === 'raise');
}

function amountOf(move: LegalMove): number {
  return (move.payload as { to?: number } | undefined)?.to ?? 0;
}

/**
 * Picks the raise closest to a target fraction of what is available.
 *
 * The ladder the rules hand out is already a sensible set of sizes, so the bot
 * chooses among them rather than inventing a number — which also means a bot
 * never bets an amount the table would find strange.
 */
function pickRaise(raises: readonly LegalMove[], fraction: number): LegalMove {
  const sorted = [...raises].sort((left, right) => amountOf(left) - amountOf(right));
  const at = Math.min(sorted.length - 1, Math.max(0, Math.round(fraction * (sorted.length - 1))));
  return sorted[at] as LegalMove;
}

/**
 * One betting decision.
 *
 * The shape is the one a person uses: work out what the hand is worth against
 * what it costs, and let temperament decide the rest. Everything separating the
 * tiers lives in {@link BotProfile} — there are no special cases per difficulty.
 */
export function decideAction(
  state: PokerState,
  seat: SeatId,
  legal: readonly LegalMove[],
  rng: Rng,
  profile: BotProfile,
): LegalMove | null {
  if (legal.length === 0) return null;

  const fold = moveById(legal, 'fold');
  const check = moveById(legal, 'check');
  const call = moveById(legal, 'call');
  const raises = raisesIn(legal);

  const preflop = state.street === 'preflop';
  const opponents = Math.max(1, contestingSeats(state).length - 1);
  const samples = preflop ? Math.min(profile.samples, PREFLOP_SAMPLE_CAP) : profile.samples;
  const strength = equity(state, seat, rng, samples);

  const owed = toCall(state, seat);
  const pot = potSoFar(state);
  const potOdds = owed > 0 ? owed / (pot + owed) : 0;

  const bigBlind = blindsForLevel(state.level).big;
  const stack = (state.stacks[seat] ?? 0) + (state.streetBet[seat] ?? 0);
  const short = stack <= SHORT_STACK_BLINDS * bigBlind;

  // Short stacks widen: waiting for a better hand costs blinds the stack
  // cannot spare, so both bars come down.
  const squeeze = short ? 0.55 : 1;
  const entryBar = barFor(opponents, profile.entryRatio * squeeze);
  const raiseBar = barFor(
    opponents,
    (preflop ? profile.preflopRaiseRatio : profile.postflopRaiseRatio) * squeeze,
  );

  const cheap = owed > 0 && potOdds < 0.12;
  const tooWeakToOpen = preflop && strength < entryBar && !cheap;

  if (strength >= raiseBar && raises.length > 0 && !tooWeakToOpen) {
    // A short stack that likes its hand moves in rather than betting a third of
    // itself and then facing a decision it has no chips left to make.
    const reach = short ? 1 : Math.min(0.8, profile.aggression * (strength - raiseBar + 0.5));
    return pickRaise(raises, reach);
  }

  if (owed === 0) {
    if (check) {
      const canBluff =
        raises.length > 0 && !preflop && strength < entryBar && rng.float() < profile.bluff;
      if (canBluff) return pickRaise(raises, profile.aggression * 0.4);
      return check;
    }
    return raises[0] ?? fold ?? (legal[0] as LegalMove);
  }

  if (!tooWeakToOpen && strength >= potOdds + profile.callMargin && call) return call;

  // Folding when it costs nothing to stay would be a bug, not a read.
  return fold ?? check ?? call ?? (legal[0] as LegalMove);
}
