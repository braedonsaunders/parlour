import { findWinnableSeed, type WinnableSeed } from '@parlour/game-klondike';
import type { WinnableWorkerReply, WinnableWorkerRequest } from './winnable.worker';

/**
 * Budget per candidate deal. Tuned in the game pack's solver bench: 200k nodes
 * proves roughly four deals in five, which is about as high as Klondike itself
 * goes, and costs a tenth of a second on a laptop.
 */
const NODE_BUDGET = 200_000;
const MAX_CANDIDATES = 12;
/** A search this slow means something is wrong; deal rather than hang. */
const WORKER_TIMEOUT_MS = 20_000;

let nextRequestId = 1;

function searchHere(seed: number, drawCount: 1 | 3): WinnableSeed {
  return findWinnableSeed(seed, drawCount, {
    nodeBudget: NODE_BUDGET,
    maxCandidates: MAX_CANDIDATES,
  });
}

/**
 * Finds a seed whose deal the solver can prove winnable, in a worker when the
 * runtime has one.
 *
 * The fallback runs the identical search on this thread: same code, same seed,
 * same answer — it only costs a stutter. That matters because the daily table is
 * supposed to be the same table for everyone, so a browser without workers must
 * not quietly get a different deal.
 */
export async function resolveWinnableSeed(seed: number, drawCount: 1 | 3): Promise<WinnableSeed> {
  if (typeof Worker === 'undefined') return searchHere(seed, drawCount);

  let worker: Worker;
  try {
    worker = new Worker(new URL('./winnable.worker.ts', import.meta.url), { type: 'module' });
  } catch {
    return searchHere(seed, drawCount);
  }

  const id = nextRequestId++;
  try {
    return await new Promise<WinnableSeed>((resolve, reject) => {
      const timer = window.setTimeout(
        () => reject(new Error('winnable search timed out')),
        WORKER_TIMEOUT_MS,
      );
      const settle = (outcome: WinnableSeed | Error) => {
        window.clearTimeout(timer);
        if (outcome instanceof Error) reject(outcome);
        else resolve(outcome);
      };
      worker.addEventListener('message', (event: MessageEvent<WinnableWorkerReply>) => {
        if (event.data.id !== id) return;
        const { seed: found, rejected, winnable } = event.data;
        settle({ seed: found, rejected, winnable });
      });
      worker.addEventListener('error', () => settle(new Error('winnable search failed')));
      const request: WinnableWorkerRequest = {
        id,
        seed,
        drawCount,
        nodeBudget: NODE_BUDGET,
        maxCandidates: MAX_CANDIDATES,
      };
      worker.postMessage(request);
    });
  } catch {
    return searchHere(seed, drawCount);
  } finally {
    worker.terminate();
  }
}
