import { runBotGame } from '@parlour/engine';
import { tierBot } from '../bots';
import { pokerGame } from '../game';
import type { PokerRules } from '../config';

/**
 * Head-to-head win rate between two tiers, seats alternated so the button
 * cannot explain the result. Used by the balance test and runnable by hand
 * when a profile changes.
 */
export function headToHead(
  challenger: 1 | 2 | 3,
  defender: 1 | 2 | 3,
  matches: number,
  config: Partial<PokerRules> = {},
  seedBase = 9_000,
): { wins: number; matches: number; rate: number } {
  let wins = 0;
  for (let index = 0; index < matches; index++) {
    const challengerSeat = index % 2;
    const record = runBotGame(pokerGame, {
      seed: seedBase + index,
      policies: [
        challengerSeat === 0 ? tierBot(challenger) : tierBot(defender),
        challengerSeat === 0 ? tierBot(defender) : tierBot(challenger),
      ],
      config,
      maxEvents: 80_000,
    });
    if (record.result?.winner === challengerSeat) wins += 1;
  }
  return { wins, matches, rate: wins / matches };
}

/**
 * One seat of `challenger` against a table of `defender`, rotated through every
 * seat so position cannot explain the result. Reported against the share a seat
 * would win by chance, which is the number that matters for solo play.
 */
export function againstATable(
  challenger: 1 | 2 | 3,
  defender: 1 | 2 | 3,
  seats: number,
  matches: number,
  config: Partial<PokerRules> = {},
  seedBase = 40_000,
): { wins: number; matches: number; rate: number; fairShare: number } {
  let wins = 0;
  for (let index = 0; index < matches; index++) {
    const seat = index % seats;
    const record = runBotGame(pokerGame, {
      seed: seedBase + index,
      policies: Array.from({ length: seats }, (_, at) =>
        at === seat ? tierBot(challenger) : tierBot(defender),
      ),
      config,
      maxEvents: 80_000,
    });
    if (record.result?.winner === seat) wins += 1;
  }
  return { wins, matches, rate: wins / matches, fairShare: 1 / seats };
}
