/**
 * Undo, as a consequence of the log rather than a feature bolted beside it.
 *
 * `state = replay(seed, log)` means every position a session has ever held is
 * still addressable: drop events off the end and replay what remains. There is
 * no undo stack to keep in step with the reducer, no inverse move to write per
 * game, and nothing a game pack has to opt into — a pack that never thought
 * about undo gets an exact one.
 *
 * ## What counts as one undo
 *
 * A player's move and the automatic events `settle` produced from it are one
 * indivisible thing. Truncating between them would leave a session whose flow
 * never finished advancing: the autos would be gone, but the phase they were
 * meant to reach would be too, and the next move would be validated against a
 * position no game ever occupied. So an undo point is always *before* a player
 * action, and taking one drops that action together with everything it caused.
 *
 * ## What this does not do
 *
 * It does not decide *whether* a game should offer undo. Solitaire wants
 * unlimited undo; a friend room mid-trick emphatically does not, and a veiled
 * round cannot have one at all — rewinding past a reveal would ask a peer to
 * un-know a card it has already seen. Callers own that policy; `undoPolicy`
 * below only reports what the log makes possible.
 */

import { replaySession } from './runtime';
import type { AppliedEvent, GameSession, GameDef, RuleValues } from './types';

/** True for an event a player chose, as opposed to one the runtime produced. */
function isPlayerAction(event: AppliedEvent): boolean {
  return event.automatic !== true && event.injected !== true && event.seat !== null;
}

/**
 * Indices in `log` that a session may be rewound to, oldest first.
 *
 * Each entry is a log length: rewinding to `n` keeps the first `n` events. The
 * opening position (0) is included only when the log holds a player action,
 * because rewinding an untouched session is not an undo.
 */
export function undoPoints(log: readonly AppliedEvent[]): readonly number[] {
  const points: number[] = [];
  for (const [index, event] of log.entries()) {
    if (isPlayerAction(event)) points.push(index);
  }
  return points;
}

/** How many times a session can be undone from where it stands. */
export function undoDepth(log: readonly AppliedEvent[]): number {
  return undoPoints(log).length;
}

export interface UndoOptions {
  /**
   * Rewind this many player actions instead of one. A count past the beginning
   * of the log is an error rather than a silent rewind to the deal, because a
   * caller asking for ten undos with three available has lost track of the
   * position, and quietly giving it the opening board hides that.
   */
  steps?: number;
}

/**
 * Returns the session as it stood before its last `steps` player actions.
 *
 * Replays from the seed, so the result is not an approximation of the earlier
 * position — it is that position, byte for byte, including the rng streams any
 * subsequent move will draw from.
 *
 * Throws when there is nothing to undo, when `steps` reaches past the opening
 * deal, or when the round was dealt under Veil. The last one is not a
 * limitation waiting to be lifted: a veiled log records the reveals that opened
 * cards, and replaying it hands those cards back to whoever already saw them.
 */
export function undoSession<S, C extends RuleValues>(
  def: GameDef<S, C>,
  session: GameSession<S, C>,
  options: UndoOptions = {},
): GameSession<S, C> {
  const steps = options.steps ?? 1;
  if (!Number.isInteger(steps) || steps < 1) {
    throw new Error(`${def.id}: undo steps must be a positive integer, got ${steps}`);
  }
  if (session.veiled) {
    throw new Error(`${def.id}: a veiled round cannot be undone — a reveal cannot be un-seen`);
  }
  const points = undoPoints(session.log);
  if (points.length === 0) throw new Error(`${def.id}: nothing to undo`);
  if (steps > points.length) {
    throw new Error(`${def.id}: asked to undo ${steps} moves with ${points.length} available`);
  }
  const target = points[points.length - steps]!;
  return replaySession(def, session.seed, session.log.slice(0, target), {
    config: session.config,
    seats: session.seats,
  });
}

/**
 * What undo is available here, without throwing to find out.
 *
 * The shape a table's undo control wants: whether to render at all, and how
 * many presses are left in it.
 */
export function undoPolicy<S, C extends RuleValues>(
  session: GameSession<S, C>,
): { available: boolean; depth: number; refusal: string | null } {
  if (session.veiled) {
    return { available: false, depth: 0, refusal: 'a veiled round cannot be undone' };
  }
  const depth = undoDepth(session.log);
  return {
    available: depth > 0,
    depth,
    refusal: depth > 0 ? null : 'nothing has been played yet',
  };
}
