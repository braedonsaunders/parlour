'use client';

import type { LegalMove } from '@parlour/engine';
import type { ScopaRules, ScopaState } from '@parlour/game-scopa';
import { ScopaTableScreen } from '@/components/table/scopa/ScopaTableScreen';
import { defineTablePack, turnBasedDriver } from '@/components/table/GameTablePage';
import { scopaModeForRules } from '@/lib/scopa/modes';
import { scopaTableView } from '@/lib/scopa/view';
import { roomMatchId } from '@/lib/table/useMatchReport';
import { ScopaTransport, type ScopaDispatch, type ScopaSnapshot } from '@/lib/solo/ScopaTransport';
import { botKey, friendKey } from '@/stores/history';
import { useProfileStore } from '@/stores/profile';
import { useScopaSetupStore } from '@/stores/scopaSetup';

export const scopaTablePack = defineTablePack<
  ScopaSnapshot,
  ScopaDispatch,
  ScopaTransport,
  ScopaState,
  ScopaRules
>({
  id: 'scopa',
  gameId: 'scopa',

  useSoloDeal() {
    const mode = useScopaSetupStore((state) => state.mode);
    const seats = useScopaSetupStore((state) => state.seats);
    const botTier = useScopaSetupStore((state) => state.botTier);
    const name = useProfileStore((state) => state.name);
    const avatarId = useProfileStore((state) => state.avatarId);
    return {
      create: () =>
        new ScopaTransport({
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
  }),

  renderPending: ({ fx, fxKey, error }) => (
    <ScopaTableScreen view={null} fx={fx} fxKey={fxKey} error={error} />
  ),

  renderSolo({ snapshot, fx, fxKey, error, dispatch, transport, quit }) {
    const legal = transport.legalMoves(0);
    return (
      <ScopaTableScreen
        view={scopaTableView(snapshot, legal)}
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
      id: `solo:scopa:${snapshot.session.seed}`,
      game: 'scopa',
      mode: snapshot.mode,
      result: snapshot.session.result,
      localSeat: 0,
      won: snapshot.session.result.winner === 0,
      seats: snapshot.players.map((player) => ({
        seat: player.seat,
        name: player.name,
        avatarId: player.avatarId,
        kind: player.isBot ? ('bot' as const) : ('friend' as const),
        key: player.isBot ? botKey(player.personaId ?? player.avatarId) : friendKey('local-player'),
      })),
      onPlayAgain: () => push('/scopa/table'),
      onFinish: () => push('/match-end'),
    };
  },

  renderRoom({ session, snapshot, localSeat, error, dispatch, quit }) {
    const isLocalTurn = session.status === 'playing' && session.state.turn === localSeat;
    const legal: readonly LegalMove[] = isLocalTurn
      ? session.def.flow.legalMoves(session.state, session.phase)
      : [];
    const roomMode = scopaModeForRules(session.config);

    return (
      <ScopaTableScreen
        view={scopaTableView(
          {
            mode: roomMode,
            players: snapshot.seats.map((player) => ({
              seat: player.seat,
              name: player.name,
              avatarId: player.avatarId,
              isBot: player.bot,
            })),
            session,
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
    const roomMode = scopaModeForRules(session.config);
    return {
      id: roomMatchId(
        snapshot.room?.code,
        session.seed,
        session.lastAppliedHash ?? session.log.length,
      ),
      game: 'scopa',
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
