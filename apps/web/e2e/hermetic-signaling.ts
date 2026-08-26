/**
 * Hermetic signalling bridge for the multi-context multiplayer suite.
 *
 * Two Playwright browser contexts cannot share a JavaScript object. This
 * file bridges them: a single {@link HermeticSignalingBroker} lives in the
 * test runner (Node), and each page gets a {@link RoomSignaling} backed by
 * {@link https://playwright.dev/docs/api/class-page#page-expose-function | page.exposeFunction}
 * and {@link https://playwright.dev/docs/api/class-page#page-add-init-script | page.addInitScript}.
 *
 * ## Architecture
 *
 *   page A ──exposeFunction──┐
 *                             ├── HermeticSignalingBroker (Node)
 *   page B ──exposeFunction──┘
 *
 * - **announce / resolve / send** flow page→Node via a single `__parlourCall`
 *   dispatcher. The broker stores announcements in a per-code list (mirroring
 *   a relay that keeps every event) and routes signals by `(code, publicKey)`.
 *
 * - **subscribe** registers a Node-side forwarder that delivers signals back
 *   to the page via `page.evaluate`.
 *
 * ## Usage
 *
 * ```ts
 * const broker = new HermeticSignalingBroker();
 * const hostPage = await hostCtx.newPage();
 * await broker.install(hostPage, 'host-key');
 * await hostPage.goto('/wild/create');
 * ```
 *
 * The room session reads `window.__PARLOUR_E2E_SIGNALING__` (the hook in
 * roomSession.ts calls `injectedSignaling()`).
 */

import type { Page } from '@playwright/test';
import type { RoomSettings } from '../src/lib/multiplayer/types';
import type { RoomAnnouncement, SignalPayload } from '../src/lib/multiplayer/NostrSignaling';

/** The subset of RoomSignaling that a page can call into Node for. */
type PageSideSignaling = {
  publicKey: string;
  announce(code: string, settings: RoomSettings): Promise<void>;
  resolve(code: string, expectedHost?: string): Promise<RoomAnnouncement>;
  send(code: string, targetPubkey: string, payload: SignalPayload): Promise<void>;
  subscribe(
    code: string,
    callback: (senderPubkey: string, payload: SignalPayload) => void,
  ): { close(): void };
  close(): void;
};

/**
 * One instance per multi-context test: holds announcements and routes signals
 * between pages. Two {@link HermeticSignalingBroker} instances are completely
 * isolated, so tests do not need unique room codes.
 */
export class HermeticSignalingBroker {
  /** Per-code announcement list, oldest index 0 — mirrors a real relay. */
  private readonly rooms = new Map<string, RoomAnnouncement[]>();

  /** Signal handlers keyed by (code, receiverPublicKey). */
  private readonly handlers = new Map<
    string,
    Map<string, (author: string, payload: SignalPayload) => void>
  >();

  // -----------------------------------------------------------------------
  // Bus methods — these are the Node-side backing store
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

  private onSignal(
    code: string,
    receiver: string,
    handler: (author: string, payload: SignalPayload) => void,
  ): void {
    const codeHandlers = this.handlers.get(code) ?? new Map();
    codeHandlers.set(receiver, handler);
    this.handlers.set(code, codeHandlers);
  }

  // -----------------------------------------------------------------------
  // Page install — called once per page before navigation
  // -----------------------------------------------------------------------

