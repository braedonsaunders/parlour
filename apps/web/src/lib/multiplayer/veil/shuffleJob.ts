/**
 * The one expensive thing in the ceremony, in a form that can cross a worker
 * boundary.
 *
 * Laying a layer is `deck.length` modular exponentiations at 2048 bits followed
 * by a permutation. Everything else in a ceremony is hashing and message
 * passing; this is the part that costs a phone real time, so this is the part
 * that leaves the main thread.
 *
 * Elements travel as hex rather than `bigint` because that is what the deck is
 * already made of on the wire — no conversion at the boundary, and no reliance
 * on structured clone carrying BigInt. The job is pure, so the worker and the
 * in-thread fallback run the *same* code and cannot drift into shuffling
 * differently.
 */

import { applyPermutation, elementFromHex, elementToHex, encryptElement } from './sra';

export interface ShuffleJob {
  /** the deck as it stands, hex-encoded group elements */
  deck: readonly string[];
  /** the layer's encryption exponent, hex */
  e: string;
  /** this seat's private permutation */
  order: readonly number[];
}

export function runShuffleJob(job: ShuffleJob): string[] {
  const key = { e: BigInt(`0x${job.e}`) };
  const encrypted = job.deck.map((element) => encryptElement(elementFromHex(element), key));
  return applyPermutation(encrypted, job.order).map(elementToHex);
}
