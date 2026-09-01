'use client';

/**
 * Bot takeover for seats that dropped out.
 *
 * A room marks a departed seat as a bot, but until now nothing played for it,
 * so a disconnect stalled the table at that seat's turn — in open rooms as much
 * as veiled ones. This is the driver that closes that gap.
 *
 * Only the host runs it. Every peer can see it is a bot seat's turn, so if they
 * all drove it they would all submit a move and the authority would take
 * whichever arrived first while the rest bounced as duplicates. Host-only keeps
 * one decision per turn; when the host itself leaves, the new host picks up
 * driving with the same rules.
 *
 * Under Veil the bot is simply a player whose hand the host happens to be able
 * to read, because the room rebuilt that seat's layer when it disconnected. The
 * host resolves the seat's cards locally to choose a move and publishes only
 * the opening for the card it actually plays — exactly what a human client
 * does. Nothing extra about the bot's hand reaches the log or the other peers.
 */

import {
  actingSeats,
  hasVeiledCard,
  isActingSeat,
  makeRng,
  type GameDef,
  type GameSession,
  type LegalMove,
  type RuleValues,
  type SeatId,
} from '@parlour/engine';

export interface BotTurn {
  seat: SeatId;
  move: LegalMove;
}

export interface BotDecisionInput<S, C extends RuleValues> {
  def: GameDef<S, C>;
  session: GameSession<S, C>;
  /** the state to reason over — under Veil, resolved with what the host can read */
  view: S;
  /** seats currently played by a bot */
  botSeats: readonly SeatId[];
}

/**
 * The moves a bot should make right now — one per acting bot seat.
 *
 * Simultaneous phases (slap races, jump-in windows) can hand more than one seat
 * the right to act at once, so this returns a list rather than a single turn.
 * A seat with no legal move is simply absent: the flow, not the bot, decides
 * whether that stalls anything.
 */
export function botTurns<S, C extends RuleValues>({
  def,
  session,
  view,
  botSeats,
}: BotDecisionInput<S, C>): BotTurn[] {
  if (session.status !== 'playing' || botSeats.length === 0) return [];
  const policy = def.bots[0];
  if (!policy) return [];

  const turns: BotTurn[] = [];
  for (const seat of actingSeats(session.phase)) {
    if (!botSeats.includes(seat)) continue;
    if (!isActingSeat(session.phase, seat)) continue;
    // A hand still full of handles is one this client cannot read — the layer
    // has not been rebuilt yet, or a card failed to open. Asking a bot to play
    // it would hand a game's policy a card id it has never heard of.
    if (!canReadSeat(view, seat)) continue;

    const legal = def.flow.legalMovesFor
      ? def.flow.legalMovesFor(view, session.phase, seat)
      : def.flow.legalMoves(view, session.phase);
    if (legal.length === 0) continue;

    // Derived from the seed and the log length, never a clock: two hosts at the
    // same position pick the same move, so a host handover mid-turn cannot make
    // the bot change its mind.
    const rng = makeRng(session.seed).fork(`bot:${seat}:${session.log.length}`);
    // A bot policy is game code reasoning over card faces. If it throws — an
    // unreadable card, a rule it did not expect — that must cost the table one
    // bot turn, not the host's whole session.
    let chosen: LegalMove | null = null;
    try {
      chosen = policy.chooseMove(view, seat, legal, rng, { thinkMs: () => 120 });
    } catch {
      chosen = null;
    }
    if (chosen) turns.push({ seat, move: chosen });
  }
  return turns;
}

/**
 * True when this client can actually read the seat's cards.
 *
 * Games keep a seat's private cards in `hands[seat]` or `piles[seat]`; anything
 * still veiled there means the face is unavailable to whoever is driving. A
 * game with no such zone (everything public) always reads.
 */
function canReadSeat(view: unknown, seat: SeatId): boolean {
  if (view === null || typeof view !== 'object') return true;
  const zones = view as { hands?: unknown; piles?: unknown };
  for (const zone of [zones.hands, zones.piles]) {
    if (!Array.isArray(zone)) continue;
    const own = zone[seat];
    if (Array.isArray(own) && hasVeiledCard(own as string[])) return false;
  }
  return true;
}

/** Stable identity for a scheduled turn, so the same one is never queued twice. */
export function botTurnKey(session: GameSession<unknown, RuleValues>, seat: SeatId): string {
  return `${session.log.length}:${seat}`;
}
