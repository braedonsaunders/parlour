'use client';

import type { LegalMove } from '@parlour/engine';
import type { SpiteRules, SpiteState } from '@parlour/game-spite';
import { SpiteTableScreen } from '@/components/table/spite/SpiteTableScreen';
import { defineTablePack, turnBasedDriver } from '@/components/table/GameTablePage';
import { spiteModeForRules } from '@/lib/spite/modes';
import { spiteTableView } from '@/lib/spite/view';
import { roomMatchId } from '@/lib/table/useMatchReport';
import { SpiteTransport, type SpiteDispatch, type SpiteSnapshot } from '@/lib/solo/SpiteTransport';
import { botKey, friendKey } from '@/stores/history';
import { useProfileStore } from '@/stores/profile';
import { useSpiteSetupStore } from '@/stores/spiteSetup';

export const spiteTablePack = defineTablePack<
  SpiteSnapshot,
  SpiteDispatch,
  SpiteTransport,
  SpiteState,
  SpiteRules
>({
  id: 'spite',
  gameId: 'spite',

  useSoloDeal() {
    const mode = useSpiteSetupStore((state) => state.mode);
    const seats = useSpiteSetupStore((state) => state.seats);
    const botTier = useSpiteSetupStore((state) => state.botTier);
    const name = useProfileStore((state) => state.name);
    const avatarId = useProfileStore((state) => state.avatarId);
    return {
      create: () =>
        new SpiteTransport({
          mode,
          seats,
          seed: Date.now() | 0,
          player: { name, avatarId },
          botTier,
        }),
      deps: [avatarId, botTier, mode, name, seats],
    };
  },

  useSoloDriver: turnBasedDriver({
    round: (current) => current.session,
    // A Spite turn is a run of builds and then one discard, so a bot pausing
    // between every build would make its turn interminable.
    botPaceMs: () => 240,
  }),

  renderPending: ({ fx, fxKey, error }) => (
    <SpiteTableScreen view={null} fx={fx} fxKey={fxKey} error={error} />
  ),

  renderSolo({ snapshot, fx, fxKey, error, dispatch, transport, quit }) {
    const legal = transport.legalMoves(0);
    return (
      <SpiteTableScreen
        view={spiteTableView(snapshot, legal)}
        legal={legal}
        fx={fx}
        fxKey={fxKey}
        busy={snapshot.session.state.turn !== 0 || snapshot.session.status !== 'playing'}
        error={error}
        onPlay={(move: LegalMove) => dispatch(move.id, move.payload)}
        onQuit={quit}
      />
    );
  },

  soloReport({ snapshot, push }) {
    if (!snapshot.session.result) return null;
    return {
      id: `solo:spite:${snapshot.session.seed}`,
      game: 'spite',
      mode: snapshot.mode,
      result: snapshot.session.result,
      localSeat: 0,
      won: snapshot.winner === 0,
      seats: snapshot.players.map((player) => ({
        seat: player.seat,
        name: player.name,
        avatarId: player.avatarId,
        kind: player.isBot ? ('bot' as const) : ('friend' as const),
        key: player.isBot ? botKey(player.personaId ?? player.avatarId) : friendKey('local-player'),
      })),
      onPlayAgain: () => push('/spite/table'),
      onFinish: () => push('/match-end'),
    };
  },

  renderRoom({ session, snapshot, localSeat, error, dispatch, quit }) {
    const isLocalTurn = session.status === 'playing' && session.state.turn === localSeat;
    const legal: readonly LegalMove[] = isLocalTurn
      ? session.def.flow.legalMoves(session.state, session.phase)
      : [];
    const roomMode = spiteModeForRules(session.config);

    return (
      <SpiteTableScreen
        view={spiteTableView(
          {
            mode: roomMode,
            players: snapshot.seats.map((player) => ({
              seat: player.seat,
              name: player.name,
              avatarId: player.avatarId,
              isBot: player.bot,
            })),
            session,
            winner: session.state.winner,
          },
          legal,
          localSeat,
        )}
        legal={legal}
        fx={snapshot.fx}
        fxKey={snapshot.fxKey}
        busy={!isLocalTurn}
        error={error}
        onPlay={(move: LegalMove) => dispatch(move.id, move.payload)}
        onQuit={quit}
      />
    );
  },

  roomReport({ session, snapshot, localSeat }) {
    if (!session.result) return null;
    const roomMode = spiteModeForRules(session.config);
    return {
      id: roomMatchId(
        snapshot.room?.code,
        session.seed,
        session.lastAppliedHash ?? session.log.length,
      ),
      game: 'spite',
      mode: roomMode,
      result: session.result,
      localSeat,
      won: session.result.winner === localSeat,
      seats: snapshot.seats.map((seat) => ({
        seat: seat.seat,
        name: seat.name,
        avatarId: seat.avatarId,
        kind: 'friend' as const,
        key: friendKey(seat.profileId),
      })),
    };
  },
});
