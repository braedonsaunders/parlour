'use client';

import type { GinConfig, GinMatchState } from '@parlour/game-gin';
import { GinTableScreen } from '@/components/table/gin/GinTableScreen';
import { defineTablePack, turnBasedDriver } from '@/components/table/GameTablePage';
import type { GinModeId } from '@/lib/gin/modes';
import { ginTableView } from '@/lib/gin/view';
import { roomMatchId } from '@/lib/table/useMatchReport';
import { GinTransport, type GinDispatch, type GinSnapshot } from '@/lib/solo/GinTransport';
import { botKey, friendKey } from '@/stores/history';
import { useProfileStore } from '@/stores/profile';
import { useGinSetupStore } from '@/stores/ginSetup';

export const ginTablePack = defineTablePack<
  GinSnapshot,
  GinDispatch,
  GinTransport,
  GinMatchState,
  GinConfig
>({
  id: 'gin',
  gameId: 'gin',

  useSoloDeal() {
    const mode = useGinSetupStore((state) => state.mode);
    const botTier = useGinSetupStore((state) => state.botTier);
    const name = useProfileStore((state) => state.name);
    const avatarId = useProfileStore((state) => state.avatarId);
    return {
      create: () =>
        new GinTransport({ mode, botTier, seed: Date.now() | 0, player: { name, avatarId } }),
      deps: [avatarId, mode, botTier, name],
    };
  },

  useSoloDriver: turnBasedDriver({
    round: (snapshot) => snapshot.session,
  }),

  renderPending: ({ fx, fxKey, error }) => (
    <GinTableScreen view={null} fx={fx} fxKey={fxKey} error={error} />
  ),

  renderSolo({ snapshot, fx, fxKey, error, dispatch, transport, quit }) {
    return (
      <GinTableScreen
        view={ginTableView(snapshot, transport.legalMoves())}
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
        onQuit={quit}
      />
    );
  },

  soloReport({ snapshot, push }) {
    if (snapshot.matchWinner === null || !snapshot.session.result) return null;
    return {
      id: crypto.randomUUID(),
      game: 'gin',
      mode: snapshot.mode,
      result: snapshot.session.result,
      localSeat: 0,
      won: snapshot.matchWinner === 0,
      seats: snapshot.players.map((player) => ({
        seat: player.seat,
        name: player.name,
        avatarId: player.avatarId,
        kind: player.isBot ? ('bot' as const) : ('friend' as const),
        key: player.isBot ? botKey(player.avatarId) : friendKey('local-gin-player'),
      })),
      onPlayAgain: () => push('/gin/table'),
      onFinish: () => push('/match-end'),
    };
  },

  renderRoom({ session, snapshot, localSeat, error, dispatch, quit }) {
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
        error={error}
        onTakeUpcard={() => dispatch('option.take')}
        onPassUpcard={() => dispatch('option.pass')}
        onDraw={(source) => dispatch(source === 'stock' ? 'draw.stock' : 'draw.discard')}
        onDiscard={(card) => dispatch('discard', { card })}
        onKnock={() => dispatch('knock')}
        onReady={() => dispatch('ready')}
        onQuit={quit}
      />
    );
  },

  roomReport({ session, snapshot, localSeat }) {
    if (!session.result) return null;
    return {
      id: roomMatchId(
        snapshot.room?.code,
        session.seed,
        session.lastAppliedHash ?? session.log.length,
      ),
      game: 'gin',
      // Friend rooms currently seat one Gin rule set, so the ledger records the
      // mode the room actually played rather than the host's local pick.
      mode: 'classic',
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