  /**
   * Wires a page into the broker so that `window.__PARLOUR_E2E_SIGNALING__`
   * is a working {@link RoomSignaling} backed by this broker.
   *
   * Must run BEFORE the first page navigation. All four ops (announce,
   * resolve, send, subscribe) flow through a single `__parlourCall` exposed
   * function, which keeps the bridge surface to one thing.
   */
  async install(page: Page, publicKey: string): Promise<void> {
    // ---- Page → Node: single dispatcher ----
    await page.exposeFunction('__parlourCall', (op: string, args: unknown[]) => {
      switch (op) {
        case 'announce':
          this.announce(args[0] as string, args[1] as string, args[2] as RoomSettings);
          return undefined;
        case 'resolve':
          return this.resolve(args[0] as string, (args[1] as string | null) ?? undefined);
        case 'send':
          this.deliver(
            args[0] as string,
            args[1] as string,
            args[2] as string,
            args[3] as SignalPayload,
          );
          return undefined;
        case 'subscribe':
          this.installForwarder(page, args[0] as string, args[1] as string);
          return undefined;
        default:
          throw new Error(`[bridge] unknown op: ${op}`);
      }
    });

    // ---- Build the RoomSignaling object on window, on every navigation. ----
    //
    // `addInitScript` runs before every document load, so the global is always
    // set before the app's React effects run. `publicKey` is passed as the
    // script argument — Playwright serialises it into the page.

    await page.addInitScript((pk: string) => {
      const w = window as typeof window & {
        __PARLOUR_E2E_SIGNALING__?: PageSideSignaling;
        __parlourCallbacks?: Record<string, (author: string, payload: SignalPayload) => void>;
        __parlourCall: (op: string, args: unknown[]) => Promise<unknown>;
      };

      w.__parlourCallbacks = {};

      w.__PARLOUR_E2E_SIGNALING__ = {
        publicKey: pk,

        async announce(code: string, settings: RoomSettings): Promise<void> {
          if (typeof w.__parlourCall !== 'function') {
            console.error(
              '[bridge] __parlourCall is not a function — exposeFunction may not have survived navigation',
            );
            throw new Error('bridge: exposeFunction binding not available');
          }
          await w.__parlourCall('announce', [pk, code, settings]);
        },

        async resolve(code: string, expectedHost?: string): Promise<RoomAnnouncement> {
          if (typeof w.__parlourCall !== 'function') {
            console.error('[bridge] __parlourCall is not a function');
            throw new Error('bridge: exposeFunction binding not available');
          }
          const result = (await w.__parlourCall('resolve', [
            code,
            expectedHost ?? null,
          ])) as RoomAnnouncement | null;
          if (!result) throw new Error('Room not found, expired, or hosted by a different peer');
          return result;
        },

        async send(code: string, target: string, payload: SignalPayload): Promise<void> {
          await w.__parlourCall('send', [pk, code, target, payload]);
        },

        subscribe(code: string, callback: (sender: string, payload: SignalPayload) => void) {
          w.__parlourCallbacks![pk] = callback;
          void w.__parlourCall('subscribe', [code, pk]).catch(() => {});
          return {
            close() {
              delete w.__parlourCallbacks![pk];
            },
          };
        },

        close() {
          // per-seat close is a no-op; the broker outlives any one page
        },
      };

      console.warn(`[bridge] init script ran, publicKey=${pk}`);
    }, publicKey);
  }

  /**
   * Installs a Node→page forwarder for a subscribed seat. When a signal
   * arrives for `receiver` on `code`, the broker calls `page.evaluate` to
   * invoke the page-side callback.
   *
   * The page may have been closed between subscribe and delivery (host
   * death, seat drop, test teardown). `page.isClosed()` guards against
   * evaluating into a dead context, which would throw and mask the real
   * failure behind it.
   */
  private installForwarder(page: Page, code: string, receiver: string): void {
    console.warn(`[bridge] subscribe code=${code} receiver=${receiver}`);
    this.onSignal(code, receiver, (author: string, payload: SignalPayload) => {
      if (page.isClosed()) return;
      void page.evaluate(
        ({ receiver: recv, author, payload }) => {
          const w = window as typeof window & {
            __parlourCallbacks?: Record<string, (author: string, payload: SignalPayload) => void>;
          };
          w.__parlourCallbacks?.[recv]?.(author, payload);
        },
        { receiver, author, payload },
      );
    });
  }

  /**
   * Drop all handlers for a seat whose context was closed.
   *
   * This prevents a race where a joiner with the same public key as a
   * departed seat gets the old page's stale forwarder instead of the new
   * one. Call before closing the context in test teardown.
   */
  dropKey(publicKey: string): void {
    for (const codeHandlers of this.handlers.values()) {
      codeHandlers.delete(publicKey);
    }
    this.rooms.forEach((list) => {
      for (let i = list.length - 1; i >= 0; i--) {
        if (list[i]!.hostPubkey === publicKey) list.splice(i, 1);
      }
    });
  }
}
