/**
 * Hermetic signalling bridge for the multi-context multiplayer suite.
 *
 * Two Playwright browser contexts cannot share a JavaScript object. This
 * file bridges them: a single {@link HermeticSignalingBroker} lives in the
 * test runner (Node), and each page gets a {@link RoomSignaling} backed by
 * {@link https://playwright.dev/docs/api/class-page#page-expose-function | page.exposeFunction}
 * calls into that broker.
 *
 * ## Architecture
 *
 *   page A ──exposeFunction──┐
 *                             ├── HermeticSignalingBroker (Node)
 *   page B ──exposeFunction──┘
 *
 * - **announce / resolve / send** flow page→Node synchronously. The broker
 *   stores announcements in a `Map<string, RoomAnnouncement[]>` (mirroring a
 *   relay that keeps every event) and routes signals by `(code, publicKey)`.
 *
 * - **subscribe** is the trickiest part. The page calls `subscribe(code, cb)`
 *   and stores `cb` on `window.__parlourCallbacks`. The broker stores a
 *   forwarder that, on delivery, calls `page.evaluate` to invoke that stored
 *   callback. `close()` sends an `unsubscribe` message back to Node.
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
 * The room session reads `window.__PARLOUR_E2E_SIGNALING__` (hook in
 * roomSession.ts — see the HOOK REQUEST at the bottom of this file).
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
    const existing = this.rooms.get(code) ?? [];
    existing.push({ hostPubkey: author, settings });
    this.rooms.set(code, existing);
  }

  resolve(code: string, expectedHost?: string): RoomAnnouncement | null {
    const list = this.rooms.get(code);
    if (!list || list.length === 0) return null;
    if (expectedHost !== undefined) {
      for (let i = list.length - 1; i >= 0; i--) {
        if (list[i]!.hostPubkey === expectedHost) return list[i]!;
      }
      return null;
    }
    return list[list.length - 1]!;
  }

  deliver(author: string, code: string, target: string, payload: SignalPayload): void {
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
   * Must run BEFORE the first page navigation. `exposeFunction` binds to the
   * window, and the binding persists across navigations.
   */
  async install(page: Page, publicKey: string): Promise<void> {
    // ---- Node-side functions exposed to the page ----

    await page.exposeFunction(
      '__parlourAnnounce',
      (author: string, code: string, settings: RoomSettings) => {
        this.announce(author, code, settings);
      },
    );

    await page.exposeFunction('__parlourResolve', (code: string, expectedHost: string | null) => {
      return this.resolve(code, expectedHost ?? undefined);
    });

    await page.exposeFunction(
      '__parlourSend',
      (author: string, code: string, target: string, payload: SignalPayload) => {
        this.deliver(author, code, target, payload);
      },
    );

    const pageRef = page;
    await page.exposeFunction('__parlourSubscribe', (code: string, receiver: string) => {
      // Only install the forwarder once per (code, receiver) pair — a
      // second subscribe for the same pair replaces the old handler
      // (the transport only ever holds one subscription per code).
      this.onSignal(code, receiver, (author: string, payload: SignalPayload) => {
        void pageRef.evaluate(
          ({ author, payload }) => {
            const w = window as Window & {
              __parlourCallbacks?: Record<string, (author: string, payload: SignalPayload) => void>;
            };
            w.__parlourCallbacks?.[receiver]?.(author, payload);
          },
          { author, payload },
        );
      });
    });

    // ---- Build the RoomSignaling object on window, on every navigation -.
    //
    // `page.evaluate` would set the global once and lose it on the first
    // navigation (a reload wipes the window). `addInitScript` re-runs the
    // setup before every document, so the app — which reads the global from
    // inside a React effect AFTER `page.goto()` — always sees it.

    await page.addInitScript((pk: string) => {
      const w = window as unknown as Window & {
        __PARLOUR_E2E_SIGNALING__?: PageSideSignaling;
        __parlourCallbacks?: Record<string, (author: string, payload: SignalPayload) => void>;
        __parlourAnnounce: (author: string, code: string, settings: RoomSettings) => Promise<void>;
        __parlourResolve: (
          code: string,
          expectedHost: string | null,
        ) => Promise<RoomAnnouncement | null>;
        __parlourSend: (
          author: string,
          code: string,
          target: string,
          payload: SignalPayload,
        ) => Promise<void>;
        __parlourSubscribe: (code: string, receiver: string) => Promise<void>;
      };

      w.__parlourCallbacks = {};

      w.__PARLOUR_E2E_SIGNALING__ = {
        publicKey: pk,

        async announce(code: string, settings: RoomSettings): Promise<void> {
          await w.__parlourAnnounce(pk, code, settings);
        },

        async resolve(code: string, expectedHost?: string): Promise<RoomAnnouncement> {
          const result = await w.__parlourResolve(code, expectedHost ?? null);
          if (!result) throw new Error('Room not found, expired, or hosted by a different peer');
          return result;
        },

        async send(code: string, target: string, payload: SignalPayload): Promise<void> {
          await w.__parlourSend(pk, code, target, payload);
        },

        subscribe(code: string, callback: (sender: string, payload: SignalPayload) => void) {
          w.__parlourCallbacks![pk] = callback;
          void w.__parlourSubscribe(code, pk);
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
    }, publicKey);
  }
}

/*
 * HOOK REQUEST — needed in roomSession.ts (not my lane).
 *
 * In `apps/web/src/app/_multiplayer/roomSession.ts`, three places each need
 * one line to read the e2e global as a fallback:
 *
 * 1. In `join()`, line ~313, replace:
 *
 *      const signaling = this.dependencies.signaling ?? new NostrSignaling();
 *
 *    with:
 *
 *      const signaling =
 *        this.dependencies.signaling ??
 *        e2eSignaling() ??
 *        new NostrSignaling();
 *
 * 2. In `prepare()`, line ~1445 `signaling:` option, replace:
 *
 *      signaling: signaling ?? this.dependencies.signaling,
 *
 *    with:
 *
 *      signaling: signaling ?? this.dependencies.signaling ?? e2eSignaling(),
 *
 * And add this module-level helper before the class:
 *
 *    function e2eSignaling(): RoomSignaling | null {
 *      if (typeof window === 'undefined') return null;
 *      const candidate = (
 *        window as unknown as { __PARLOUR_E2E_SIGNALING__?: unknown }
 *      ).__PARLOUR_E2E_SIGNALING__;
 *      return candidate && typeof candidate === 'object' && 'publicKey' in candidate
 *        ? (candidate as RoomSignaling)
 *        : null;
 *    }
 *
 * Three lines, one helper. Production never sets the global, so this is dead
 * code except under Playwright.
 */
