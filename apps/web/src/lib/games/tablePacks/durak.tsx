'use client';

import type { DurakRules, DurakState } from '@parlour/game-durak';
import { DurakTableScreen } from '@/components/table/durak/DurakTableScreen';
import { defineTablePack, turnBasedDriver } from '@/components/table/GameTablePage';
import { durakModeForRules } from '@/lib/durak/modes';
import { durakTableView } from '@/lib/durak/view';
import { roomMatchId } from '@/lib/table/useMatchReport';
import { DurakTransport, type DurakDispatch, type DurakSnapshot } from '@/lib/solo/DurakTransport';
import { botKey, friendKey } from '@/stores/history';
import { useProfileStore } from '@/stores/profile';
import { durakRulesFor, useDurakSetupStore } from '@/stores/durakSetup';

/** The scoresheet gets its beat before the podium takes the screen. */
const PODIUM_DELAY_MS = 1_200;

export const durakTablePack = defineTablePack<
  DurakSnapshot,
  DurakDispatch,
  DurakTransport,
  DurakState,
  DurakRules
>({
  id: 'durak',
  gameId: 'durak',

  useSoloDeal() {
    const mode = useDurakSetupStore((state) => state.mode);
    const seats = useDurakSetupStore((state) => state.seats);
    const overrides = useDurakSetupStore((state) => state.overrides);
    const botTier = useDurakSetupStore((state) => state.botTier);
    const name = useProfileStore((state) => state.name);
    const avatarId = useProfileStore((state) => state.avatarId);
    // rulesKey stands in for the rules object so a fresh identity per render
    // does not re-deal the table.
    const rulesKey = JSON.stringify(durakRulesFor(mode, overrides));
    return {
      create: () =>
        new DurakTransport({
          mode,
          seats,
          seed: Date.now() | 0,
          player: { name, avatarId },
          botTier,
          rules: JSON.parse(rulesKey) as DurakRules,
        }),
      deps: [avatarId, botTier, mode, name, seats, rulesKey],
    };
  },

  useSoloDriver: turnBasedDriver({
    round: (snapshot) => snapshot.session,
    // Ordinary attack/defend decisions keep human pace; a match already over
    // (podium waiting) needs no bot pacing at all.
    botPaceMs: (current) =>
      current.session.phase.phase === 'over' ? 200 : 420 + (current.session.phase.actor ?? 0) * 90,
  }),

  renderPending: ({ fx, fxKey, error }) => (
    <DurakTableScreen view={null} fx={fx} fxKey={fxKey} error={error} />
  ),

  renderSolo({ snapshot, fx, fxKey, error, dispatch, transport, quit }) {
    const actingLocally =
      snapshot.session.status === 'playing' &&
      ((snapshot.session.phase.actors ?? []).includes(0) || snapshot.session.phase.actor === 0);

    return (
      <DurakTableScreen
        view={durakTableView(snapshot, actingLocally ? transport.legalMoves() : [])}
        fx={fx}
        fxKey={fxKey}
        busy={!actingLocally}
        error={error}
        onAttack={(card) => dispatch('attack', { card })}
        onDefend={(attack, card) => dispatch('defend', { attack, card })}
        onTransfer={(card) => dispatch('transfer', { card })}
        onTakeCards={() => dispatch('takeCards')}
        onPass={() => dispatch('pass')}
        onQuit={quit}
      />
    );
  },

  soloReport({ snapshot, push }) {
    if (snapshot.matchWinner === null || !snapshot.session.result) return null;
    return {
      id: crypto.randomUUID(),
      game: 'durak',
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
        key: player.isBot ? botKey(player.avatarId) : friendKey('local-durak-player'),
      })),
      onPlayAgain: () => push('/durak/table'),
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
    const roomSnapshot: DurakSnapshot = {
      mode: durakModeForRules(session.config),
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
      <DurakTableScreen
        view={durakTableView(roomSnapshot, legal, localSeat)}
        fx={snapshot.fx}
        fxKey={snapshot.fxKey}
        busy={!isLocalActing}
        error={error}
        onAttack={(card) => dispatch('attack', { card })}
        onDefend={(attack, card) => dispatch('defend', { attack, card })}
        onTransfer={(card) => dispatch('transfer', { card })}
        onTakeCards={() => dispatch('takeCards')}
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
      game: 'durak',
      mode: durakModeForRules(session.config),
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
