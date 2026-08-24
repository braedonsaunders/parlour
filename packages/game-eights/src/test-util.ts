import { createFx, makeRng, type CardId, type MoveCtx, type SeatId } from '@parlour/engine';
import { eightsConfig, type EightsRules } from './config';
import type { EightsRound, EightsState } from './state';
import { suitOf } from './cards';

export function rules(overrides: Partial<EightsRules> = {}): EightsRules {
  return eightsConfig.resolve(overrides);
}

export interface RoundSeed {
  hands: CardId[][];
  discard?: CardId[];
  stock?: CardId[];
  turn?: SeatId;
  direction?: 1 | -1;
  pendingDraw?: number;
  awaitingSuit?: SeatId | null;
  drawnCard?: CardId | null;
}

export function round(seed: RoundSeed): EightsRound {
  const discard = seed.discard ?? ['D5'];
  const top = discard[0];
  if (!top) throw new Error('a test round needs a discard');
  return {
    hands: seed.hands.map((cards) => [...cards]),
    stock: [...(seed.stock ?? [])],
    discard: [...discard],
    turn: seed.turn ?? 0,
    direction: seed.direction ?? 1,
    activeSuit: suitOf(top),
    pendingDraw: seed.pendingDraw ?? 0,
    awaitingSuit: seed.awaitingSuit ?? null,
    drawnCard: seed.drawnCard ?? null,
    outcome: null,
  };
}

export function state(seed: RoundSeed, ruleOverrides: Partial<EightsRules> = {}): EightsState {
  const seats = seed.hands.length;
  return {
    seats,
    rules: rules(ruleOverrides),
    scores: Array.from({ length: seats }, () => 0),
    roundsWon: Array.from({ length: seats }, () => 0),
    roundIndex: 0,
    dealer: 0,
    round: round(seed),
    folded: false,
    readied: [],
    lastOutcome: null,
  };
}

/** A move context whose rng and fx are inspectable, standing in for the runtime. */
export function ctx(seq = 0): MoveCtx & { fx: ReturnType<typeof createFx> } {
  return { rng: makeRng(1234).fork(`ev:${seq}`), fx: createFx(), event: { seq } };
}

export function fxKinds(context: { fx: { events: readonly { kind: string }[] } }): string[] {
  return context.fx.events.map((event) => event.kind);
}
