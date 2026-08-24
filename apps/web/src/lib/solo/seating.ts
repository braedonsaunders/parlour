import type { GameSession, RuleValues } from '@parlour/engine';

/**
 * Who is sitting at a solo table, and which side won.
 *
 * `SoloAuthority` already absorbed the hard half of a solo transport — the
 * dispatch path, the bot loop, the fx plumbing. What each transport still
 * repeated was the easy half, and it was repeated exactly: eight of them built
 * the same seat roster from the same "seat 0 is you, the house fills the rest"
 * shape, and the two partnership games computed the winning team identically
 * (twice more in their table pages, for four copies of five lines).
 *
 * Small, but the kind of small that becomes a bug: two of the roster copies had
 * already drifted on how a blank display name is handled.
 */

export interface SoloSeat {
  seat: number;
  name: string;
  avatarId: string;
  isBot: boolean;
}

export interface HousePlayer {
  name: string;
  avatarId: string;
}

/**
 * The human's seat.
 *
 * This, and only this, was identical in all eight transports. The bot half
 * genuinely differs — personas, tiers, variable seat counts, an extra
 * `personaId` in two of them — so it is left where it belongs rather than
 * forced through a shared abstraction that would need a callback per game.
 *
 * A blank or whitespace-only display name falls back to "You" rather than
 * rendering an empty plaque: the profile store permits an empty name, and the
 * table has to survive it.
 */
export function localSeat(player: { name: string; avatarId: string }): SoloSeat {
  return {
    seat: 0,
    name: player.name.trim() || 'You',
    avatarId: player.avatarId,
    isBot: false,
  };
}

/** Seat 0 plus a fixed house cast in table order — the simple two-game case. */
export function houseSeats(
  player: { name: string; avatarId: string },
  cast: readonly HousePlayer[],
): SoloSeat[] {
  return [
    localSeat(player),
    ...cast.map((house, index) => ({
      seat: index + 1,
      name: house.name,
      avatarId: house.avatarId,
      isBot: true,
    })),
  ];
}

/**
 * The winning partnership, for the games that seat one.
 *
 * Partnerships alternate around the table, so seat parity is the team. Both
 * Euchre and Spades rank *every* seat of the winning side 1, so reading the
 * first rank-1 seat is enough — and that is also why neither game needs a
 * bespoke "did I win" predicate at the table.
 */
export function winningTeamOf(
  session: Pick<GameSession<unknown, RuleValues>, 'result'>,
): 0 | 1 | null {
  const rankOne = session.result?.rankings.find((rank) => rank.rank === 1);
  return rankOne ? ((rankOne.seat % 2) as 0 | 1) : null;
}
