'use client';

import type { LegalMove } from '@parlour/engine';
import type { PinochleRules, PinochleState, PinochleSuit } from '@parlour/game-pinochle';
import { PinochleTableScreen } from '@/components/table/pinochle/PinochleTableScreen';
import { defineTablePack, turnBasedDriver } from '@/components/table/GameTablePage';
import { pinochleModeForRules } from '@/lib/pinochle/modes';
import { pinochleTableView, type PinochleTableView } from '@/lib/pinochle/view';
import { roomMatchId } from '@/lib/table/useMatchReport';
import {
  PinochleTransport,
  type PinochleDispatch,
  type PinochleSnapshot,
} from '@/lib/solo/PinochleTransport';
import { botKey, friendKey } from '@/stores/history';
import { useProfileStore } from '@/stores/profile';
import { usePinochleSetupStore } from '@/stores/pinochleSetup';

function matchWinnerTeamOf(session: {
  result: { rankings: readonly { seat: number; rank: number }[] } | null;
}): 0 | 1 | null {
  if (!session.result) return null;
  const rankOne = session.result.rankings.find((rank) => rank.rank === 1);
  return rankOne ? ((rankOne.seat % 2) as 0 | 1) : null;
}

export const pinochleTablePack = defineTablePack<
  PinochleSnapshot,
  PinochleDispatch,
  PinochleTransport,
  PinochleState,
  PinochleRules
>({
  id: 'pinochle',
  gameId: 'pinochle',

  useSoloDeal() {
    const mode = usePinochleSetupStore((state) => state.mode);
    const botTier = usePinochleSetupStore((state) => state.botTier);
    const name = useProfileStore((state) => state.name);
    const avatarId = useProfileStore((state) => state.avatarId);
    return {
      create: () =>
        new PinochleTransport({ mode, seed: Date.now() | 0, player: { name, avatarId }, botTier }),
      deps: [avatarId, botTier, mode, name],
    };
  },

  useSoloDriver: turnBasedDriver({
    round: (snapshot) => snapshot.session,
    botPaceMs: (current) =>
      current.session.state.stage === 'playing'
        ? 480 + (current.session.phase.actor ?? 0) * 90
        : 340,
  }),

  renderPending: ({ fx, fxKey, error }) => (
    <PinochleTableScreen view={null} fx={fx} fxKey={fxKey} error={error} />
  ),

  renderSolo({ snapshot, fx, fxKey, error, dispatch, transport, quit }) {
    const view = pinochleTableView(snapshot, transport.legalMoves());
    return (
      <PinochleTableScreen
        view={view}
        fx={fx}
        fxKey={fxKey}
        busy={view.decision === null}
        error={error}
        onBid={(bid) => dispatch('bid', { bid })}
        onPass={() => dispatch('pass')}
        onNameTrump={(suit: PinochleSuit) => dispatch('nameTrump', { suit })}
        onConfirmMeld={() => dispatch('confirmMeld')}
        onPlay={(card) => dispatch('playCard', { card })}
        onQuit={quit}
      />
    );
  },

  soloReport({ snapshot, push }) {
    if (snapshot.matchWinnerTeam === null || !snapshot.session.result) return null;
    return {
      id: crypto.randomUUID(),
      game: 'pinochle',
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
        key: player.isBot ? botKey(player.avatarId) : friendKey('local-pinochle-player'),
      })),
      onPlayAgain: () => push('/pinochle/table'),
      onFinish: () => push('/match-end'),
    };
  },

  renderRoom({ session, snapshot, localSeat, error, dispatch, quit }) {
    const isLocalTurn = session.status === 'playing' && session.phase.actor === localSeat;
    const isLocalMelding =
      session.status === 'playing' &&
      session.phase.actors !== undefined &&
      session.phase.actors.includes(localSeat);
    const legal: readonly LegalMove[] =
      isLocalTurn || isLocalMelding
        ? (session.def.flow.legalMovesFor?.(session.state, session.phase, localSeat) ?? [])
        : [];

    const view: PinochleTableView = pinochleTableView(
      {
        mode: pinochleModeForRules(session.config),
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
      <PinochleTableScreen
        view={view}
        fx={snapshot.fx}
        fxKey={snapshot.fxKey}
        busy={!isLocalTurn && !isLocalMelding}
        error={error}
        onBid={(bid) => dispatch('bid', { bid })}
        onPass={() => dispatch('pass')}
        onNameTrump={(suit: PinochleSuit) => dispatch('nameTrump', { suit })}
        onConfirmMeld={() => dispatch('confirmMeld')}
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
      game: 'pinochle',
      mode: pinochleModeForRules(session.config),
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
