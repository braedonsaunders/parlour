/// <reference lib="webworker" />

/**
 * The shuffle worker: one deck of modular exponentiations, off the main thread.
 *
 * Deliberately tiny. It owns no state, no crypto decisions and no protocol — it
 * runs {@link runShuffleJob}, which is the same function the in-thread fallback
 * runs, and hands the deck back. A failure is reported rather than swallowed so
 * the caller can fall back instead of waiting on a reply that never comes.
 */

import { runShuffleJob, type ShuffleJob } from './shuffleJob';

export interface ShuffleRequest extends ShuffleJob {
  id: number;
}

export type ShuffleResponse =
  | { id: number; deck: string[] }
  | { id: number; error: string };

const scope = self as unknown as DedicatedWorkerGlobalScope;

scope.onmessage = (event: MessageEvent<ShuffleRequest>) => {
  const { id, ...job } = event.data;
  try {
    scope.postMessage({ id, deck: runShuffleJob(job) } satisfies ShuffleResponse);
  } catch (error) {
    scope.postMessage({
      id,
      error: error instanceof Error ? error.message : 'shuffle failed',
    } satisfies ShuffleResponse);
  }
};
