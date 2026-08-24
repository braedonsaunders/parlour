import { unsafeUniformIntDistribution, xoroshiro128plus } from 'pure-rand';
import type { RandomGenerator } from 'pure-rand';
import { rngSeedFrom, type Rng } from './types';

const UINT32 = 0x100000000;
const POW_2_53 = 0x20000000000000;

function isState(value: unknown): value is readonly number[] {
  return Array.isArray(value) && value.every((n) => typeof n === 'number');
}

/**
 * Seeded deterministic RNG (spec §4.1). pure-rand exposes xoroshiro128plus as its
 * xoroshiro family generator; there is no `++` variant in pure-rand v7.
 *
 * ## The 32-bit ceiling, stated out loud
 *
 * `seed | 0` is a deliberate narrowing, and it is load-bearing for replay: a
 * seed has to survive JSON, a room announcement, and the 32-bit FNV-1a in
 * `rngSeedFrom` that {@link Rng.fork} re-seeds through. So every stream in the
 * engine — the opening shuffle, each per-event stream in runtime.ts, every
 * bot's stream — is keyed by at most 32 bits.
 *
 * What that means, precisely:
 *
 * - There are at most 2^32 distinct deals per game, not 52! ~= 2^226. No player
 *   will notice; a table would need billions of hands before a repeat was
 *   likely.
 * - It is NOT a fair shuffle in the cryptographic sense, and nothing in Parlour
 *   may claim it is. Anyone holding the seed holds the whole deck. That is
 *   exactly why an open room is described to players as readable by a modified
 *   client (see components/multiplayer/TableSecurity.tsx), and why hiding hands
 *   is Veil's job rather than this file's.
 * - A seeded daily deal (Solitaire, a shared puzzle) is unaffected: 2^32 daily
 *   seeds is about 11 million years of distinct puzzles, and publishing the
 *   seed is the point in that mode.
 *
 * Widening this means widening `Rng.fork`'s hash and the wire seed together.
 * Doing either one alone buys nothing.
 */
export function makeRng(seed: number): Rng {
  let gen: RandomGenerator = xoroshiro128plus(seed | 0);

  const rng: Rng = {
    int(maxExclusive: number): number {
      if (!Number.isInteger(maxExclusive) || maxExclusive < 1) {
        throw new Error(`rng.int: maxExclusive must be a positive integer, got ${maxExclusive}`);
      }
      return unsafeUniformIntDistribution(0, maxExclusive - 1, gen);
    },

    float(): number {
      const hi = unsafeUniformIntDistribution(0, 0x1fffff, gen);
      const lo = unsafeUniformIntDistribution(0, 0xffffffff, gen);
      return (hi * UINT32 + lo) / POW_2_53;
    },

    shuffle<T>(items: readonly T[]): T[] {
      const out = items.slice();
      for (let i = out.length - 1; i > 0; i--) {
        const j = unsafeUniformIntDistribution(0, i, gen);
        const a = out[i] as T;
        const b = out[j] as T;
        out[i] = b;
        out[j] = a;
      }
      return out;
    },

    pick<T>(items: readonly T[]): T {
      if (items.length === 0) throw new Error('rng.pick: empty collection');
      return items[unsafeUniformIntDistribution(0, items.length - 1, gen)] as T;
    },

    fork(salt: string | number): Rng {
      return makeRng(rngSeedFrom(`${gen.getState().join(',')}|${String(salt)}`));
    },

    getState(): unknown {
      return gen.getState().slice();
    },

    setState(state: unknown): void {
      if (!isState(state)) throw new Error('rng.setState: expected a number[] state');
      gen = xoroshiro128plus.fromState(state);
    },
  };

  return rng;
}
