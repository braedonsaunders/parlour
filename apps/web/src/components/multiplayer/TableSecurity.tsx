'use client';

import type { MultiplayerSecurity } from '@/app/_multiplayer/roomSession';
import { LOCALE_META, useT, type MessageKey, type Translator } from '@/lib/i18n';

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
  const t = useT();
  const recovered = new Intl.ListFormat(LOCALE_META[t.locale].tag, {
    style: 'long',
    type: 'conjunction',
  }).format(security.recoveredSeats.map((seat) => t('security.seat', { seat: seat + 1 })));

  return (
    <div className="panel-soft flex flex-col gap-1 p-3 text-left" data-testid="table-security">
      <p className="text-sm font-bold text-dusk-50">{t(securityLabelKey(security.audit))}</p>
      {security.recoveredSeats.length > 0 ? (
        <p className="text-xs text-hearth-200" data-testid="table-security-recovered">
          {t.count('security.recovered', security.recoveredSeats.length, { seats: recovered })}
        </p>
      ) : null}
      {security.paused ? (
        <p
          className="text-xs font-bold text-hearth-200"
          role="status"
          data-testid="table-security-paused"
        >
          {localizedPause(security.paused, t)}
        </p>
      ) : null}
    </div>
  );
}

function securityLabelKey(audit: MultiplayerSecurity['audit']): MessageKey {
  switch (audit) {
    case 'open':
      return 'security.fairDeal';
    case 'veiled':
      return 'security.veiled';
    case 'verified':
      return 'security.verified';
    case 'disputed':
      return 'security.disputed';
  }
}

function localizedPause(paused: string, t: Translator): string {
  const dropped = /^Seat (\d+) dropped\. Waiting for them to come back…$/.exec(paused);
  if (dropped) return t('security.seatDropped', { seat: dropped[1]! });
  if (paused === 'Waiting for more players before the round can continue.') {
    return t('security.waitingPlayers');
  }
  return paused;
}
