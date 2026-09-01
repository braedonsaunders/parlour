'use client';

import type { LegalMove } from '@parlour/engine';
import type { PokerRules, PokerState } from '@parlour/game-poker';
import { PokerTableScreen } from '@/components/table/poker/PokerTableScreen';
import { defineTablePack, turnBasedDriver } from '@/components/table/GameTablePage';
import { pokerModeForRules } from '@/lib/poker/modes';
import { pokerTableView, type PokerTableView } from '@/lib/poker/view';
import { roomMatchId } from '@/lib/table/useMatchReport';
import { PokerTransport, type PokerDispatch, type PokerSnapshot } from '@/lib/solo/PokerTransport';
import { botKey, friendKey } from '@/stores/history';
import { useProfileStore } from '@/stores/profile';
import { usePokerSetupStore } from '@/stores/pokerSetup';

export const pokerTablePack = defineTablePack<
  PokerSnapshot,
  PokerDispatch,
  PokerTransport,
  PokerState,
  PokerRules
>({
  id: 'poker',
  gameId: 'poker',

  useSoloDeal() {
    const mode = usePokerSetupStore((state) => state.mode);
    const botTier = usePokerSetupStore((state) => state.botTier);
    const seats = usePokerSetupStore((state) => state.seats);
    const name = useProfileStore((state) => state.name);
    const avatarId = useProfileStore((state) => state.avatarId);
    return {
      create: () =>
        new PokerTransport({
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
    round: (snapshot) => snapshot.session,
  }),

  renderPending: ({ fx, fxKey, error }) => (
    <PokerTableScreen view={null} fx={fx} fxKey={fxKey} error={error} />
  ),

  renderSolo({ snapshot, fx, fxKey, error, dispatch, transport, quit }) {
    const view = pokerTableView(snapshot, transport.legalMoves());
    return (
      <PokerTableScreen
        view={view}
        fx={fx}
        fxKey={fxKey}
        busy={view.action === null}
        error={error}
        onFold={() => dispatch('fold')}
        onCheck={() => dispatch('check')}
        onCall={() => dispatch('call')}
        onBet={(to) => dispatch('bet', { to })}
        onRaise={(to) => dispatch('raise', { to })}
        onQuit={quit}
      />
    );
  },

  soloReport({ snapshot, push }) {
    if (!snapshot.session.result) return null;
    return {
      id: crypto.randomUUID(),
      game: 'poker',
      mode: snapshot.mode,
      result: snapshot.session.result,
      localSeat: 0,
      won: snapshot.won === true,
      seats: snapshot.players.map((player) => ({
        seat: player.seat,
        name: player.name,
        avatarId: player.avatarId,
        kind: player.isBot ? ('bot' as const) : ('friend' as const),
        key: player.isBot ? botKey(player.avatarId) : friendKey('local-poker-player'),
      })),
      onPlayAgain: () => push('/poker/table'),
      onFinish: () => push('/match-end'),
    };
  },

  renderRoom({ session, snapshot, localSeat, error, dispatch, quit }) {
    const isLocalTurn = session.status === 'playing' && session.phase.actor === localSeat;
    const legal: readonly LegalMove[] = isLocalTurn
      ? session.def.flow.legalMoves(session.state, session.phase)
      : [];

    const view: PokerTableView = pokerTableView(
      {
        mode: pokerModeForRules(session.config),
        players: snapshot.seats.map((player) => ({
          seat: player.seat,
          name: player.name,
          avatarId: player.avatarId,
          isBot: player.bot,
        })),
        session,
        won: session.result === null ? null : session.result.winner === localSeat,
      },
      legal,
      localSeat,
    );

    return (
      <PokerTableScreen
        view={view}
        fx={snapshot.fx}
        fxKey={snapshot.fxKey}
        busy={!isLocalTurn}
        error={error}
        onFold={() => dispatch('fold')}
        onCheck={() => dispatch('check')}
        onCall={() => dispatch('call')}
        onBet={(to) => dispatch('bet', { to })}
        onRaise={(to) => dispatch('raise', { to })}
        onQuit={quit}
      />
    );
  },

  roomReport({ session, snapshot, localSeat }) {
    if (!session.result) return null;
    const mode = pokerModeForRules(session.config);
    const localRank = session.result.rankings.find((rank) => rank.seat === localSeat)?.rank ?? 99;
    return {
      id: roomMatchId(
        snapshot.room?.code,
        session.seed,
        session.lastAppliedHash ?? session.log.length,
      ),
      game: 'poker',
      mode,
      result: session.result,
      localSeat,
      won: localRank === 1,
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
