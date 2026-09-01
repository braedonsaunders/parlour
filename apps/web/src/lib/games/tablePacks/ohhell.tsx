'use client';

import type { OhHellRules, OhHellState } from '@parlour/game-ohhell';
import { OhHellTableScreen } from '@/components/table/ohhell/OhHellTableScreen';
import { defineTablePack, turnBasedDriver } from '@/components/table/GameTablePage';
import { ohhellModeForRules } from '@/lib/ohhell/modes';
import { ohhellTableView } from '@/lib/ohhell/view';
import { roomMatchId } from '@/lib/table/useMatchReport';
import {
  OhHellTransport,
  type OhHellDispatch,
  type OhHellSnapshot,
} from '@/lib/solo/OhHellTransport';
import { botKey, friendKey } from '@/stores/history';
import { useProfileStore } from '@/stores/profile';
import { useOhHellSetupStore } from '@/stores/ohhellSetup';

export const ohhellTablePack = defineTablePack<
  OhHellSnapshot,
  OhHellDispatch,
  OhHellTransport,
  OhHellState,
  OhHellRules
>({
  id: 'ohhell',
  gameId: 'ohhell',

  useSoloDeal() {
    const mode = useOhHellSetupStore((state) => state.mode);
    const seats = useOhHellSetupStore((state) => state.seats);
    const botTier = useOhHellSetupStore((state) => state.botTier);
    const name = useProfileStore((state) => state.name);
    const avatarId = useProfileStore((state) => state.avatarId);
    return {
      create: () =>
        new OhHellTransport({
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
    round: (current) => current.hand,
    fxFor: (outcome) =>
      outcome.fx.length > 0 ? outcome.fx : (outcome.snapshot.hand.setupFx ?? []),
  }),

  renderPending: ({ fx, fxKey, error }) => (
    <OhHellTableScreen view={null} fx={fx} fxKey={fxKey} error={error} />
  ),

  renderSolo({ snapshot, fx, fxKey, error, dispatch, accept, transport, quit }) {
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
        onQuit={quit}
      />
    );
  },

  soloReport({ snapshot, push }) {
    if (!snapshot.matchResult) return null;
    return {
      id: `solo:ohhell:${snapshot.hand.seed}`,
      game: 'ohhell',
      mode: snapshot.mode,
      result: snapshot.matchResult,
      localSeat: 0,
      won: snapshot.matchWinner === 0,
      seats: snapshot.players.map((player) => ({
        seat: player.seat,
        name: player.name,
        avatarId: player.avatarId,
        kind: player.isBot ? ('bot' as const) : ('friend' as const),
        key: player.isBot ? botKey(player.personaId ?? player.avatarId) : friendKey('local-player'),
      })),
      onPlayAgain: () => push('/ohhell/table'),
      onFinish: () => push('/match-end'),
    };
  },

  renderRoom({ session, snapshot, localSeat, error, dispatch, quit }) {
    const isLocalTurn = session.status === 'playing' && session.phase.actor === localSeat;
    const legal = isLocalTurn
      ? (session.def.flow.legalMovesFor?.(session.state, session.phase, localSeat) ??
        session.def.flow.legalMoves(session.state, session.phase))
      : [];
    const roomMode = ohhellModeForRules(session.config);

    /*
     * A friend room is one flat `GameSession`, not a match, so there is no
     * cumulative score and no next round. The view wants a match-shaped
     * snapshot, so the room supplies a one-round match: round 1 of 1.
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
        error={error}
        onBid={(bid) => dispatch('bid', { bid })}
        onChooseTrump={(suit) => dispatch('chooseTrump', { suit })}
        onPlay={(card) => dispatch('playCard', { card })}
        onQuit={quit}
      />
    );
  },

  roomReport({ session, snapshot, localSeat }) {
    if (!session.result) return null;
    const roomMode = ohhellModeForRules(session.config);
    return {
      id: roomMatchId(
        snapshot.room?.code,
        session.seed,
        session.lastAppliedHash ?? session.log.length,
      ),
      game: 'ohhell',
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
