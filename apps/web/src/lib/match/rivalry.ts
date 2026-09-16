import type { GameId } from '@/lib/games';
import { headToHead, type MatchRecord, type OpponentKind } from '@/stores/history';

/**
 * Rivalry view model: the "you lead 3–2 today, 12–7 all time" line the match
 * end screen shows once the same faces have played more than once.
 *
 * Game-agnostic on purpose — it reads only the shared history ledger, so every
 * game on the shelf (and every game added later) gets the same standings for
 * free. Pure, no React.
 *
 * The headline used to be "this sitting": the run of back-to-back matches with
 * this exact table and this exact game, broken by any gap over two hours. Two
 * things were wrong with it, and players hit both in one evening.
 *
 * It was invisible. Nothing on screen says where a sitting starts, so a run
 * that quietly broke — someone dealt a different game in between, or the two
 * hours lapsed — read as the score being wrong rather than as a new run.
 *
 * Worse, the screen changed WHICH number it led with depending on how long the
 * run was: one match in, the headline was the all-time record; from the second
 * match on it silently became the sitting. So the line went "17–9" after one
 * game and "0–2" after the next, which looks exactly like a scoreboard that
 * lost its memory. It had not; it was answering a different question.
 *
 * Today is the unit people actually keep score in, and it is the one unit that
 * needs no explaining: it starts at midnight and it counts every game you
 * played against that person, whichever ones you played. All time stays, as a
 * footnote, and the headline is always the same question.
 */

export interface Tally {
  games: number;
  wins: number;
  losses: number;
  ties: number;
}

export interface RivalStanding {
  key: string;
  name: string;
  avatarId: string;
  kind: OpponentKind;
  /** today, local time: every match against them since midnight, any game */
  today: Tally;
  /** every recorded match against them, across every game */
  allTime: Tally;
}

export interface Rivalry {
  game: GameId;
  /** matches played against this same table today, including the one just finished */
  todayGames: number;
  /** a straight two-hander, so the UI can lead with a single scoreline */
  duel: boolean;
  standings: readonly RivalStanding[];
}

const EMPTY: Tally = { games: 0, wins: 0, losses: 0, ties: 0 };

/** Midnight before `at`, in the player's own timezone. */
export function startOfLocalDay(at: number): number {
  const date = new Date(at);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

/**
 * The same people, whatever they played.
 *
 * Deliberately not keyed on the game: "we played eight tonight" counts the
 * Wild and the Blitz together, because the two people at the table do.
 */
function tableKey(record: MatchRecord): string {
  return record.opponents
    .map((opponent) => opponent.key)
    .sort()
    .join(',');
}

function tallyIndex(records: readonly MatchRecord[]): Map<string, Tally> {
  return new Map(
    headToHead(records).map((row) => [
      row.key,
      { games: row.games, wins: row.wins, losses: row.losses, ties: row.ties },
    ]),
  );
}

/**
 * @param records the ledger, any order
 * @param matchId the match just played; falls back to the most recent record
 */
export function deriveRivalry(records: readonly MatchRecord[], matchId?: string): Rivalry | null {
  if (records.length === 0) return null;
  // stable sort keeps the store's newest-first order for same-instant records
  const ordered = [...records].sort((a, b) => b.at - a.at);
  const anchorIndex = matchId ? ordered.findIndex((record) => record.id === matchId) : 0;
  if (anchorIndex < 0) return null;
  const anchor = ordered[anchorIndex]!;

  // Compared as day starts rather than against a 24-hour window, so the two
  // days a year that are not 24 hours long still have exactly one midnight.
  const day = startOfLocalDay(anchor.at);
  const todayRecords = ordered.filter((record) => startOfLocalDay(record.at) === day);
  const table = tableKey(anchor);

  const todayTallies = tallyIndex(todayRecords);
  const allTimeTallies = tallyIndex(ordered);

  return {
    game: anchor.game,
    todayGames: todayRecords.filter((record) => tableKey(record) === table).length,
    duel: anchor.opponents.length === 1,
    standings: anchor.opponents.map((opponent) => ({
      key: opponent.key,
      name: opponent.name,
      avatarId: opponent.avatarId,
      kind: opponent.kind,
      today: todayTallies.get(opponent.key) ?? EMPTY,
      allTime: allTimeTallies.get(opponent.key) ?? EMPTY,
    })),
  };
}

/** Nothing to brag about after a one-off first meeting — the UI stays hidden. */
export function hasRivalryToShow(rivalry: Rivalry | null): rivalry is Rivalry {
  if (!rivalry) return false;
  return rivalry.todayGames > 1 || rivalry.standings.some((standing) => standing.allTime.games > 1);
}

/** "3–2" style scoreline, ties appended only when they happened. */
export function scoreline(tally: Tally): string {
  return tally.ties > 0
    ? `${tally.wins}–${tally.losses}–${tally.ties}`
    : `${tally.wins}–${tally.losses}`;
}
