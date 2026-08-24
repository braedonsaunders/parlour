'use client';

import { useCallback, useSyncExternalStore } from 'react';
import { useWipeRouter } from '@/hooks/useWipeRouter';
import { type LegalMove } from '@parlour/engine';
import { SpadesTableScreen } from '@/components/table/spades/SpadesTableScreen';
import { SpadesTransport, type SpadesSnapshot } from '@/lib/solo/SpadesTransport';
import { spadesModeForRules } from '@/lib/spades/modes';
import { spadesTableView, type SpadesTableView } from '@/lib/spades/view';
import { useSoloTable } from '@/lib/table/useSoloTable';
import {
  leaveRoom,
  roomMatchId,
  roomSeats,
  soloSeats,
  useMatchReport,
  useMultiplayerRoom,
  useRoomDispatch,
  useSoloTransport,
} from '@/lib/table/useGameTable';
import { useProfileStore } from '@/stores/profile';
import { useSpadesSetupStore } from '@/stores/spadesSetup';
import { multiplayerSession, type MultiplayerRoomSession } from '../../_multiplayer/roomSession';
import type { SpadesRules, SpadesState } from '@parlour/game-spades';

export default function SpadesTablePage() {
  const room = useMultiplayerRoom('spades');
  if (room) return <ActiveMultiplayerSpadesTable room={room} />;
  return <SoloSpadesTablePage />;
}

// ---------------------------------------------------------------------------
// solo
// ---------------------------------------------------------------------------

function SoloSpadesTablePage() {
  const mode = useSpadesSetupStore((state) => state.mode);
  const botTier = useSpadesSetupStore((state) => state.botTier);
  const name = useProfileStore((state) => state.name);
  const avatarId = useProfileStore((state) => state.avatarId);

  const transport = useSoloTransport(
    () => new SpadesTransport({ mode, seed: Date.now() | 0, player: { name, avatarId }, botTier }),
    [avatarId, botTier, mode, name],
  );

  if (!transport) return <SpadesTableScreen view={null} fx={[]} fxKey="loading" />;
  return <ActiveSoloSpadesTable transport={transport} />;
}

function ActiveSoloSpadesTable({ transport }: { transport: SpadesTransport }) {
  const router = useWipeRouter();
  // Bidding is a conversation; trick play keeps a human beat.
  const botPaceMs = useCallback(
    (current: SpadesSnapshot) =>
      current.session.state.stage === 'bidding'
        ? 520
        : 420 + (current.session.phase.actor ?? 0) * 70,
    [],
  );
  const { snapshot, fx, fxKey, error, dispatch } = useSoloTable(transport, {
    round: (current) => current.session,
    botPaceMs,
  });

  useMatchReport({
    result: snapshot.matchWinnerTeam === null ? null : snapshot.session.result,
    game: 'spades',
    mode: snapshot.mode,
    localSeat: 0,
    seats: soloSeats(snapshot.players),
    id: `solo:spades:${snapshot.session.seed}`,
    // No `won` override needed: Spades ranks BOTH seats of the winning team 1,
    // so "ranked first" already means "my side took it".
    playAgain: () => router.push('/spades/table'),
  });

  const view = spadesTableView(snapshot, transport.legalMoves());

  return (
    <SpadesTableScreen
      view={view}
      fx={fx}
      fxKey={fxKey}
      busy={view.decision === null}
      error={error}
      onBid={(bid) => dispatch('bid', { bid })}
      onBidNil={() => dispatch('bidNil')}
      onPlay={(card) => dispatch('playCard', { card })}
      onQuit={() => router.push('/spades')}
    />
  );
}

// ---------------------------------------------------------------------------
// multiplayer
// ---------------------------------------------------------------------------

function ActiveMultiplayerSpadesTable({ room }: { room: MultiplayerRoomSession }) {
  const router = useWipeRouter();
  const snapshot = useSyncExternalStore(room.subscribe, room.getSnapshot, room.getSnapshot);
  const setSetupMode = useSpadesSetupStore((state) => state.setMode);
  const { dispatch, error: localError } = useRoomDispatch(room);
  const session = multiplayerSession<SpadesState, SpadesRules>(snapshot, 'spades');
  const localSeat = snapshot.localSeat;
  const mode = session ? spadesModeForRules(session.config) : 'classic';

  useMatchReport({
    result: session?.result ?? null,
    game: 'spades',
    mode,
    localSeat,
    seats: roomSeats(snapshot.seats),
    id: session ? roomMatchId(snapshot.room?.code, session) : '',
    playAgain: () => {
      // The new room is built from the setup store, so a rematch has to carry
      // the mode this match was actually played under. Without this a guest
      // who joined a Quick or Clean Books table would silently host Classic.
      setSetupMode(mode);
      router.push('/spades/create');
    },
    onLeave: () => leaveRoom(room),
  });

  if (!session || localSeat === null) {
    return (
      <SpadesTableScreen
        view={null}
        fx={snapshot.fx}
        fxKey={snapshot.fxKey}
        error={localError ?? snapshot.error}
      />
    );
  }

  const isLocalTurn = session.status === 'playing' && session.phase.actor === localSeat;
  const legal: readonly LegalMove[] = isLocalTurn
    ? session.def.flow.legalMoves(session.state, session.phase)
    : [];

  const view: SpadesTableView = spadesTableView(
    {
      mode,
      players: snapshot.seats.map((player) => ({
        seat: player.seat,
        name: player.name,
        avatarId: player.avatarId,
        isBot: player.bot,
      })),
      session,
      matchWinnerTeam: matchWinnerTeamOf(session),
    },
    legal,
    localSeat,
  );

  return (
    <SpadesTableScreen
      view={view}
      fx={snapshot.fx}
      fxKey={snapshot.fxKey}
      busy={!isLocalTurn}
      error={localError ?? snapshot.error}
      onBid={(bid) => dispatch('bid', { bid })}
      onBidNil={() => dispatch('bidNil')}
      onPlay={(card) => dispatch('playCard', { card })}
      onQuit={() => {
        leaveRoom(room);
        router.push('/spades');
      }}
    />
  );
}

function matchWinnerTeamOf(session: {
  result: { rankings: readonly { seat: number; rank: number }[] } | null;
}): 0 | 1 | null {
  if (!session.result) return null;
  const rankOne = session.result.rankings.find((rank) => rank.rank === 1);
  return rankOne ? ((rankOne.seat % 2) as 0 | 1) : null;
}
