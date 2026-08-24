'use client';

import type { RoomSecurity } from '@/lib/multiplayer';
import type { MultiplayerSecurity } from '@/app/_multiplayer/roomSession';

/**
 * The room's privacy tier, stated plainly.
 *
 * Every word here is deliberate. The open tier is the honest default and it is
 * described as what it is — fast, and readable by a modified client. Veil is
 * offered as a real guarantee about *hands*, never as "cheat-proof", and the
 * cost is printed next to the benefit rather than buried. See
 * docs/VEILED-DECK-PROTOCOL.md.
 */

const TIERS: readonly {
  value: RoomSecurity;
  title: string;
  pitch: string;
  cost: string;
}[] = [
  {
    value: 'open',
    title: 'Open table',
    pitch: 'Deals instantly. Best for playing with people you trust.',
    cost: 'Every device replays the whole game, so a modified client could read any hand.',
  },
  {
    value: 'veil',
    title: 'Parlour Veil',
    pitch: 'Hands stay hidden from every device at the table, including the host’s.',
    cost: 'A shuffle ceremony before the deal, a beat of delay per hidden card, and a disconnect can pause the round.',
  },
];

export function SecurityPicker({
  value,
  supported,
  seats,
  onChange,
}: {
  value: RoomSecurity;
  /** false when the game pack has no `veil` block — say so instead of offering it */
  supported: boolean;
  seats: number;
  onChange: (next: RoomSecurity) => void;
}) {
  return (
    <fieldset className="panel-soft flex w-full max-w-md flex-col gap-3 p-4">
      <legend className="px-1 text-sm font-bold text-dusk-50">Table privacy</legend>
      {TIERS.map((tier) => {
        const disabled = tier.value === 'veil' && !supported;
        return (
          <label
            key={tier.value}
            className={`flex cursor-pointer gap-3 rounded-xl p-3 text-left ${
              value === tier.value ? 'bg-hearth-500/15' : ''
            } ${disabled ? 'cursor-not-allowed opacity-50' : ''}`}
          >
            <input
              type="radio"
              name="table-privacy"
              className="mt-1"
              value={tier.value}
              checked={value === tier.value}
              disabled={disabled}
              onChange={() => onChange(tier.value)}
            />
            <span className="flex flex-col gap-1">
              <span className="font-bold text-dusk-50">{tier.title}</span>
              <span className="text-sm text-dusk-100/90">{tier.pitch}</span>
              <span className="text-xs text-dusk-100/70">{tier.cost}</span>
              {disabled ? (
                <span className="text-xs text-hearth-200">
                  This game does not support hidden hands yet.
                </span>
              ) : null}
            </span>
          </label>
        );
      })}
      {value === 'veil' && seats === 2 ? (
        <p className="rounded-xl bg-dusk-900/40 p-3 text-xs text-dusk-100/80">
          Heads-up: with two players a disconnect pauses the round. Recovering it would mean handing
          your opponent enough key material to read your hand, so Veil refuses to.
        </p>
      ) : null}
    </fieldset>
  );
}

/** In-room badge: the tier, the audit state, and what recovery costs. */
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
    </div>
  );
}
