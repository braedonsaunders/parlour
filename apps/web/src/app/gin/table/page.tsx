'use client';

import { useCallback, useSyncExternalStore } from 'react';
import { useWipeRouter } from '@/hooks/useWipeRouter';
import type { GinModeId } from '@/lib/gin/modes';
import { GinTableScreen } from '@/components/table/gin/GinTableScreen';
import { GinTransport, type GinSnapshot } from '@/lib/solo/GinTransport';
import { ginTableView } from '@/lib/gin/view';
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
import { useGinSetupStore } from '@/stores/ginSetup';
import { multiplayerSession, type MultiplayerRoomSession } from '../../_multiplayer/roomSession';
import type { GinConfig, GinMatchState } from '@parlour/game-gin';

export default function GinTablePage() {
  const room = useMultiplayerRoom('gin');
  if (room) return <ActiveMultiplayerGinTable room={room} />;
  return <SoloGinTablePage />;
}

function SoloGinTablePage() {
  const mode = useGinSetupStore((state) => state.mode);
  const botTier = useGinSetupStore((state) => state.botTier);
  const name = useProfileStore((state) => state.name);
  const avatarId = useProfileStore((state) => state.avatarId);

  const transport = useSoloTransport(
    () => new GinTransport({ mode, botTier, seed: Date.now() | 0, player: { name, avatarId } }),
    [avatarId, mode, botTier, name],
  );

  if (!transport) return <GinTableScreen view={null} fx={[]} fxKey="loading" />;
  return <SoloGinTable transport={transport} />;
}

function SoloGinTable({ transport }: { transport: GinTransport }) {
  const router = useWipeRouter();
  const botPaceMs = useCallback(
    (current: GinSnapshot) =>
      current.session.state.folded && current.session.phase.phase === 'hand-end' ? 420 : 520,
    [],
  );
  const { snapshot, fx, fxKey, error, dispatch } = useSoloTable(transport, {
    round: (current) => current.session,
    botPaceMs,
  });

  useMatchReport({
    result: snapshot.matchWinner === null ? null : (snapshot.session.result ?? null),
    game: 'gin',
    mode: snapshot.mode,
    localSeat: 0,
    seats: soloSeats(snapshot.players),
    id: `solo:gin:${snapshot.session.seed}`,
    won: snapshot.matchWinner === 0,
    playAgain: () => router.push('/gin/table'),
  });

  const view = ginTableView(snapshot, transport.legalMoves());

  return (
    <GinTableScreen
      view={view}
      fx={fx}
      fxKey={fxKey}
      mode={snapshot.mode}
      busy={snapshot.session.phase.actor !== 0 || snapshot.session.status !== 'playing'}
      error={error}
      onTakeUpcard={() => dispatch('option.take')}
      onPassUpcard={() => dispatch('option.pass')}
      onDraw={(source) => dispatch(source === 'stock' ? 'draw.stock' : 'draw.discard')}
      onDiscard={(card) => dispatch('discard', { card })}
      onKnock={() => dispatch('knock')}
      onReady={() => dispatch('ready')}
      onQuit={() => router.push('/gin')}
    />
  );
}

function ActiveMultiplayerGinTable({ room }: { room: MultiplayerRoomSession }) {
  const router = useWipeRouter();
  const snapshot = useSyncExternalStore(room.subscribe, room.getSnapshot, room.getSnapshot);
  const session = multiplayerSession<GinMatchState, GinConfig>(snapshot, 'gin');
  const localSeat = snapshot.localSeat;

  const { dispatch, error: localError } = useRoomDispatch(room);

  useMatchReport({
    result: session?.result ?? null,
    game: 'gin',
    mode: 'classic',
    localSeat,
    seats: roomSeats(snapshot.seats),
    id: session ? roomMatchId(snapshot.room?.code, session) : '',
    playAgain: () => router.push('/gin/create'),
    onLeave: () => leaveRoom(room),
  });

  if (!session || localSeat === null) {
    return (
      <GinTableScreen
        view={null}
        fx={snapshot.fx}
        fxKey={snapshot.fxKey}
        error={localError ?? snapshot.error}
      />
    );
  }

  const isLocalTurn =
    session.status === 'playing' && !session.state.folded && session.phase.actor === localSeat;
  const legal = isLocalTurn
    ? session.def.flow.legalMovesFor!(session.state, session.phase, localSeat)
    : [];
  const snap: GinSnapshot = {
    mode: 'classic' as GinModeId,
    players: snapshot.seats.map((player) => ({
      seat: player.seat,
      name: player.name,
      avatarId: player.avatarId,
      isBot: player.bot,
    })),
    session,
    matchWinner: session.result?.winner ?? null,
  };

  return (
    <GinTableScreen
      view={ginTableView(snap, legal, localSeat)}
      fx={snapshot.fx}
      fxKey={snapshot.fxKey}
      busy={!isLocalTurn}
      error={localError ?? snapshot.error}
      onTakeUpcard={() => dispatch('option.take')}
      onPassUpcard={() => dispatch('option.pass')}
      onDraw={(source) => dispatch(source === 'stock' ? 'draw.stock' : 'draw.discard')}
      onDiscard={(card) => dispatch('discard', { card })}
      onKnock={() => dispatch('knock')}
      onReady={() => dispatch('ready')}
      onQuit={() => {
        leaveRoom(room);
        router.push('/gin');
      }}
    />
  );
}
