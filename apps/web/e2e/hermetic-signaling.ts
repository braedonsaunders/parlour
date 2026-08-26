/**
 * Hermetic signalling bridge for the multi-context multiplayer suite.
 *
 * Two Playwright browser contexts cannot share a JavaScript object. This
 * file bridges them: a single {@link HermeticSignalingBroker} lives in
 * the test runner (Node), each page pushes ops to a polling outbox, and
 * the broker delivers results and signals back via `page.evaluate`.
 *
 * ## Architecture (no exposeFunction, no timing race)
 *
 *   page A ──outbox poll──┐
 *                          ├── HermeticSignalingBroker (Node)
 *   page B ──outbox poll──┘
 *
 * Page→Node: the addInitScript creates `window.__parlourOutbox` (a
 * `PendingOp[]`). Each op is `{op, args, id}`. The test driver loops
 * over the outbox, processes each op, and writes the result to
 * `window.__parlourResults[id]` via `page.evaluate`.
 *
 * Node→page: signals arrive at the broker's forwarder, which calls
 * `page.evaluate` to invoke `window.__parlourCallbacks[key](...)`.
 *
 * There are no Playwright `exposeFunction` bindings, so there is no
 * ordering race between addInitScript scripts. The outbox is polled
 * continuously during every `waitForOutboxDrain` call.
 *
 * ## Usage
 *
 * ```ts
 * const broker = new HermeticSignalingBroker();
 * const hostPage = await hostCtx.newPage();
 * await broker.install(hostPage, 'host-key');
 * await hostPage.goto('/wild/create');
 *
 * // After every app interaction, drain the outbox:
 * await broker.drain(hostPage);
 * await broker.drain(guestPage);
 * ```
 */

import type { Page } from '@playwright/test';
import type { RoomSettings } from '../src/lib/multiplayer/types';
import type { RoomAnnouncement, SignalPayload } from '../src/lib/multiplayer/NostrSignaling';

interface PendingOp {
  op: string;
  args: unknown[];
  id: number;
}

/**
 * One instance per multi-context test: holds announcements and routes
 * signals between pages. Two {@link HermeticSignalingBroker} instances
 * are completely isolated, so tests do not need unique room codes.
 */
export class HermeticSignalingBroker {
  private nextId = 1;

  /** Per-code announcement list, oldest index 0 — mirrors a real relay. */
  private readonly rooms = new Map<string, RoomAnnouncement[]>();

  /** Signal handlers keyed by (code, receiverPublicKey). */
  private readonly handlers = new Map<
    string,
    Map<string, (author: string, payload: SignalPayload) => void>
  >();

  /** Page-installed public keys that are awaiting outbox drains. */
  private readonly installedPages = new Map<string, Page>();

  // -----------------------------------------------------------------------
  // Bus methods — the Node-side backing store
  // -----------------------------------------------------------------------

  announce(author: string, code: string, settings: RoomSettings): void {
    console.warn(`[bridge] announce author=${author} code=${code}`);
    const existing = this.rooms.get(code) ?? [];
    existing.push({ hostPubkey: author, settings });
    this.rooms.set(code, existing);
  }

  resolve(code: string, expectedHost?: string): RoomAnnouncement | null {
    const list = this.rooms.get(code);
    if (!list || list.length === 0) {
      console.warn(`[bridge] resolve code=${code} → NOT FOUND`);
      return null;
    }
    if (expectedHost !== undefined) {
      for (let i = list.length - 1; i >= 0; i--) {
        if (list[i]!.hostPubkey === expectedHost) {
          console.warn(`[bridge] resolve code=${code} host=${expectedHost} → pinned`);
          return list[i]!;
        }
      }
      console.warn(`[bridge] resolve code=${code} host=${expectedHost} → NOT FOUND (pinned)`);
      return null;
    }
    const result = list[list.length - 1]!;
    console.warn(`[bridge] resolve code=${code} → host=${result.hostPubkey}`);
    return result;
  }

  deliver(author: string, code: string, target: string, payload: SignalPayload): void {
    console.warn(
      `[bridge] deliver author=${author} code=${code} target=${target} type=${payload.type}`,
    );
    const codeHandlers = this.handlers.get(code);
    const handler = codeHandlers?.get(target);
    handler?.(author, payload);
  }

  // -----------------------------------------------------------------------
  // Page install — called once per page before navigation
  // -----------------------------------------------------------------------

