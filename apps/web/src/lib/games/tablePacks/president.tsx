'use client';

import type { GameSession } from '@parlour/engine';
import type { PresidentRules, PresidentState } from '@parlour/game-president';
import { PresidentTableScreen } from '@/components/table/president/PresidentTableScreen';
import { defineTablePack, turnBasedDriver } from '@/components/table/GameTablePage';
import { presidentModeForRules } from '@/lib/president/modes';
import { presidentTableView } from '@/lib/president/view';
import { roomMatchId } from '@/lib/table/useMatchReport';
import {
  PresidentTransport,
  type PresidentDispatch,
  type PresidentSnapshot,
} from '@/lib/solo/PresidentTransport';
import { botKey, friendKey } from '@/stores/history';
import { useProfileStore } from '@/stores/profile';
import { presidentRulesFor, usePresidentSetupStore } from '@/stores/presidentSetup';

/** The rank parade runs past the usual beat before the podium takes over. */
const PODIUM_DELAY_MS = 1400;

function pickExchangeMove(
  session: GameSession<PresidentState, PresidentRules>,
  seat: number,
): string {
  if ((session.phase.actors ?? []).includes(seat) && session.phase.phase === 'exchange-give') {
    return 'giveCards';
  }
  return 'returnCards';
}

function localLegalMoves(snapshot: PresidentSnapshot) {
  const { session } = snapshot;
  if (session.status !== 'playing') return [];
  return (
    session.def.flow.legalMovesFor?.(session.state, session.phase, 0) ??
    session.def.flow.legalMoves(session.state, session.phase)
  );
}

export const presidentTablePack = defineTablePack<
  PresidentSnapshot,
  PresidentDispatch,
  PresidentTransport,
  PresidentState,
  PresidentRules
>({
  id: 'president',
  gameId: 'president',

  useSoloDeal() {
    const mode = usePresidentSetupStore((state) => state.mode);
    const seats = usePresidentSetupStore((state) => state.seats);
    const overrides = usePresidentSetupStore((state) => state.overrides);
    const botTier = usePresidentSetupStore((state) => state.botTier);
    const name = useProfileStore((state) => state.name);
    const avatarId = useProfileStore((state) => state.avatarId);
    return {
      create: () =>
        new PresidentTransport({
          mode,
          rules: presidentRulesFor(mode, overrides),
          seats,
          seed: Date.now() | 0,
          player: { name, avatarId },
          botTier,
        }),
      deps: [avatarId, botTier, mode, name, overrides, seats],
    };
  },

  useSoloDriver: turnBasedDriver({
    round: (snapshot) => snapshot.session,
  }),

  renderPending: ({ fx, fxKey, error }) => (
    <PresidentTableScreen view={null} fx={fx} fxKey={fxKey} error={error} />
  ),

  renderSolo({ snapshot, fx, fxKey, error, dispatch, quit }) {
    const actingLocally =
      snapshot.session.status === 'playing' &&
      ((snapshot.session.phase.actors ?? []).includes(0) || snapshot.session.phase.actor === 0);

    return (
      <PresidentTableScreen
        view={presidentTableView(snapshot, actingLocally ? localLegalMoves(snapshot) : [])}
        fx={fx}
        fxKey={fxKey}
        busy={!actingLocally}
        error={error}
        onConfirm={(cards) =>
          dispatch(
            snapshot.session.phase.phase === 'exchange-give' ||
              ((snapshot.session.phase.actors ?? []).includes(0) &&
                snapshot.session.phase.phase === 'exchange-give')
              ? 'giveCards'
              : snapshot.session.state.awaitingReturn?.seat === 0
                ? 'returnCards'
                : 'playSet',
            { cards },
          )
        }
        onPass={() => dispatch('pass')}
        onQuit={quit}
      />
    );
  },

  soloReport({ snapshot, push }) {
    if (snapshot.matchWinner === null || !snapshot.session.result) return null;
    return {
      id: crypto.randomUUID(),
      game: 'president',
      mode: snapshot.mode,
      result: snapshot.session.result,
      localSeat: 0,
      won: snapshot.matchWinner === 0,
      podiumDelayMs: PODIUM_DELAY_MS,
      seats: snapshot.players.map((player) => ({
        seat: player.seat,
        name: player.name,
        avatarId: player.avatarId,
        kind: player.isBot ? ('bot' as const) : ('friend' as const),
        key: player.isBot ? botKey(player.name.toLowerCase()) : friendKey('local-president-player'),
      })),
      onPlayAgain: () => push('/president/table'),
      onFinish: () => push('/match-end'),
    };
  },

  renderRoom({ session, snapshot, localSeat, error, dispatch, quit }) {
    const isLocalActing =
      session.status === 'playing' &&
      ((session.phase.actors ?? []).includes(localSeat) || session.phase.actor === localSeat);
    const legal = isLocalActing
      ? (session.def.flow.legalMovesFor?.(session.state, session.phase, localSeat) ?? [])
      : [];
    const snapshotView: PresidentSnapshot = {
      mode: presidentModeForRules(session.config as PresidentRules),
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
      <PresidentTableScreen
        view={presidentTableView(snapshotView, legal, localSeat)}
        fx={snapshot.fx}
        fxKey={snapshot.fxKey}
        busy={!isLocalActing}
        error={error}
        onConfirm={(cards) =>
          dispatch(
            session.phase.phase.startsWith('exchange')
              ? pickExchangeMove(session, localSeat)
              : 'playSet',
            { cards },
          )
        }
        onPass={() => dispatch('pass')}
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
      game: 'president',
      mode: presidentModeForRules(session.config as PresidentRules),
      result: session.result,
      localSeat,
      won: session.result.winner === localSeat,
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
