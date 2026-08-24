/// <reference lib="webworker" />
import { findWinnableSeed } from '@parlour/game-klondike';

export interface WinnableWorkerRequest {
  id: number;
  seed: number;
  drawCount: 1 | 3;
  nodeBudget?: number;
  maxCandidates?: number;
}

export interface WinnableWorkerReply {
  id: number;
  seed: number;
  rejected: number;
  winnable: boolean;
}

/**
 * Proving a deal winnable is a real search — hundreds of milliseconds on a phone,
 * sometimes seconds. Off the main thread it costs the player a spinner instead of
 * a frozen tap.
 */
self.addEventListener('message', (event: MessageEvent<WinnableWorkerRequest>) => {
  const { id, seed, drawCount, nodeBudget, maxCandidates } = event.data;
  const found = findWinnableSeed(seed, drawCount, { nodeBudget, maxCandidates });
  const reply: WinnableWorkerReply = { id, ...found };
  self.postMessage(reply);
});
