import { describe, expect, it, vi } from 'vitest';

// A shuffle is real modular exponentiation, so these get room to pay for it.
vi.setConfig({ testTimeout: 120_000, hookTimeout: 120_000 });

import {
  buildCodebook,
  elementToHex,
  generateLayerKey,
  randomPermutation,
  shuffleLayer,
} from './sra';
import { runShuffleJob } from './shuffleJob';
import { ShuffleRunner, type ShuffleWorkerLike } from './shuffleClient';
import type { ShuffleResponse } from './shuffle.worker';

const CARDS = ['S1', 'S2', 'H3', 'H4', 'D5', 'D6', 'C7', 'C8'];

async function deckHex(): Promise<string[]> {
  const book = await buildCodebook('round', CARDS);
  return CARDS.map((card) => elementToHex(book.elementOf.get(card)!));
}

/**
 * A stand-in for the real worker that runs the same job the real one does.
 *
 * The point is not to fake the arithmetic — it is to exercise the request and
 * response protocol, the queueing and the failure paths, which is everything
 * about the client that a browser would otherwise be needed to test.
 */
class FakeWorker implements ShuffleWorkerLike {
  onmessage: ((event: MessageEvent<ShuffleResponse>) => void) | null = null;
  onerror: ((event: unknown) => void) | null = null;
  terminated = false;
  readonly seen: unknown[] = [];

  constructor(private readonly behaviour: 'answer' | 'error' | 'silent' = 'answer') {}

  postMessage(message: unknown): void {
    this.seen.push(message);
    if (this.behaviour === 'silent') return;
    const { id, ...job } = message as { id: number } & Parameters<typeof runShuffleJob>[0];
    queueMicrotask(() => {
      if (this.behaviour === 'error') {
        this.onmessage?.({
          data: { id, error: 'worker refused' },
        } as MessageEvent<ShuffleResponse>);
        return;
      }
      this.onmessage?.({
        data: { id, deck: runShuffleJob(job) },
      } as MessageEvent<ShuffleResponse>);
    });
  }

  terminate(): void {
    this.terminated = true;
  }
}

describe('the shuffle job', () => {
  // The worker and the fallback must not be able to shuffle differently: a
  // layer that differed between them would fail its own commitment check.
  it('matches the in-thread shuffle exactly', async () => {
    const deck = await deckHex();
    const key = generateLayerKey();
    const order = randomPermutation(CARDS.length);

    const viaJob = runShuffleJob({ deck, e: key.e.toString(16), order });
    const direct = shuffleLayer(
      deck.map((element) => BigInt(`0x${element}`)),
      key,
      order,
    ).map(elementToHex);

    expect(viaJob).toEqual(direct);
  });
});

describe('the shuffle runner', () => {
  it('sends the layer to the worker and returns what it shuffled', async () => {
    const worker = new FakeWorker();
    const runner = new ShuffleRunner(() => worker);
    const deck = await deckHex();
    const key = generateLayerKey();
    const order = randomPermutation(CARDS.length);

    const shuffled = await runner.shuffle({ deck, e: key.e.toString(16), order });

    expect(worker.seen).toHaveLength(1);
    expect(shuffled).toEqual(runShuffleJob({ deck, e: key.e.toString(16), order }));
  });

  it('reuses one worker across layers rather than starting one per epoch', async () => {
    let built = 0;
    const worker = new FakeWorker();
    const runner = new ShuffleRunner(() => {
      built++;
      return worker;
    });
    const deck = await deckHex();
    const key = generateLayerKey();
    const order = randomPermutation(CARDS.length);

    await runner.shuffle({ deck, e: key.e.toString(16), order });
    await runner.shuffle({ deck, e: key.e.toString(16), order });

    expect(built).toBe(1);
    expect(worker.seen).toHaveLength(2);
  });

  it('keeps concurrent layers apart by request id', async () => {
    const worker = new FakeWorker();
    const runner = new ShuffleRunner(() => worker);
    const deck = await deckHex();
    const first = { deck, e: generateLayerKey().e.toString(16), order: randomPermutation(8) };
    const second = { deck, e: generateLayerKey().e.toString(16), order: randomPermutation(8) };

    const [a, b] = await Promise.all([runner.shuffle(first), runner.shuffle(second)]);

    expect(a).toEqual(runShuffleJob(first));
    expect(b).toEqual(runShuffleJob(second));
    expect(a).not.toEqual(b);
  });

  // Losing the worker should cost smoothness, never the round.
  it('shuffles in-thread when the worker cannot be created', async () => {
    const runner = new ShuffleRunner(() => {
      throw new Error('no worker here');
    });
    const deck = await deckHex();
    const job = { deck, e: generateLayerKey().e.toString(16), order: randomPermutation(8) };

    expect(await runner.shuffle(job)).toEqual(runShuffleJob(job));
  });

  it('shuffles in-thread when the worker answers without a deck', async () => {
    class EmptyDeckWorker extends FakeWorker {
      postMessage(message: unknown): void {
        this.seen.push(message);
        const { id } = message as { id: number };
        queueMicrotask(() => {
          this.onmessage?.({ data: { id } as ShuffleResponse } as MessageEvent<ShuffleResponse>);
        });
      }
    }
    const runner = new ShuffleRunner(() => new EmptyDeckWorker());
    const deck = await deckHex();
    const job = { deck, e: generateLayerKey().e.toString(16), order: randomPermutation(8) };

    expect(await runner.shuffle(job)).toEqual(runShuffleJob(job));
  });

  it('shuffles in-thread when the worker reports a failure', async () => {
    const runner = new ShuffleRunner(() => new FakeWorker('error'));
    const deck = await deckHex();
    const job = { deck, e: generateLayerKey().e.toString(16), order: randomPermutation(8) };

    expect(await runner.shuffle(job)).toEqual(runShuffleJob(job));
  });

  it('stops using a worker that has died, without dropping the layer', async () => {
    const worker = new FakeWorker('silent');
    const runner = new ShuffleRunner(() => worker);
    const deck = await deckHex();
    const job = { deck, e: generateLayerKey().e.toString(16), order: randomPermutation(8) };

    const pending = runner.shuffle(job);
    worker.onerror?.(new Error('worker crashed'));

    expect(await pending).toEqual(runShuffleJob(job));
  });

  it('terminates the worker when disposed', () => {
    const worker = new FakeWorker();
    const runner = new ShuffleRunner(() => worker);
    void runner.shuffle({ deck: [], e: '3', order: [] });
    runner.dispose();
    expect(worker.terminated).toBe(true);
  });
});
