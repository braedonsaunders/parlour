import type { GameId } from '@/lib/games';
import { headToHead, type MatchRecord, type OpponentKind } from '@/stores/history';

/**
 * Rivalry view model: the "you lead 3–2 tonight, 12–7 all time" line the match
 * end screen shows once the same faces have played more than once.
 *
 * Game-agnostic on purpose — it reads only the shared history ledger, so every
 * game on the shelf (and every game added later) gets the same standings for
 * free. Pure, no React.
 */

/** Matches this close together are one sitting; a longer gap starts a new one. */
export const SITTING_GAP_MS = 2 * 60 * 60 * 1000;

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
  /** this sitting: the run of back-to-back matches with this exact table */
  sitting: Tally;
  /** every recorded match against them, across every game */
  allTime: Tally;
}

export interface Rivalry {
  game: GameId;
  /** matches in the current sitting, including the one that just finished */
  sittingGames: number;
  /** a straight two-hander, so the UI can lead with a single scoreline */
  duel: boolean;
  standings: readonly RivalStanding[];
}

const EMPTY: Tally = { games: 0, wins: 0, losses: 0, ties: 0 };

/**
 * A sitting is "the same people, the same game" — opponents identified by their
 * stable history keys so a friend who renames themselves still counts.
 */
function rosterKey(record: MatchRecord): string {
  const keys = record.opponents.map((opponent) => opponent.key).sort();
  return `${record.game}|${keys.join(',')}`;
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

  const roster = rosterKey(anchor);
  const sitting: MatchRecord[] = [anchor];
  for (let i = anchorIndex + 1; i < ordered.length; i += 1) {
    const record = ordered[i]!;
    if (rosterKey(record) !== roster) break;
    if (sitting[sitting.length - 1]!.at - record.at > SITTING_GAP_MS) break;
    sitting.push(record);
  }

  const sittingTallies = tallyIndex(sitting);
  const allTimeTallies = tallyIndex(ordered);

  return {
    game: anchor.game,
    sittingGames: sitting.length,
    duel: anchor.opponents.length === 1,
    standings: anchor.opponents.map((opponent) => ({
      key: opponent.key,
      name: opponent.name,
      avatarId: opponent.avatarId,
      kind: opponent.kind,
      sitting: sittingTallies.get(opponent.key) ?? EMPTY,
      allTime: allTimeTallies.get(opponent.key) ?? EMPTY,
    })),
  };
}

/** Nothing to brag about after a one-off first meeting — the UI stays hidden. */
export function hasRivalryToShow(rivalry: Rivalry | null): rivalry is Rivalry {
  if (!rivalry) return false;
  return (
    rivalry.sittingGames > 1 || rivalry.standings.some((standing) => standing.allTime.games > 1)
  );
}

/** "3–2" style scoreline, ties appended only when they happened. */
export function scoreline(tally: Tally): string {
  return tally.ties > 0
    ? `${tally.wins}–${tally.losses}–${tally.ties}`
    : `${tally.wins}–${tally.losses}`;
}
