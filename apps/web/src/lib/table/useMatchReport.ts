'use client';

import { useEffect, useRef } from 'react';
import type { MatchResult } from '@parlour/engine';
import type { GameId } from '@/lib/games/shelf';
import { buildMatchRecord, useHistoryStore, type RecordedSeat } from '@/stores/history';
import { useMatchFlowStore, type MatchSnapshot } from '@/stores/matchFlow';
import { useProfileStore } from '@/stores/profile';
import { usePodiumHandoff } from './usePodiumHandoff';

/**
 * What happens when a table finishes, written once.
 *
 * Every `app/<game>/table/page.tsx` carried this effect twice — once for the
 * solo table and once for the friend room — and the two copies were the same
 * forty lines with the game id swapped: guard on a one-shot ref, fold the
 * result into the profile record, build a history record, hand the podium its
 * snapshot, register Play Again, then navigate after a beat.
 *
 * Eight games × two copies is sixteen places for the same bug. It was already
 * showing: the podium hand-off had to be lifted into its own hook because the
 * copies disagreed about timer ownership, and the "won" test drifted between
 * `winner === localSeat`, a rank-1 lookup, and a team check with no shared
 * definition of which was right for which shape of result.
 *
 * The parts that genuinely differ per game — how the id is minted, who is at
 * the table, what counts as a win, where Play Again goes — are the fields of
 * {@link MatchReport}. Everything else lives here.
 */

/** Extra counters a game folds into the lifetime profile record. */
export interface MatchStats {
  blitzes: number;
  knocks: number;
  knockWins: number;
}

const NO_STATS: MatchStats = { blitzes: 0, knocks: 0, knockWins: 0 };

export interface MatchReport {
  /**
   * Stable id for this match, shared by the history record and the podium so
   * the end screen can find the ledger entry it just wrote. Solo tables mint a
   * UUID; rooms derive one from the room code and the authority's own log, so
   * two peers reporting the same match agree on it.
   */
  id: string;
  game: GameId;
  mode: MatchSnapshot['mode'];
  result: MatchResult;
  localSeat: number;
  seats: readonly RecordedSeat[];
  /** True when the local seat took (or shared) first place. */
  won: boolean;
  stats?: MatchStats;
  /**
   * How long the table celebrates before the hand-off. Tables whose closing
   * flourish runs longer than the default say so — President's rank parade and
   * Cribbage's final peg both finish after the standard beat.
   */
  podiumDelayMs?: number;
  /** Where Play Again should send this player. */
  onPlayAgain(): void | Promise<void>;
  /** Runs after the celebration beat — usually a push to the podium. */
  onFinish(): void;
}

/** How long the table celebrates before handing over to the podium. */
export const PODIUM_DELAY_MS = 900;

/**
 * Reports a finished match exactly once.
 *
 * Pass `null` while the match is still running. The first non-null report wins
 * and every later one is ignored, so callers can keep building the report from
 * a snapshot that changes on every frame without arming the hand-off twice.
 *
 * `key` identifies which match is being reported. A solo page that starts a new
 * table in place (Play Again on the same route) passes the new transport, and
 * the one-shot guard resets so the second match reports too.
 */
export function useMatchReport(report: MatchReport | null, key: unknown = 'table'): void {
  const setLastMatch = useMatchFlowStore((state) => state.setLastMatch);
  const registerPlayAgain = useMatchFlowStore((state) => state.registerPlayAgain);
  const recordResult = useProfileStore((state) => state.recordResult);
  const recordMatch = useHistoryStore((state) => state.recordMatch);
  const handOffToPodium = usePodiumHandoff();
  const reported = useRef<unknown>(null);

  // The effect deliberately depends on `report`, which is a fresh object every
  // render. Re-running is free — the ref makes every run after the first a
  // no-op — and it is strictly safer than enumerating the game-specific fields
  // each page used to list by hand.
  useEffect(() => {
    if (!report || reported.current === key) return;
    reported.current = key;

    const stats = report.stats ?? NO_STATS;
    recordResult({ won: report.won, ...stats });

    const seats = [...report.seats];
    const record = buildMatchRecord({
      id: report.id,
      at: Date.now(),
      game: report.game,
      mode: report.mode,
      result: report.result,
      localSeat: report.localSeat,
      seats,
    });
    if (record) recordMatch(record);

    setLastMatch({
      id: report.id,
      result: report.result,
      seats,
      game: report.game,
      mode: report.mode,
      localSeat: report.localSeat,
    });

    registerPlayAgain(report.onPlayAgain);
    handOffToPodium(report.podiumDelayMs ?? PODIUM_DELAY_MS, report.onFinish);
  }, [handOffToPodium, key, recordMatch, recordResult, registerPlayAgain, report, setLastMatch]);
}

/**
 * Whether the local seat won, from a result's rankings.
 *
 * The pages variously asked `winner === localSeat`, looked up rank 1, or
 * compared a team index. Rank 1 is the one that is right in every case: it
 * handles shared firsts, and a game whose `winner` is null but whose rankings
 * are ordered (Hearts' low score, Spades' team result) still reports honestly.
 */
export function wonByRank(result: MatchResult, localSeat: number): boolean {
  return result.rankings.find((rank) => rank.seat === localSeat)?.rank === 1;
}

/**
 * The id two peers in the same room will both derive for the same match.
 *
 * Built from the authority's own log rather than a clock or a random draw, so
 * the history ledgers on both sides key the match identically.
 */
export function roomMatchId(
  code: string | null | undefined,
  seed: number,
  fingerprint: string | number | null | undefined,
): string {
  return `multiplayer:${code ?? 'room'}:${seed}:${fingerprint ?? 0}`;
}
