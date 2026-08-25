'use client';

import type { MultiplayerSecurity } from '@/app/_multiplayer/roomSession';

/**
 * What the room guarantees, stated plainly — and never asked as a question.
 *
 * There used to be a tier picker here, which asked a player who wanted to play
 * cards to weigh a cryptographic trade-off before dealing. Every room now mixes
 * its shuffle across all the seats, so the guarantee that matters between
 * friends — nobody chose this deck, including the host — is simply always on.
 * See lib/multiplayer/dealSeed.ts.
 *
 * Every word below is still deliberate. The badge says what is covered and what
 * is not: a fair deal is not a hidden hand, and an open room is readable by a
 * modified client. Parlour Veil remains the real guarantee about *hands* and is
 * never described as "cheat-proof" — see apps/web/src/lib/multiplayer/veil.
 */

/**
 * In-room badge: the name of the guarantee, and anything that has changed it.
 *
 * It used to also carry a shuffle counter, a paragraph on what the end-of-match
 * audit had and had not proved, and a standing note about what a two-seat room
 * cannot recover. All of that is true, and none of it is something a player can
 * act on while holding cards — it is documentation wearing a badge. What is
 * left is the label and the two things that genuinely change the game in front
 * of you: a hand that stopped being private, and a round that has stopped.
 *
 * The machinery is untouched; this is only what the table says about it.
 */
export function SecurityBadge({ security }: { security: MultiplayerSecurity }) {
  return (
    <div className="panel-soft flex flex-col gap-1 p-3 text-left" data-testid="table-security">
      <p className="text-sm font-bold text-dusk-50">{security.label}</p>
      {security.recoveredSeats.length > 0 ? (
        <p className="text-xs text-hearth-200" data-testid="table-security-recovered">
          {seatList(security.recoveredSeats)} disconnected and{' '}
          {security.recoveredSeats.length === 1 ? 'their hand was' : 'their hands were'} reopened so
          the round could continue. {security.recoveredSeats.length === 1 ? 'It is' : 'They are'} no
          longer private.
        </p>
      ) : null}
      {security.paused ? (
        <p
          className="text-xs font-bold text-hearth-200"
          role="status"
          data-testid="table-security-paused"
        >
          {security.paused}
        </p>
      ) : null}
    </div>
  );
}

function seatList(seats: readonly number[]): string {
  const names = seats.map((seat) => `Seat ${seat + 1}`);
  if (names.length === 1) return names[0] as string;
  return `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}
