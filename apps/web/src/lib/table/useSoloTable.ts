'use client';

import { useCallback, useEffect, useState } from 'react';
import type { FxEvent, TablePacingMode } from '@parlour/engine';
import { botTurnDelayMs } from './fx-motion';
import { holdFxForCountdown } from './opening-countdown';
import { isStaleMoveFault } from './useRoomTable';

/**
 * The solo-table runtime, written once.
 *
 * Every `app/<game>/table/page.tsx` used to carry its own copy of the same
 * five things: snapshot/fx/fxKey/error state, an `accept` that either surfaces
 * a rejection or advances the table, a `dispatch` that funnels moves through
 * it, and a bot-turn timer that waits for the fx timeline to settle before the
 * bot acts. Comparing the pages line by line, 60–83% of each was identical to
 * the others — roughly 2,300 lines of glue holding no game logic at all, and a
 * ninth game meant a ninth copy.
 *
 * Only two things genuinely differ: which transport class is constructed and,
 * rarely, whether the table is casual, brisk, timed or automatic. The engine
 * turns that semantic intent into one cadence shared by every game.
 *
 * The engine's promise is that a rules module inherits the whole table. This
 * is the app honouring that promise instead of contradicting it.
 */

/**
 * The slice of a round this runtime needs. Games keep it in different places —
 * most use `snapshot.session`, Hearts uses `snapshot.hand`, Cribbage uses
 * `snapshot.match.round` — so the caller supplies a selector rather than the
 * hook assuming one shape.
 */
export interface SoloRound {
  seed?: number;
  log?: readonly unknown[];
  status: 'playing' | 'ended';
  phase: { actor: number | null };
  setupFx?: readonly FxEvent[];
}

/**
 * What a transport returns from `dispatch`/`playBotTurn`. `rejected` allows
 * both `null` and `undefined`: the solo transports report "no rejection" as
 * null, the engine's own ApplyOutcome leaves it undefined.
 */
export interface SoloTableDispatch<TSnapshot> {
  rejected?: { message: string } | null;
  snapshot: TSnapshot;
  fx: readonly FxEvent[];
}

export interface SoloTableTransport<TSnapshot, TDispatch> {
  getSnapshot(): TSnapshot;
  dispatch(move: string, payload?: unknown): TDispatch;
  playBotTurn(): TDispatch;
}

export interface SoloTableOptions<TSnapshot, TDispatch> {
  /** Where this game keeps the live round on its snapshot. */
  round(snapshot: TSnapshot): SoloRound;
  /** Semantic urgency only; the engine owns every actual duration. */
  pacing?: TablePacingMode | ((snapshot: TSnapshot) => TablePacingMode);
  /** Seat the human occupies; the bot loop never plays it. Defaults to 0. */
  localSeat?: number;
  /** Copy shown when a bot policy throws. */
  botErrorMessage?: string;
  /**
   * Which fx an accepted outcome should play. Defaults to `outcome.fx`;
   * Hearts overrides it to fall back to the deal timeline when a move emitted
   * nothing, so the opening cascade is not swallowed.
   */
  fxFor?(outcome: TDispatch): readonly FxEvent[];
  /**
   * Called after an outcome is accepted, before the next render.
   *
   * Blitz needs the raw outcome to accumulate a whole round's fx for its
   * round-end overlay, which is a different timeline from the per-move `fx`
   * this hook manages. Rather than leave Blitz on a hand-rolled copy of the
   * entire runtime — the only page that still had one — it gets this seam.
   */
  onAccepted?(outcome: TDispatch): void;
}

export interface SoloTable<TSnapshot, TDispatch> {
  snapshot: TSnapshot;
  fx: readonly FxEvent[];
  /** Bumped on every accepted outcome so the fx layer replays from the top. */
  fxKey: number;
  error: string | null;
  dispatch(move: string, payload?: unknown): void;
  /** Escape hatch for games that drive the transport in their own way. */
  accept(outcome: TDispatch): void;
  setError(message: string | null): void;
  /**
   * Replaces the snapshot without going through an outcome.
   *
   * For transport state that advances without a move: Blitz's timed tables poll
   * `transport.tick(now)` for the match clock, which returns a snapshot rather
   * than a dispatch result. Do not reach for this to apply moves — `dispatch`
   * exists so a rejection still surfaces.
   */
  setSnapshot(snapshot: TSnapshot): void;
}

export function useSoloTable<TSnapshot, TDispatch extends SoloTableDispatch<TSnapshot>>(
  transport: SoloTableTransport<TSnapshot, TDispatch>,
  options: SoloTableOptions<TSnapshot, TDispatch>,
): SoloTable<TSnapshot, TDispatch> {
  const {
    round,
    pacing = 'casual',
    localSeat = 0,
    botErrorMessage = 'The bot lost the thread.',
    fxFor,
    onAccepted,
  } = options;

  const [snapshot, setSnapshot] = useState(() => transport.getSnapshot());
  // The opening deal waits for the table's 3·2·1; every later burst is live.
  const [fx, setFx] = useState<readonly FxEvent[]>(() =>
    holdFxForCountdown(round(snapshot).setupFx ?? []),
  );
  const [fxKey, setFxKey] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const accept = useCallback(
    (outcome: TDispatch) => {
      if (outcome.rejected) {
        // A control drawn from the previous frame can be tapped after the
        // position has moved past it — the engine refuses, correctly, and the
        // next render already shows the truth. Solo tables get the same
        // treatment as room tables: a stale tap does nothing, rather than
        // replacing the game with an error screen.
        if (!isStaleMoveFault(outcome.rejected.message)) {
          console.error('[table] move rejected', outcome.rejected.message);
          setError(outcome.rejected.message);
        }
        return;
      }
      setError(null);
      setSnapshot(outcome.snapshot);
      setFx(fxFor ? fxFor(outcome) : outcome.fx);
      setFxKey((key) => key + 1);
      onAccepted?.(outcome);
    },
    [fxFor, onAccepted],
  );

  const dispatch = useCallback(
    (move: string, payload?: unknown) => accept(transport.dispatch(move, payload)),
    [accept, transport],
  );

  // `snapshot` is a fresh object on every accepted outcome, so one dependency
  // covers the replay position and the rare snapshot-derived pacing mode.
  useEffect(() => {
    const live = round(snapshot);
    if (live.status !== 'playing') return;
    const actor = live.phase.actor;
    if (actor === null || actor === localSeat) return;
    const mode = typeof pacing === 'function' ? pacing(snapshot) : pacing;
    const delay = botTurnDelayMs(
      { mode, seed: live.seed ?? 0, turn: live.log?.length ?? 0, seat: actor },
      fx,
    );
    const timer = window.setTimeout(() => {
      try {
        accept(transport.playBotTurn());
      } catch (caught) {
        console.error('[table] bot turn failed', caught);
        setError(caught instanceof Error ? caught.message : botErrorMessage);
      }
    }, delay);
    return () => window.clearTimeout(timer);
  }, [accept, botErrorMessage, fx, localSeat, pacing, round, snapshot, transport]);

  return { snapshot, fx, fxKey, error, dispatch, accept, setError, setSnapshot };
}
