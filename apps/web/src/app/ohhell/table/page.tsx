'use client';

import { useCallback, useSyncExternalStore } from 'react';
import { useRouter } from 'next/navigation';
import { OhHellTableScreen } from '@/components/table/ohhell/OhHellTableScreen';
import { OhHellTransport, type OhHellSnapshot } from '@/lib/solo/OhHellTransport';
import { ohhellModeForRules } from '@/lib/ohhell/modes';
import { ohhellTableView } from '@/lib/ohhell/view';
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
import { useOhHellSetupStore } from '@/stores/ohhellSetup';
import { multiplayerSession, type MultiplayerRoomSession } from '../../_multiplayer/roomSession';
import type { OhHellRules, OhHellState } from '@parlour/game-ohhell';

export default function OhHellTablePage() {
  const room = useMultiplayerRoom('ohhell');
  if (room) return <ActiveMultiplayerOhHellTable room={room} />;
  return <SoloOhHellTablePage />;
}

// ---------------------------------------------------------------------------
// solo
// ---------------------------------------------------------------------------

function SoloOhHellTablePage() {
  const mode = useOhHellSetupStore((state) => state.mode);
  const seats = useOhHellSetupStore((state) => state.seats);
  const botTier = useOhHellSetupStore((state) => state.botTier);
  const name = useProfileStore((state) => state.name);
  const avatarId = useProfileStore((state) => state.avatarId);

  const transport = useSoloTransport(
    () =>
      new OhHellTransport({
        mode,
        seats,
        seed: Date.now() | 0,
        player: { name, avatarId },
        botTier,
      }),
    [avatarId, botTier, mode, name, seats],
  );

  if (!transport) return <OhHellTableScreen view={null} fx={[]} fxKey="loading" />;
  return <ActiveSoloOhHellTable transport={transport} />;
}

function ActiveSoloOhHellTable({ transport }: { transport: OhHellTransport }) {
  const router = useRouter();
  // A bid is a decision worth a beat; a trick play keeps a human rhythm.
  const botPaceMs = useCallback(
    (current: OhHellSnapshot) => (current.hand.state.stage === 'bidding' ? 520 : 430),
    [],
  );

  const { snapshot, fx, fxKey, error, dispatch, accept } = useSoloTable(transport, {
    round: (current) => current.hand,
    botPaceMs,
    // A freshly opened round emits its deal through setupFx rather than through
    // the move that opened it, so fall back to it or the cascade is swallowed.
    fxFor: (outcome) =>
      outcome.fx.length > 0 ? outcome.fx : (outcome.snapshot.hand.setupFx ?? []),
  });

  useMatchReport({
    result: snapshot.matchResult,
    game: 'ohhell',
    mode: snapshot.mode,
    localSeat: 0,
    seats: soloSeats(snapshot.players),
    id: `solo:ohhell:${snapshot.hand.seed}`,
    playAgain: () => router.push('/ohhell/table'),
  });

  const view = ohhellTableView(snapshot, transport.legalMovesForSeat(0));

  return (
    <OhHellTableScreen
      view={view}
      fx={fx}
      fxKey={fxKey}
      busy={view.decision === null}
      error={error}
      onBid={(bid) => dispatch('bid', { bid })}
      onChooseTrump={(suit) => dispatch('chooseTrump', { suit })}
      onPlay={(card) => dispatch('playCard', { card })}
      onNextRound={() => accept(transport.startNextRound())}
      onQuit={() => router.push('/ohhell')}
    />
  );
}

// ---------------------------------------------------------------------------
// multiplayer
// ---------------------------------------------------------------------------

function ActiveMultiplayerOhHellTable({ room }: { room: MultiplayerRoomSession }) {
  const router = useRouter();
  const snapshot = useSyncExternalStore(room.subscribe, room.getSnapshot, room.getSnapshot);
  const setSetupMode = useOhHellSetupStore((state) => state.setMode);
  const { dispatch, error: localError } = useRoomDispatch(room);
  const session = multiplayerSession<OhHellState, OhHellRules>(snapshot, 'ohhell');
  const localSeat = snapshot.localSeat;
  const roomMode = session ? ohhellModeForRules(session.config) : 'classic';

  useMatchReport({
    result: session?.result ?? null,
    game: 'ohhell',
    mode: roomMode,
    localSeat,
    seats: roomSeats(snapshot.seats),
    id: session ? roomMatchId(snapshot.room?.code, session) : '',
    playAgain: () => {
      // A rematch is built from the setup store, so it has to carry the rules
      // this room was actually played under.
      setSetupMode(roomMode);
      router.push('/ohhell/create');
    },
    onLeave: () => leaveRoom(room),
  });

  if (!session || localSeat === null) {
    return (
      <OhHellTableScreen
        view={null}
        fx={snapshot.fx}
        fxKey={snapshot.fxKey}
        error={localError ?? snapshot.error}
      />
    );
  }

  const isLocalTurn = session.status === 'playing' && session.phase.actor === localSeat;
  const legal = isLocalTurn
    ? (session.def.flow.legalMovesFor?.(session.state, session.phase, localSeat) ??
      session.def.flow.legalMoves(session.state, session.phase))
    : [];

  /*
   * A friend room is one flat `GameSession`, not a match, so there is no
   * cumulative score and no next round. The view wants a match-shaped snapshot,
   * so the room supplies a one-round match: round 1 of 1, scores at zero.
   */
  const view = ohhellTableView(
    {
      mode: roomMode,
      round: 1,
      rounds: 1,
      players: snapshot.seats.map((seat) => ({
        seat: seat.seat,
        name: seat.name,
        avatarId: seat.avatarId,
        isBot: seat.bot,
      })),
      hand: session,
      scores: snapshot.seats.map(() => 0),
      status: session.status === 'ended' ? 'ended' : 'playing',
      roundResult: session.result,
      matchResult: session.result,
      matchWinner: session.result?.winner ?? null,
    },
    legal,
    localSeat,
  );

  return (
    <OhHellTableScreen
      view={view}
      fx={snapshot.fx}
      fxKey={snapshot.fxKey}
      busy={!isLocalTurn}
      error={localError ?? snapshot.error}
      onBid={(bid) => dispatch('bid', { bid })}
      onChooseTrump={(suit) => dispatch('chooseTrump', { suit })}
      onPlay={(card) => dispatch('playCard', { card })}
      onQuit={() => {
        leaveRoom(room);
        router.push('/ohhell');
      }}
    />
  );
}
