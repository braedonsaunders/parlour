'use client';

import type { MatchResult } from '@parlour/engine';
import type { CribbageConfig, CribbageState } from '@parlour/game-cribbage';
import { CribbageTableScreen } from '@/components/table/cribbage/CribbageTableScreen';
import { defineTablePack, turnBasedDriver } from '@/components/table/GameTablePage';
import { cribbageModeForRules } from '@/lib/cribbage/modes';
import { cribbageTableView, type CribbageSnapshotLike } from '@/lib/cribbage/view';
import { roomMatchId } from '@/lib/table/useMatchReport';
import {
  CribbageTransport,
  type CribbageDispatch,
  type CribbageSnapshot,
} from '@/lib/solo/CribbageTransport';
import { botKey, friendKey } from '@/stores/history';
import { useProfileStore } from '@/stores/profile';
import { cribbageRulesFor, useCribbageSetupStore } from '@/stores/cribbageSetup';

/** The last peg lands before the podium takes the table. */
const PODIUM_DELAY_MS = 950;

/**
 * A friend room plays a single game, so the podium's "wins" column is a flag
 * rather than a tally — without this every room match would read 0–0.
 */
function cribbageRoomResult(result: MatchResult): MatchResult {
  return {
    ...result,
    rankings: result.rankings.map((ranking) => ({
      ...ranking,
      detail: { ...ranking.detail, wins: ranking.rank === 1 ? 1 : 0 },
    })),
  };
}

export const cribbageTablePack = defineTablePack<
  CribbageSnapshot,
  CribbageDispatch,
  CribbageTransport,
  CribbageState,
  CribbageConfig
>({
  id: 'cribbage',
  gameId: 'cribbage',

  useSoloDeal() {
    const mode = useCribbageSetupStore((state) => state.mode);
    const botTier = useCribbageSetupStore((state) => state.botTier);
    const overrides = useCribbageSetupStore((state) => state.overrides);
    const name = useProfileStore((state) => state.name);
    const avatarId = useProfileStore((state) => state.avatarId);
    // The resolved rules are a fresh object every render, so a new deal is
    // keyed on their content rather than their identity.
    const rulesKey = JSON.stringify(cribbageRulesFor(mode, overrides));
    return {
      create: () =>
        new CribbageTransport({
          mode,
          botTier,
          seed: Date.now() | 0,
          player: { name, avatarId },
          rules: JSON.parse(rulesKey) as CribbageConfig,
        }),
      deps: [avatarId, botTier, mode, name, rulesKey],
    };
  },

  useSoloDriver: turnBasedDriver({
    round: (snapshot) => snapshot.match.round,
  }),

  renderPending: ({ fx, fxKey, error }) => (
    <CribbageTableScreen view={null} fx={fx} fxKey={fxKey} error={error} />
  ),

  renderSolo({ snapshot, fx, fxKey, error, dispatch, transport, quit }) {
    return (
      <CribbageTableScreen
        view={cribbageTableView(snapshot, transport.legalMoves(0), 0)}
        fx={fx}
        fxKey={fxKey}
        busy={!transport.humanCanAct()}
        error={error}
        onDiscard={(cards) => dispatch('crib.discard', { cards })}
        onCut={() => dispatch('cut')}
        onPlay={(card) => dispatch('playCard', { card })}
        onClaim={() => dispatch('claim')}
        onSteal={() => dispatch('steal')}
        onQuit={quit}
      />
    );
  },

  soloReport({ snapshot, push }) {
    const result = snapshot.match.result;
    if (!result) return null;
    return {
      id: `solo:cribbage:${snapshot.match.seed}:${snapshot.match.roundLogs.length}`,
      game: 'cribbage',
      mode: snapshot.mode,
      result,
      localSeat: 0,
      won: result.winner === 0,
      podiumDelayMs: PODIUM_DELAY_MS,
      seats: snapshot.players.map((player) => ({
        seat: player.seat,
        name: player.name,
        avatarId: player.avatarId,
        kind: player.isBot ? ('bot' as const) : ('friend' as const),
        key: player.isBot ? botKey(player.personaId) : 'local:self',
      })),
      onPlayAgain: () => push('/cribbage'),
      onFinish: () => push('/match-end'),
    };
  },

  renderRoom({ session, snapshot, localSeat, error, dispatch, quit }) {
    const legal =
      session.status === 'playing'
        ? (session.def.flow.legalMovesFor?.(session.state, session.phase, localSeat) ??
          (session.phase.actor === localSeat
            ? session.def.flow.legalMoves(session.state, session.phase)
            : []))
        : [];
    const winners =
      session.result?.rankings.filter((rank) => rank.rank === 1).map((rank) => rank.seat) ?? [];
    const renderSnapshot: CribbageSnapshotLike = {
      mode: cribbageModeForRules(session.config),
      players: snapshot.seats.map((seat) => ({
        seat: seat.seat,
        name: seat.name,
        avatarId: seat.avatarId,
        personaId: seat.profileId,
        isBot: seat.bot,
      })),
      match: {
        status: session.status === 'ended' ? 'ended' : 'playing',
        round: session,
        match: {
          wins: snapshot.seats.map((seat) => (winners.includes(seat.seat) ? 1 : 0)),
          targetWins: 1,
        },
      },
    };

    return (
      <CribbageTableScreen
        view={cribbageTableView(renderSnapshot, legal, localSeat)}
        fx={snapshot.fx}
        fxKey={snapshot.fxKey}
        busy={legal.length === 0}
        error={error}
        onDiscard={(cards) => dispatch('crib.discard', { cards })}
        onCut={() => dispatch('cut')}
        onPlay={(card) => dispatch('playCard', { card })}
        onClaim={() => dispatch('claim')}
        onSteal={() => dispatch('steal')}
        onQuit={quit}
      />
    );
  },

  roomReport({ session, snapshot, localSeat }) {
    if (!session.result) return null;
    const result = cribbageRoomResult(session.result);
    return {
      id: roomMatchId(
        snapshot.room?.code,
        session.seed,
        session.lastAppliedHash ?? session.log.length,
      ),
      game: 'cribbage',
      mode: cribbageModeForRules(session.config),
      result,
      localSeat,
      won: result.winner === localSeat,
      podiumDelayMs: PODIUM_DELAY_MS,
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
