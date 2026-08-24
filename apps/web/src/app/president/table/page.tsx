'use client';

import { useCallback, useSyncExternalStore } from 'react';
import { useWipeRouter } from '@/hooks/useWipeRouter';
import type { GameSession } from '@parlour/engine';
import { PresidentTableScreen } from '@/components/table/president/PresidentTableScreen';
import { PresidentTransport, type PresidentSnapshot } from '@/lib/solo/PresidentTransport';
import { presidentModeForRules } from '@/lib/president/modes';
import { presidentTableView } from '@/lib/president/view';
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
import { presidentRulesFor, usePresidentSetupStore } from '@/stores/presidentSetup';
import { multiplayerSession, type MultiplayerRoomSession } from '../../_multiplayer/roomSession';
import type { PresidentRules, PresidentState } from '@parlour/game-president';

export default function PresidentTablePage() {
  const room = useMultiplayerRoom('president');
  if (room) return <ActiveMultiplayerPresidentTable room={room} />;
  return <SoloPresidentTablePage />;
}

function SoloPresidentTablePage() {
  const mode = usePresidentSetupStore((state) => state.mode);
  const seats = usePresidentSetupStore((state) => state.seats);
  const overrides = usePresidentSetupStore((state) => state.overrides);
  const botTier = usePresidentSetupStore((state) => state.botTier);
  const name = useProfileStore((state) => state.name);
  const avatarId = useProfileStore((state) => state.avatarId);

  const transport = useSoloTransport(
    () =>
      new PresidentTransport({
        mode,
        rules: presidentRulesFor(mode, overrides),
        seats,
        seed: Date.now() | 0,
        player: { name, avatarId },
        botTier,
      }),
    [avatarId, botTier, mode, name, overrides, seats],
  );

  if (!transport) return <PresidentTableScreen view={null} fx={[]} fxKey="loading" />;
  return <ActivePresidentTable transport={transport} />;
}

function ActiveMultiplayerPresidentTable({ room }: { room: MultiplayerRoomSession }) {
  const router = useWipeRouter();
  const snapshot = useSyncExternalStore(room.subscribe, room.getSnapshot, room.getSnapshot);
  const session = multiplayerSession<PresidentState, PresidentRules>(snapshot, 'president');
  const localSeat = snapshot.localSeat;
  const roomMode = session ? presidentModeForRules(session.config as PresidentRules) : 'classic';

  const { dispatch, error: localError } = useRoomDispatch(room);

  useMatchReport({
    result: session?.result ?? null,
    game: 'president',
    mode: roomMode,
    localSeat,
    seats: roomSeats(snapshot.seats),
    id: session ? roomMatchId(snapshot.room?.code, session) : '',
    playAgain: () => router.push('/president/create'),
    onLeave: () => leaveRoom(room),
  });

  if (!session || localSeat === null) {
    return (
      <PresidentTableScreen
        view={null}
        fx={snapshot.fx}
        fxKey={snapshot.fxKey}
        error={localError ?? snapshot.error}
      />
    );
  }

  const isLocalActing =
    session.status === 'playing' &&
    ((session.phase.actors ?? []).includes(localSeat) || session.phase.actor === localSeat);
  const legal = isLocalActing
    ? (session.def.flow.legalMovesFor?.(session.state, session.phase, localSeat) ?? [])
    : [];
  const snapshotView: PresidentSnapshot = {
    mode: presidentModeForRules(session.config as PresidentRules),
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
    <PresidentTableScreen
      view={presidentTableView(snapshotView, legal, localSeat)}
      fx={snapshot.fx}
      fxKey={snapshot.fxKey}
      busy={!isLocalActing}
      error={localError ?? snapshot.error}
      onConfirm={(cards) =>
        dispatch(
          session.phase.phase.startsWith('exchange')
            ? pickExchangeMove(session, localSeat)
            : 'playSet',
          { cards },
        )
      }
      onPass={() => dispatch('pass')}
      onQuit={() => {
        leaveRoom(room);
        router.push('/president');
      }}
    />
  );
}

function pickExchangeMove(
  session: GameSession<PresidentState, PresidentRules>,
  seat: number,
): string {
  if ((session.phase.actors ?? []).includes(seat) && session.phase.phase === 'exchange-give') {
    return 'giveCards';
  }
  return 'returnCards';
}

function ActivePresidentTable({ transport }: { transport: PresidentTransport }) {
  const router = useWipeRouter();

  // Exchange decisions read as deliberation; regular turns keep the human pace.
  const botPaceMs = useCallback(
    (current: PresidentSnapshot) =>
      current.session.phase.phase === 'play' ? 520 + (current.session.phase.actor ?? 0) * 80 : 420,
    [],
  );
  const { snapshot, fx, fxKey, error, dispatch } = useSoloTable(transport, {
    round: (current) => current.session,
    botPaceMs,
  });

  useMatchReport({
    result: snapshot.matchWinner === null ? null : (snapshot.session.result ?? null),
    game: 'president',
    mode: snapshot.mode,
    localSeat: 0,
    seats: soloSeats(snapshot.players),
    id: `solo:president:${snapshot.session.seed}`,
    won: snapshot.matchWinner === 0,
    playAgain: () => router.push('/president/table'),
  });

  const actingLocally =
    snapshot.session.status === 'playing' &&
    ((snapshot.session.phase.actors ?? []).includes(0) || snapshot.session.phase.actor === 0);

  const view = presidentTableView(snapshot, actingLocally ? localLegalMoves(snapshot) : []);

  return (
    <PresidentTableScreen
      view={view}
      fx={fx}
      fxKey={fxKey}
      busy={!actingLocally}
      error={error}
      onConfirm={(cards) =>
        dispatch(
          snapshot.session.phase.phase === 'exchange-give' ||
            ((snapshot.session.phase.actors ?? []).includes(0) &&
              snapshot.session.phase.phase === 'exchange-give')
            ? 'giveCards'
            : snapshot.session.state.awaitingReturn?.seat === 0
              ? 'returnCards'
              : 'playSet',
          { cards },
        )
      }
      onPass={() => dispatch('pass')}
      onQuit={() => router.push('/president')}
    />
  );
}

function localLegalMoves(snapshot: PresidentSnapshot) {
  const { session } = snapshot;
  if (session.status !== 'playing') return [];
  return (
    session.def.flow.legalMovesFor?.(session.state, session.phase, 0) ??
    session.def.flow.legalMoves(session.state, session.phase)
  );
}
