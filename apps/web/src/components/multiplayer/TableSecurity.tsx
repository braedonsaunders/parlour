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

/** In-room badge: the guarantee, the audit state, and what recovery costs. */
export function SecurityBadge({ security }: { security: MultiplayerSecurity }) {
  const ceremonyRunning = security.tier === 'veil' && !security.ceremony.ready;
  return (
    <div className="panel-soft flex flex-col gap-1 p-3 text-left" data-testid="table-security">
      <p className="text-sm font-bold text-dusk-50">
        {security.label}
        {ceremonyRunning ? (
          <span className="ml-2 text-xs font-normal text-hearth-200">
            shuffling… {security.ceremony.laid}/{security.ceremony.seats}
          </span>
        ) : null}
      </p>
      <p className="text-xs text-dusk-100/80">{security.detail}</p>
      {security.tier === 'veil' ? (
        <p className="text-xs text-dusk-100/60">{security.recovery.disclosure}</p>
      ) : null}
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
