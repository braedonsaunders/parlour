'use client';

import { useCallback } from 'react';
import type { LegalMove } from '@parlour/engine';
import { useWipeRouter } from '@/hooks/useWipeRouter';
import { SpiteTableScreen } from '@/components/table/spite/SpiteTableScreen';
import { SpiteTransport } from '@/lib/solo/SpiteTransport';
import { spiteTableView } from '@/lib/spite/view';
import { useSoloTable } from '@/lib/table/useSoloTable';
import { soloSeats, useMatchReport, useSoloTransport } from '@/lib/table/useGameTable';
import { useProfileStore } from '@/stores/profile';
import { useSpiteSetupStore } from '@/stores/spiteSetup';

/**
 * Solo only, deliberately.
 *
 * Friend rooms on this shelf all run under Veil now, and neither this pack nor
 * Scopa ships a `veil` block yet — Spite would have to hide the buried cards of
 * a payoff pile while keeping its top face up, which has no analogue in the
 * games Veil covers today. Offering a room that quietly ran in the open tier
 * would be the dishonesty the room copy exists to avoid, so the table simply
 * does not offer one until the pack can back it.
 */
export default function SpiteTablePage() {
  return <SoloSpiteTablePage />;
}

// ---------------------------------------------------------------------------
// solo
// ---------------------------------------------------------------------------

function SoloSpiteTablePage() {
  const mode = useSpiteSetupStore((state) => state.mode);
  const seats = useSpiteSetupStore((state) => state.seats);
  const botTier = useSpiteSetupStore((state) => state.botTier);
  const name = useProfileStore((state) => state.name);
  const avatarId = useProfileStore((state) => state.avatarId);

  const transport = useSoloTransport(
    () =>
      new SpiteTransport({
        mode,
        seats,
        seed: Date.now() | 0,
        player: { name, avatarId },
        botTier,
      }),
    [avatarId, botTier, mode, name, seats],
  );

  if (!transport) return <SpiteTableScreen view={null} fx={[]} fxKey="loading" />;
  return <ActiveSoloSpiteTable transport={transport} />;
}

function ActiveSoloSpiteTable({ transport }: { transport: SpiteTransport }) {
  const router = useWipeRouter();
  // A Spite turn is a run of builds and then one discard, so a bot pausing
  // between every build would make its turn interminable.
  const botPaceMs = useCallback(() => 240, []);

  const { snapshot, fx, fxKey, error, dispatch } = useSoloTable(transport, {
    round: (current) => current.session,
    botPaceMs,
  });

  const legal = transport.legalMoves(0);

  useMatchReport({
    result: snapshot.session.result,
    game: 'spite',
    mode: snapshot.mode,
    localSeat: 0,
    seats: soloSeats(snapshot.players),
    id: `solo:spite:${snapshot.session.seed}`,
    playAgain: () => router.push('/spite/table'),
  });

  return (
    <SpiteTableScreen
      view={spiteTableView(snapshot, legal)}
      legal={legal}
      fx={fx}
      fxKey={fxKey}
      busy={snapshot.session.state.turn !== 0 || snapshot.session.status !== 'playing'}
      error={error}
      onPlay={(move: LegalMove) => dispatch(move.id, move.payload)}
      onQuit={() => router.push('/spite')}
    />
  );
}
