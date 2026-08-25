'use client';

import { useCallback } from 'react';
import type { LegalMove } from '@parlour/engine';
import { useWipeRouter } from '@/hooks/useWipeRouter';
import { ScopaTableScreen } from '@/components/table/scopa/ScopaTableScreen';
import { ScopaTransport } from '@/lib/solo/ScopaTransport';
import { scopaTableView } from '@/lib/scopa/view';
import { useSoloTable } from '@/lib/table/useSoloTable';
import { soloSeats, useMatchReport, useSoloTransport } from '@/lib/table/useGameTable';
import { useProfileStore } from '@/stores/profile';
import { useScopaSetupStore } from '@/stores/scopaSetup';

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
export default function ScopaTablePage() {
  return <SoloScopaTablePage />;
}

// ---------------------------------------------------------------------------
// solo
// ---------------------------------------------------------------------------

function SoloScopaTablePage() {
  const mode = useScopaSetupStore((state) => state.mode);
  const seats = useScopaSetupStore((state) => state.seats);
  const botTier = useScopaSetupStore((state) => state.botTier);
  const name = useProfileStore((state) => state.name);
  const avatarId = useProfileStore((state) => state.avatarId);

  const transport = useSoloTransport(
    () =>
      new ScopaTransport({
        mode,
        seats,
        seed: Date.now() | 0,
        player: { name, avatarId },
        botTier,
      }),
    [avatarId, botTier, mode, name, seats],
  );

  if (!transport) return <ScopaTableScreen view={null} fx={[]} fxKey="loading" />;
  return <ActiveSoloScopaTable transport={transport} />;
}

function ActiveSoloScopaTable({ transport }: { transport: ScopaTransport }) {
  const router = useWipeRouter();
  // One card per turn, so a bot can take a human beat without dragging.
  const botPaceMs = useCallback(() => 420, []);

  const { snapshot, fx, fxKey, error, dispatch } = useSoloTable(transport, {
    round: (current) => current.session,
    botPaceMs,
  });

  const legal = transport.legalMoves(0);

  useMatchReport({
    result: snapshot.session.result,
    game: 'scopa',
    mode: snapshot.mode,
    localSeat: 0,
    seats: soloSeats(snapshot.players),
    id: `solo:scopa:${snapshot.session.seed}`,
    playAgain: () => router.push('/scopa/table'),
  });

  return (
    <ScopaTableScreen
      view={scopaTableView(snapshot, legal)}
      legal={legal}
      fx={fx}
      fxKey={fxKey}
      busy={snapshot.session.state.turn !== 0 || snapshot.session.status !== 'playing'}
      error={error}
      onPlay={(move: LegalMove) => dispatch(move.id, move.payload)}
      onQuit={() => router.push('/scopa')}
    />
  );
}
