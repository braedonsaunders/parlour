'use client';

import { useCallback, useSyncExternalStore } from 'react';
import { useWipeRouter } from '@/hooks/useWipeRouter';
import { type MatchResult } from '@parlour/engine';
import { CribbageTableScreen } from '@/components/table/cribbage/CribbageTableScreen';
import { cribbageModeForRules } from '@/lib/cribbage/modes';
import { cribbageTableView, type CribbageSnapshotLike } from '@/lib/cribbage/view';
import { CribbageTransport } from '@/lib/solo/CribbageTransport';
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
import { cribbageRulesFor, useCribbageSetupStore } from '@/stores/cribbageSetup';
import { multiplayerSession, type MultiplayerRoomSession } from '../../_multiplayer/roomSession';
import type { CribbageConfig, CribbageState } from '@parlour/game-cribbage';

export default function CribbageTablePage() {
  const room = useMultiplayerRoom('cribbage');
  if (room) return <MultiplayerTable room={room} />;
  return <SoloTable />;
}

function SoloTable() {
  const mode = useCribbageSetupStore((state) => state.mode);
  const botTier = useCribbageSetupStore((state) => state.botTier);
  const overrides = useCribbageSetupStore((state) => state.overrides);
  const name = useProfileStore((state) => state.name);
  const avatarId = useProfileStore((state) => state.avatarId);
  const rulesKey = JSON.stringify(cribbageRulesFor(mode, overrides));

  const transport = useSoloTransport(
    () =>
      new CribbageTransport({
        mode,
        botTier,
        seed: Date.now() | 0,
        player: { name, avatarId },
        rules: JSON.parse(rulesKey) as CribbageConfig,
      }),
    [avatarId, botTier, mode, name, rulesKey],
  );

  if (!transport) return <CribbageTableScreen view={null} fx={[]} fxKey="loading" />;
  return <ActiveSoloTable transport={transport} />;
}

function ActiveSoloTable({ transport }: { transport: CribbageTransport }) {
  const router = useWipeRouter();
  const botPaceMs = useCallback(
    (_current: ReturnType<CribbageTransport['getSnapshot']>) => 420,
    [],
  );
  const { snapshot, fx, fxKey, error, dispatch } = useSoloTable(transport, {
    round: (current) => current.match.round,
    botPaceMs,
  });

  useMatchReport({
    result: snapshot.match.result,
    game: 'cribbage',
    mode: snapshot.mode,
    localSeat: 0,
    seats: soloSeats(snapshot.players),
    id: `solo:cribbage:${snapshot.match.seed}:${snapshot.match.roundLogs.length}`,
    playAgain: () => router.push('/cribbage'),
  });

  const legal = transport.legalMoves(0);
  const view = cribbageTableView(snapshot, legal, 0);
  return (
    <CribbageTableScreen
      view={view}
      fx={fx}
      fxKey={fxKey}
      busy={!transport.humanCanAct()}
      error={error}
      onDiscard={(cards) => dispatch('crib.discard', { cards })}
      onCut={() => dispatch('cut')}
      onPlay={(card) => dispatch('playCard', { card })}
      onClaim={() => dispatch('claim')}
      onSteal={() => dispatch('steal')}
      onQuit={() => router.push('/cribbage')}
    />
  );
}

function MultiplayerTable({ room }: { room: MultiplayerRoomSession }) {
  const router = useWipeRouter();
  const snapshot = useSyncExternalStore(room.subscribe, room.getSnapshot, room.getSnapshot);
  const session = multiplayerSession<CribbageState, CribbageConfig>(snapshot, 'cribbage');
  const localSeat = snapshot.localSeat;
  const roomMode = session ? cribbageModeForRules(session.config) : 'classic';

  const { dispatch, error: localError } = useRoomDispatch(room);

  useMatchReport({
    result: session?.result ? cribbageRoomResult(session.result) : null,
    game: 'cribbage',
    mode: roomMode,
    localSeat,
    seats: roomSeats(snapshot.seats),
    id: session ? roomMatchId(snapshot.room?.code, session) : '',
    playAgain: () => router.push('/cribbage/create'),
    onLeave: () => leaveRoom(room),
  });

  if (!session || localSeat === null) {
    return (
      <CribbageTableScreen
        view={null}
        fx={snapshot.fx}
        fxKey={snapshot.fxKey}
        error={localError ?? snapshot.error}
      />
    );
  }
  const legal =
    session.status === 'playing'
      ? (session.def.flow.legalMovesFor?.(session.state, session.phase, localSeat) ??
        (session.phase.actor === localSeat
          ? session.def.flow.legalMoves(session.state, session.phase)
          : []))
      : [];
  const mode = cribbageModeForRules(session.config);
  const winners =
    session.result?.rankings.filter((rank) => rank.rank === 1).map((rank) => rank.seat) ?? [];
  const renderSnapshot: CribbageSnapshotLike = {
    mode,
    players: snapshot.seats.map((seat) => ({
      seat: seat.seat,
      name: seat.name,
      avatarId: seat.avatarId,
      personaId: seat.profileId,
      isBot: seat.bot,
    })),
    match: {
      status: session.status === 'ended' ? 'ended' : 'playing',
      round: session,
      match: {
        wins: snapshot.seats.map((seat) => (winners.includes(seat.seat) ? 1 : 0)),
        targetWins: 1,
      },
    },
  };
  return (
    <CribbageTableScreen
      view={cribbageTableView(renderSnapshot, legal, localSeat)}
      fx={snapshot.fx}
      fxKey={snapshot.fxKey}
      busy={legal.length === 0}
      error={localError ?? snapshot.error}
      onDiscard={(cards) => dispatch('crib.discard', { cards })}
      onCut={() => dispatch('cut')}
      onPlay={(card) => dispatch('playCard', { card })}
      onClaim={() => dispatch('claim')}
      onSteal={() => dispatch('steal')}
      onQuit={() => {
        leaveRoom(room);
        router.push('/cribbage');
      }}
    />
  );
}

function cribbageRoomResult(result: MatchResult): MatchResult {
  return {
    ...result,
    rankings: result.rankings.map((ranking) => ({
      ...ranking,
      detail: {
        ...ranking.detail,
        wins: ranking.rank === 1 ? 1 : 0,
      },
    })),
  };
}
