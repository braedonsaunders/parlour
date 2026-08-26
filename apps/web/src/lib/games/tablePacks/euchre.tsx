'use client';

import type { LegalMove } from '@parlour/engine';
import type { EuchreRules, EuchreState, EuchreSuit } from '@parlour/game-euchre';
import { EuchreTableScreen } from '@/components/table/euchre/EuchreTableScreen';
import { defineTablePack, turnBasedDriver } from '@/components/table/GameTablePage';
import { euchreModeForRules } from '@/lib/euchre/modes';
import { euchreTableView, type EuchreTableView } from '@/lib/euchre/view';
import { roomMatchId } from '@/lib/table/useMatchReport';
import {
  EuchreTransport,
  type EuchreDispatch,
  type EuchreSnapshot,
} from '@/lib/solo/EuchreTransport';
import { botKey, friendKey } from '@/stores/history';
import { useProfileStore } from '@/stores/profile';
import { useEuchreSetupStore } from '@/stores/euchreSetup';

function matchWinnerTeamOf(session: {
  result: { rankings: readonly { seat: number; rank: number }[] } | null;
}): 0 | 1 | null {
  if (!session.result) return null;
  const rankOne = session.result.rankings.find((rank) => rank.rank === 1);
  return rankOne ? ((rankOne.seat % 2) as 0 | 1) : null;
}

export const euchreTablePack = defineTablePack<
  EuchreSnapshot,
  EuchreDispatch,
  EuchreTransport,
  EuchreState,
  EuchreRules
>({
  id: 'euchre',
  gameId: 'euchre',

  useSoloDeal() {
    const mode = useEuchreSetupStore((state) => state.mode);
    const botTier = useEuchreSetupStore((state) => state.botTier);
    const name = useProfileStore((state) => state.name);
    const avatarId = useProfileStore((state) => state.avatarId);
    return {
      create: () =>
        new EuchreTransport({ mode, seed: Date.now() | 0, player: { name, avatarId }, botTier }),
      deps: [avatarId, botTier, mode, name],
    };
  },

  useSoloDriver: turnBasedDriver({
    round: (snapshot) => snapshot.session,
    botPaceMs: (current) =>
      current.session.state.stage === 'playing'
        ? 480 + (current.session.phase.actor ?? 0) * 90
        : 320,
  }),

  renderPending: ({ fx, fxKey, error }) => (
    <EuchreTableScreen view={null} fx={fx} fxKey={fxKey} error={error} />
  ),

  renderSolo({ snapshot, fx, fxKey, error, dispatch, transport, quit }) {
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
        onQuit={quit}
      />
    );
  },

  soloReport({ snapshot, push }) {
    if (snapshot.matchWinnerTeam === null || !snapshot.session.result) return null;
    return {
      id: crypto.randomUUID(),
      game: 'euchre',
      mode: snapshot.mode,
      result: snapshot.session.result,
      localSeat: 0,
      // Team-aware: you won when your partnership reached the target first, and
      // the solo human always sits at seat 0.
      won: snapshot.matchWinnerTeam === 0,
      seats: snapshot.players.map((player) => ({
        seat: player.seat,
        name: player.name,
        avatarId: player.avatarId,
        kind: player.isBot ? ('bot' as const) : ('friend' as const),
        key: player.isBot ? botKey(player.avatarId) : friendKey('local-euchre-player'),
      })),
      onPlayAgain: () => push('/euchre/table'),
      onFinish: () => push('/match-end'),
    };
  },

  renderRoom({ session, snapshot, localSeat, error, dispatch, quit }) {
    const isLocalTurn = session.status === 'playing' && session.phase.actor === localSeat;
    const legal: readonly LegalMove[] = isLocalTurn
      ? session.def.flow.legalMoves(session.state, session.phase)
      : [];

    const view: EuchreTableView = euchreTableView(
      {
        mode: euchreModeForRules(session.config),
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
      <EuchreTableScreen
        view={view}
        fx={snapshot.fx}
        fxKey={snapshot.fxKey}
        busy={!isLocalTurn}
        error={error}
        onOrderUp={(alone) => dispatch('orderUp', { alone })}
        onCallTrump={(suit: EuchreSuit, alone) => dispatch('callTrump', { suit, alone })}
        onPass={() => dispatch('bidPass')}
        onDiscard={(card) => dispatch('dealerDiscard', { card })}
        onPlay={(card) => dispatch('playCard', { card })}
        onQuit={quit}
      />
    );
  },

  roomReport({ session, snapshot, localSeat }) {
    if (!session.result) return null;
    const localRank = session.result.rankings.find((rank) => rank.seat === localSeat)?.rank ?? 99;
    return {
      id: roomMatchId(
        snapshot.room?.code,
        session.seed,
        session.lastAppliedHash ?? session.log.length,
      ),
      game: 'euchre',
      mode: euchreModeForRules(session.config),
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
