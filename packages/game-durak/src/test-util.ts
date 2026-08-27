import { createFx, makeRng, type CardId, type MoveCtx, type SeatId } from '@parlour/engine';
import { suitOf } from './cards';
import { durakConfig, type DurakRules } from './config';
import type { DurakState, DurakTablePair } from './state';

export function rules(overrides: Partial<DurakRules> = {}): DurakRules {
  return durakConfig.resolve(overrides);
}

export interface StateSeed {
  hands: CardId[][];
  stock?: CardId[];
  trumpCard: CardId;
  table?: readonly DurakTablePair[];
  attacker?: SeatId;
  defender?: SeatId;
  attackers?: readonly SeatId[];
  passed?: readonly SeatId[];
  attackCap?: number;
  out?: readonly SeatId[];
}

/** Builds a full `DurakState` from a partial seed, for unit tests that do not need a real deal. */
export function state(seed: StateSeed, ruleOverrides: Partial<DurakRules> = {}): DurakState {
  const seats = seed.hands.length;
  const attacker = seed.attacker ?? 0;
  const defender = seed.defender ?? (((attacker + 1) % seats) as SeatId);
  return {
    seats,
    rules: rules(ruleOverrides),
    veiled: false,
    hands: seed.hands.map((cards) => [...cards]),
    stock: [...(seed.stock ?? [])],
    trumpCard: seed.trumpCard,
    trumpSuit: suitOf(seed.trumpCard),
    table: (seed.table ?? []).map((pair) => ({ ...pair })),
    attacker,
    defender,
    attackers: seed.attackers ?? [attacker],
    passed: seed.passed ?? [],
    attackCap: seed.attackCap ?? 6,
    boutIndex: 0,
    out: seed.out ?? [],
    outcome: null,
  };
}

/** A move context whose rng and fx are inspectable, standing in for the runtime. */
export function ctx(seq = 0): MoveCtx & { fx: ReturnType<typeof createFx> } {
  return { rng: makeRng(1234).fork(`ev:${seq}`), fx: createFx(), event: { seq } };
}

export function fxKinds(context: { fx: { events: readonly { kind: string }[] } }): string[] {
  return context.fx.events.map((event) => event.kind);
}
