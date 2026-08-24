'use client';

import { useCallback, useSyncExternalStore } from 'react';
import { useWipeRouter } from '@/hooks/useWipeRouter';
import { type LegalMove } from '@parlour/engine';
import type { EuchreSuit } from '@parlour/game-euchre';
import { EuchreTableScreen } from '@/components/table/euchre/EuchreTableScreen';
import { EuchreTransport, type EuchreSnapshot } from '@/lib/solo/EuchreTransport';
import { euchreModeForRules } from '@/lib/euchre/modes';
import { euchreTableView, type EuchreTableView } from '@/lib/euchre/view';
import { winningTeamOf } from '@/lib/solo/seating';
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
import { useEuchreSetupStore } from '@/stores/euchreSetup';
import { multiplayerSession, type MultiplayerRoomSession } from '../../_multiplayer/roomSession';
import type { EuchreRules, EuchreState } from '@parlour/game-euchre';

export default function EuchreTablePage() {
  const room = useMultiplayerRoom('euchre');
  if (room) return <ActiveMultiplayerEuchreTable room={room} />;
  return <SoloEuchreTablePage />;
}

// ---------------------------------------------------------------------------
// solo
// ---------------------------------------------------------------------------

function SoloEuchreTablePage() {
  const mode = useEuchreSetupStore((state) => state.mode);
  const botTier = useEuchreSetupStore((state) => state.botTier);
  const name = useProfileStore((state) => state.name);
  const avatarId = useProfileStore((state) => state.avatarId);
  const transport = useSoloTransport(
    () => new EuchreTransport({ mode, seed: Date.now() | 0, player: { name, avatarId }, botTier }),
    [avatarId, botTier, mode, name],
  );

  if (!transport) return <EuchreTableScreen view={null} fx={[]} fxKey="loading" />;
  return <ActiveSoloEuchreTable transport={transport} />;
}

function ActiveSoloEuchreTable({ transport }: { transport: EuchreTransport }) {
  const router = useWipeRouter();
  const botPaceMs = useCallback(
    (current: EuchreSnapshot) =>
      current.session.state.stage === 'playing'
        ? 480 + (current.session.phase.actor ?? 0) * 90
        : 320,
    [],
  );
  const { snapshot, fx, fxKey, error, dispatch } = useSoloTable(transport, {
    round: (current) => current.session,
    botPaceMs,
  });

  useMatchReport({
    result: snapshot.matchWinnerTeam === null ? null : snapshot.session.result,
    game: 'euchre',
    mode: snapshot.mode,
    localSeat: 0,
    seats: soloSeats(snapshot.players),
    id: `solo:euchre:${snapshot.session.seed}`,
    // Partnership game, and Euchre ranks both seats of the winning side 1,
    // so the default "ranked first" predicate already reads as "my side won".
    playAgain: () => router.push('/euchre/table'),
  });

  const view = euchreTableView(snapshot, transport.legalMoves());

  return (
    <EuchreTableScreen
      view={view}
      fx={fx}
      fxKey={fxKey}
      busy={view.decision === null}
      error={error}
      onOrderUp={(alone) => dispatch('orderUp', { alone })}
      onCallTrump={(suit: EuchreSuit, alone) => dispatch('callTrump', { suit, alone })}
      onPass={() => dispatch('bidPass')}
      onDiscard={(card) => dispatch('dealerDiscard', { card })}
      onPlay={(card) => dispatch('playCard', { card })}
      onQuit={() => router.push('/euchre')}
    />
  );
}

// ---------------------------------------------------------------------------
// multiplayer
// ---------------------------------------------------------------------------

function ActiveMultiplayerEuchreTable({ room }: { room: MultiplayerRoomSession }) {
  const router = useWipeRouter();
  const snapshot = useSyncExternalStore(room.subscribe, room.getSnapshot, room.getSnapshot);
  const session = multiplayerSession<EuchreState, EuchreRules>(snapshot, 'euchre');
  const localSeat = snapshot.localSeat;
  const roomMode = session ? euchreModeForRules(session.config) : 'classic';

  const { dispatch, error: localError } = useRoomDispatch(room);

  useMatchReport({
    result: session?.result ?? null,
    game: 'euchre',
    mode: roomMode,
    localSeat,
    seats: roomSeats(snapshot.seats),
    id: session ? roomMatchId(snapshot.room?.code, session) : '',
    playAgain: () => router.push('/euchre/create'),
    onLeave: () => leaveRoom(room),
  });

  if (!session || localSeat === null) {
    return (
      <EuchreTableScreen
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

  const view: EuchreTableView = euchreTableView(
    {
      mode: roomMode,
      players: snapshot.seats.map((player) => ({
        seat: player.seat,
        name: player.name,
        avatarId: player.avatarId,
        isBot: player.bot,
      })),
      session,
      matchWinnerTeam: winningTeamOf(session),
    },
    legal,
    localSeat,
  );

  return (
    <EuchreTableScreen
      view={view}
      fx={snapshot.fx}
      fxKey={snapshot.fxKey}
      busy={!isLocalTurn}
      error={localError ?? snapshot.error}
      onOrderUp={(alone) => dispatch('orderUp', { alone })}
      onCallTrump={(suit: EuchreSuit, alone) => dispatch('callTrump', { suit, alone })}
      onPass={() => dispatch('bidPass')}
      onDiscard={(card) => dispatch('dealerDiscard', { card })}
      onPlay={(card) => dispatch('playCard', { card })}
      onQuit={() => {
        leaveRoom(room);
        router.push('/euchre');
      }}
    />
  );
}