  /**
   * Installs the outbox-based bridge on `page`. No `exposeFunction` is used:
   * the page writes ops to a polling outbox, and `drain()` processes them.
   */
  async install(page: Page, publicKey: string): Promise<void> {
    this.installedPages.set(publicKey, page);

    // `addInitScript` runs before every document load, so the outbox and
    // the RoomSignaling facade are always set before React effects fire.
    await page.addInitScript((pk: string) => {
      const w = window as typeof window & {
        __parlourOutbox: PendingOp[];
        __parlourResults: Record<number, unknown>;
        __parlourCallbacks: Record<string, (author: string, payload: SignalPayload) => void>;
        __PARLOUR_E2E_SIGNALING__: {
          publicKey: string;
          announce(code: string, settings: RoomSettings): Promise<void>;
          resolve(code: string, expectedHost?: string): Promise<RoomAnnouncement>;
          send(code: string, targetPubkey: string, payload: SignalPayload): Promise<void>;
          subscribe(
            code: string,
            cb: (senderPubkey: string, payload: SignalPayload) => void,
          ): { close(): void };
          close(): void;
        };
      };

      w.__parlourOutbox = [];
      w.__parlourResults = {};
      w.__parlourCallbacks = {};
      let nextId = 1;
      const enqueue = (op: string, args: unknown[]): Promise<unknown> =>
        new Promise((resolve) => {
          const id = nextId++;
          w.__parlourOutbox.push({ op, args, id });
          // Poll for the result — the test driver writes it back via evaluate.
          const poll = () => {
            if (id in w.__parlourResults) {
              resolve(w.__parlourResults[id]);
              delete w.__parlourResults[id];
              return;
            }
            setTimeout(poll, 5);
          };
          poll();
        });

      w.__PARLOUR_E2E_SIGNALING__ = {
        publicKey: pk,

        async announce(code: string, settings: RoomSettings): Promise<void> {
          await enqueue('announce', [pk, code, settings]);
        },

        async resolve(code: string, expectedHost?: string): Promise<RoomAnnouncement> {
          const result = (await enqueue('resolve', [
            code,
            expectedHost ?? null,
          ])) as RoomAnnouncement | null;
          if (!result) throw new Error('Room not found, expired, or hosted by a different peer');
          return result;
        },

        async send(code: string, target: string, payload: SignalPayload): Promise<void> {
          await enqueue('send', [pk, code, target, payload]);
        },

        subscribe(code: string, callback: (sender: string, payload: SignalPayload) => void) {
          w.__parlourCallbacks[pk] = callback;
          enqueue('subscribe', [code, pk]).catch(() => {});
          return {
            close() {
              delete w.__parlourCallbacks[pk];
            },
          };
        },

        close() {},
      };

      console.warn(`[bridge] init script ran, publicKey=${pk}`);
    }, publicKey);
  }

  /**
   * Processes every pending op on `page`'s outbox and delivers any queued
   * signals. Call this after every app interaction (navigation, click) to
   * keep the bridge in sync.
   */
  async drain(page: Page): Promise<void> {
    const ops = await page.evaluate(() => {
      const w = window as unknown as {
        __parlourOutbox: PendingOp[];
        __parlourCallbacks: Record<string, (author: string, payload: SignalPayload) => void>;
      };
      const pending = w.__parlourOutbox.splice(0);
      // Also snapshot the callbacks — we need them for subscribe forwarding.
      const callbackKeys = Object.keys(w.__parlourCallbacks);
      return { pending, callbackKeys };
    });

    for (const op of ops.pending) {
      const result = this.processOp(op, page);
      if (result !== undefined) {
        // Write the result back — the page is polling for it.
        await page.evaluate(
          ({ id, value }) => {
            const w = window as unknown as { __parlourResults: Record<number, unknown> };
            w.__parlourResults[id] = value;
          },
          { id: op.id, value: result },
        );
      }
    }
  }

  private processOp(op: PendingOp, page: Page): unknown {
    switch (op.op) {
      case 'announce':
        this.announce(op.args[0] as string, op.args[1] as string, op.args[2] as RoomSettings);
        return undefined;
      case 'resolve':
        return this.resolve(op.args[0] as string, (op.args[1] as string | null) ?? undefined);
      case 'send':
        this.deliver(
          op.args[0] as string,
          op.args[1] as string,
          op.args[2] as string,
          op.args[3] as SignalPayload,
        );
        return undefined;
      case 'subscribe': {
        const code = op.args[0] as string;
        const receiver = op.args[1] as string;
        console.warn(`[bridge] subscribe code=${code} receiver=${receiver}`);
        // Install a Node-side forwarder: when a signal arrives for this
        // (code, receiver), call page.evaluate to invoke the page callback.
        const codeHandlers = this.handlers.get(code) ?? new Map();
        codeHandlers.set(receiver, (author: string, payload: SignalPayload) => {
          void page.evaluate(
            ({ receiver: recv, author, payload }) => {
              const w = window as unknown as {
                __parlourCallbacks: Record<
                  string,
                  (author: string, payload: SignalPayload) => void
                >;
              };
              w.__parlourCallbacks?.[recv]?.(author, payload);
            },
            { receiver, author, payload },
          );
        });
        this.handlers.set(code, codeHandlers);
        return undefined;
      }
      default:
        console.warn(`[bridge] unknown op: ${op.op}`);
        return undefined;
    }
  }
}
