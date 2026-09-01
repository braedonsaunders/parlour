'use client';

import type { EightsRules, EightsState, EightsSuit } from '@parlour/game-eights';
import { EightsTableScreen } from '@/components/table/eights/EightsTableScreen';
import { defineTablePack, turnBasedDriver } from '@/components/table/GameTablePage';
import { eightsModeForRules } from '@/lib/eights/modes';
import { eightsTableView } from '@/lib/eights/view';
import { roomMatchId } from '@/lib/table/useMatchReport';
import {
  EightsTransport,
  type EightsDispatch,
  type EightsSnapshot,
} from '@/lib/solo/EightsTransport';
import { botKey, friendKey } from '@/stores/history';
import { useProfileStore } from '@/stores/profile';
import { eightsRulesFor, useEightsSetupStore } from '@/stores/eightsSetup';

/** The scoresheet gets its beat before the podium takes the screen. */
const PODIUM_DELAY_MS = 1_200;

export const eightsTablePack = defineTablePack<
  EightsSnapshot,
  EightsDispatch,
  EightsTransport,
  EightsState,
  EightsRules
>({
  id: 'eights',
  gameId: 'eights',

  useSoloDeal() {
    const mode = useEightsSetupStore((state) => state.mode);
    const seats = useEightsSetupStore((state) => state.seats);
    const overrides = useEightsSetupStore((state) => state.overrides);
    const botTier = useEightsSetupStore((state) => state.botTier);
    const name = useProfileStore((state) => state.name);
    const avatarId = useProfileStore((state) => state.avatarId);
    // rulesKey stands in for the rules object so a fresh identity per render
    // does not re-deal the table.
    const rulesKey = JSON.stringify(eightsRulesFor(mode, overrides));
    return {
      create: () =>
        new EightsTransport({
          mode,
          seats,
          seed: Date.now() | 0,
          player: { name, avatarId },
          botTier,
          rules: JSON.parse(rulesKey) as EightsRules,
        }),
      deps: [avatarId, botTier, mode, name, seats, rulesKey],
    };
  },

  useSoloDriver: turnBasedDriver({
    round: (snapshot) => snapshot.session,
  }),

  renderPending: ({ fx, fxKey, error }) => (
    <EightsTableScreen view={null} fx={fx} fxKey={fxKey} error={error} />
  ),

  renderSolo({ snapshot, fx, fxKey, error, dispatch, transport, quit }) {
    const actingLocally =
      snapshot.session.status === 'playing' &&
      ((snapshot.session.phase.actors ?? []).includes(0) || snapshot.session.phase.actor === 0);

    return (
      <EightsTableScreen
        view={eightsTableView(snapshot, actingLocally ? transport.legalMoves() : [])}
        fx={fx}
        fxKey={fxKey}
        busy={!actingLocally}
        error={error}
        onPlay={(card) => dispatch('playCard', { card })}
        onDraw={() => dispatch('draw')}
        onPass={() => dispatch('pass')}
        onChooseSuit={(suit: EightsSuit) => dispatch('chooseSuit', { suit })}
        onReady={() => dispatch('ready')}
        onQuit={quit}
      />
    );
  },

  soloReport({ snapshot, push }) {
    if (snapshot.matchWinner === null || !snapshot.session.result) return null;
    return {
      id: crypto.randomUUID(),
      game: 'eights',
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
        key: player.isBot ? botKey(player.avatarId) : friendKey('local-eights-player'),
      })),
      onPlayAgain: () => push('/eights/table'),
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
    const roomSnapshot: EightsSnapshot = {
      mode: eightsModeForRules(session.config),
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
      <EightsTableScreen
        view={eightsTableView(roomSnapshot, legal, localSeat)}
        fx={snapshot.fx}
        fxKey={snapshot.fxKey}
        busy={!isLocalActing}
        error={error}
        onPlay={(card) => dispatch('playCard', { card })}
        onDraw={() => dispatch('draw')}
        onPass={() => dispatch('pass')}
        onChooseSuit={(suit: EightsSuit) => dispatch('chooseSuit', { suit })}
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
      game: 'eights',
      mode: eightsModeForRules(session.config),
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
