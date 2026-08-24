'use client';

import type { LegalMove } from '@parlour/engine';
import type { SpadesRules, SpadesState } from '@parlour/game-spades';
import { SpadesTableScreen } from '@/components/table/spades/SpadesTableScreen';
import { defineTablePack, turnBasedDriver } from '@/components/table/GameTablePage';
import { spadesModeForRules } from '@/lib/spades/modes';
import { spadesTableView, type SpadesTableView } from '@/lib/spades/view';
import { roomMatchId } from '@/lib/table/useMatchReport';
import {
  SpadesTransport,
  type SpadesDispatch,
  type SpadesSnapshot,
} from '@/lib/solo/SpadesTransport';
import { botKey, friendKey } from '@/stores/history';
import { useProfileStore } from '@/stores/profile';
import { useSpadesSetupStore } from '@/stores/spadesSetup';

function matchWinnerTeamOf(session: {
  result: { rankings: readonly { seat: number; rank: number }[] } | null;
}): 0 | 1 | null {
  if (!session.result) return null;
  const rankOne = session.result.rankings.find((rank) => rank.rank === 1);
  return rankOne ? ((rankOne.seat % 2) as 0 | 1) : null;
}

export const spadesTablePack = defineTablePack<
  SpadesSnapshot,
  SpadesDispatch,
  SpadesTransport,
  SpadesState,
  SpadesRules
>({
  id: 'spades',
  gameId: 'spades',

  useSoloDeal() {
    const mode = useSpadesSetupStore((state) => state.mode);
    const botTier = useSpadesSetupStore((state) => state.botTier);
    const name = useProfileStore((state) => state.name);
    const avatarId = useProfileStore((state) => state.avatarId);
    return {
      create: () =>
        new SpadesTransport({ mode, seed: Date.now() | 0, player: { name, avatarId }, botTier }),
      deps: [avatarId, botTier, mode, name],
    };
  },

  useSoloDriver: turnBasedDriver({
    round: (snapshot) => snapshot.session,
    // Bidding is a conversation; trick play keeps a human beat.
    botPaceMs: (current) =>
      current.session.state.stage === 'bidding'
        ? 520
        : 420 + (current.session.phase.actor ?? 0) * 70,
  }),

  renderPending: ({ fx, fxKey, error }) => (
    <SpadesTableScreen view={null} fx={fx} fxKey={fxKey} error={error} />
  ),

  renderSolo({ snapshot, fx, fxKey, error, dispatch, transport, quit }) {
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
        onQuit={quit}
      />
    );
  },

  soloReport({ snapshot, push }) {
    if (snapshot.matchWinnerTeam === null || !snapshot.session.result) return null;
    return {
      id: crypto.randomUUID(),
      game: 'spades',
      mode: snapshot.mode,
      result: snapshot.session.result,
      localSeat: 0,
      won: snapshot.matchWinnerTeam === 0,
      seats: snapshot.players.map((player) => ({
        seat: player.seat,
        name: player.name,
        avatarId: player.avatarId,
        kind: player.isBot ? ('bot' as const) : ('friend' as const),
        key: player.isBot ? botKey(player.avatarId) : friendKey('local-spades-player'),
      })),
      onPlayAgain: () => push('/spades/table'),
      onFinish: () => push('/match-end'),
    };
  },

  renderRoom({ session, snapshot, localSeat, error, dispatch, quit }) {
    const isLocalTurn = session.status === 'playing' && session.phase.actor === localSeat;
    const legal: readonly LegalMove[] = isLocalTurn
      ? session.def.flow.legalMoves(session.state, session.phase)
      : [];

    const view: SpadesTableView = spadesTableView(
      {
        mode: spadesModeForRules(session.config),
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
        error={error}
        onBid={(bid) => dispatch('bid', { bid })}
        onBidNil={() => dispatch('bidNil')}
        onPlay={(card) => dispatch('playCard', { card })}
        onQuit={quit}
      />
    );
  },

  roomReport({ session, snapshot, localSeat, leave, push }) {
    if (!session.result) return null;
    const mode = spadesModeForRules(session.config);
    const localRank = session.result.rankings.find((rank) => rank.seat === localSeat)?.rank ?? 99;
    return {
      id: roomMatchId(
        snapshot.room?.code,
        session.seed,
        session.lastAppliedHash ?? session.log.length,
      ),
      game: 'spades',
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
      onPlayAgain: () => {
        // The new room is built from the setup store, so a rematch has to carry
        // the mode this match was actually played under. Without this a guest
        // who joined a Quick or Clean Books table would silently host Classic.
        useSpadesSetupStore.getState().setMode(mode);
        push('/spades/create');
      },
      onFinish: () => leave(() => push('/match-end')),
    };
  },
});
