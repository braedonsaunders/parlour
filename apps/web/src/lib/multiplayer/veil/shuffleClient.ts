/**
 * Runs a shuffle layer on a worker, and keeps playing if it cannot.
 *
 * The ceremony is the one place Parlour does enough arithmetic to be felt: a
 * deck of 2048-bit modular exponentiations per seat, per epoch. On the main
 * thread that blocks everything — animation, input, and the heartbeat timer,
 * which is worse than it sounds, because a seat that misses enough heartbeats
 * is declared gone. A table could lose a player to its own shuffle.
 *
 * So the deck goes to a worker. Two things matter more than the speed:
 *
 * - The worker and the fallback run the *same* pure job ({@link runShuffleJob}),
 *   so they cannot shuffle differently. A layer that differed between paths
 *   would fail its own commitment check and wedge the round.
 * - A worker that cannot be created, dies, or reports an error is not fatal.
 *   The job runs in-thread instead, chunked so the timers still turn. Losing
 *   the worker should cost smoothness, never the round.
 */

import { runShuffleJob, type ShuffleJob } from './shuffleJob';
import type { ShuffleResponse } from './shuffle.worker';
import { shuffleLayerAsync } from './sra';
import { elementFromHex, elementToHex } from './sra';

/** The slice of `Worker` this client needs, so a test can stand one up. */
export interface ShuffleWorkerLike {
  postMessage(message: unknown): void;
  terminate(): void;
  onmessage: ((event: MessageEvent<ShuffleResponse>) => void) | null;
  onerror: ((event: unknown) => void) | null;
}

export type ShuffleWorkerFactory = () => ShuffleWorkerLike;

/**
 * How long to wait for a worker before giving up on it for this job.
 *
 * A worker that has stopped answering must not hold a ceremony open: the round
 * cannot deal until the layer is laid, so a silent worker would look exactly
 * like a hung table.
 */
const WORKER_TIMEOUT_MS = 30_000;

function defaultFactory(): ShuffleWorkerLike {
  return new Worker(new URL('./shuffle.worker.ts', import.meta.url), {
    type: 'module',
    name: 'parlour-veil-shuffle',
  }) as unknown as ShuffleWorkerLike;
}

/**
 * A worker shared by every ceremony in the tab.
 *
 * One is enough — layers are laid one at a time, in seat order — and starting a
 * fresh worker per layer would pay the startup cost on every epoch.
 */
export class ShuffleRunner {
  private worker: ShuffleWorkerLike | null = null;
  private broken = false;
  private nextId = 1;
  private readonly pending = new Map<
    number,
    {
      resolve: (deck: string[]) => void;
      reject: (error: Error) => void;
      timer: ReturnType<typeof setTimeout>;
    }
  >();

  constructor(private readonly factory: ShuffleWorkerFactory = defaultFactory) {}

  /** Available only where the platform has workers at all — never during SSR. */
  private ensureWorker(): ShuffleWorkerLike | null {
    if (this.broken) return null;
    if (this.worker) return this.worker;
    if (typeof Worker === 'undefined' && this.factory === defaultFactory) return null;
    try {
      const worker = this.factory();
      worker.onmessage = (event) => this.settle(event.data);
      worker.onerror = () => this.failAll(new Error('the shuffle worker stopped'));
      this.worker = worker;
      return worker;
    } catch {
      // A bundler that did not emit the worker, or a browser refusing to start
      // one, is a reason to shuffle in-thread — not a reason to stop playing.
      this.broken = true;
      return null;
    }
  }

  private settle(response: ShuffleResponse): void {
    const waiting = this.pending.get(response.id);
    if (!waiting) return;
    this.pending.delete(response.id);
    clearTimeout(waiting.timer);
    if ('error' in response) waiting.reject(new Error(response.error));
    else waiting.resolve(response.deck);
  }

  private failAll(error: Error): void {
    this.broken = true;
    this.worker = null;
    for (const [, waiting] of this.pending) {
      clearTimeout(waiting.timer);
      waiting.reject(error);
    }
    this.pending.clear();
  }

  /**
   * The deck with this layer applied.
   *
   * Resolves through the worker when there is one, and through the same job
   * in-thread when there is not.
   */
  async shuffle(job: ShuffleJob): Promise<string[]> {
    const worker = this.ensureWorker();
    if (!worker) return this.inThread(job);
    const id = this.nextId++;
    try {
      return await new Promise<string[]>((resolve, reject) => {
        const timer = setTimeout(() => {
          this.pending.delete(id);
          reject(new Error('the shuffle worker did not answer'));
        }, WORKER_TIMEOUT_MS);
        this.pending.set(id, { resolve, reject, timer });
        worker.postMessage({ id, ...job });
      });
    } catch {
      // Whatever went wrong with the worker, the layer still has to be laid.
      this.broken = true;
      return this.inThread(job);
    }
  }

  /** Chunked, so an in-thread fallback still lets the heartbeat timer run. */
  private async inThread(job: ShuffleJob): Promise<string[]> {
    const deck = job.deck.map(elementFromHex);
    const shuffled = await shuffleLayerAsync(deck, { e: BigInt(`0x${job.e}`) }, job.order);
    return shuffled.map(elementToHex);
  }

  dispose(): void {
    this.worker?.terminate();
    this.worker = null;
  }
}

let shared: ShuffleRunner | null = null;

export function shuffleRunner(): ShuffleRunner {
  shared ??= new ShuffleRunner();
  return shared;
}

/** Runs one layer's arithmetic off the main thread where the platform allows. */
export function shuffleOffThread(job: ShuffleJob): Promise<string[]> {
  return shuffleRunner().shuffle(job);
}

export { runShuffleJob };
export type { ShuffleJob };
