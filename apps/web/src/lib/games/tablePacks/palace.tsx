'use client';

import type { PalaceRules, PalaceState } from '@parlour/game-palace';
import { PalaceTableScreen } from '@/components/table/palace/PalaceTableScreen';
import { defineTablePack, turnBasedDriver } from '@/components/table/GameTablePage';
import { palaceModeForRules } from '@/lib/palace/modes';
import { palaceTableView } from '@/lib/palace/view';
import { roomMatchId } from '@/lib/table/useMatchReport';
import {
  PalaceTransport,
  type PalaceDispatch,
  type PalaceSnapshot,
} from '@/lib/solo/PalaceTransport';
import { botKey, friendKey } from '@/stores/history';
import { useProfileStore } from '@/stores/profile';
import { palaceRulesFor, usePalaceSetupStore } from '@/stores/palaceSetup';

/** The scoresheet gets its beat before the podium takes the screen. */
const PODIUM_DELAY_MS = 1_200;

export const palaceTablePack = defineTablePack<
  PalaceSnapshot,
  PalaceDispatch,
  PalaceTransport,
  PalaceState,
  PalaceRules
>({
  id: 'palace',
  gameId: 'palace',

  useSoloDeal() {
    const mode = usePalaceSetupStore((state) => state.mode);
    const seats = usePalaceSetupStore((state) => state.seats);
    const overrides = usePalaceSetupStore((state) => state.overrides);
    const botTier = usePalaceSetupStore((state) => state.botTier);
    const name = useProfileStore((state) => state.name);
    const avatarId = useProfileStore((state) => state.avatarId);
    // rulesKey stands in for the rules object so a fresh identity per render
    // does not re-deal the table.
    const rulesKey = JSON.stringify(palaceRulesFor(mode, overrides));
    return {
      create: () =>
        new PalaceTransport({
          mode,
          seats,
          seed: Date.now() | 0,
          player: { name, avatarId },
          botTier,
          rules: JSON.parse(rulesKey) as PalaceRules,
        }),
      deps: [avatarId, botTier, mode, name, seats, rulesKey],
    };
  },

  useSoloDriver: turnBasedDriver({
    round: (snapshot) => snapshot.session,
    // Ordinary turns keep human pace; the swap phase moves briskly.
    botPaceMs: (current) =>
      current.session.phase.phase === 'play' ? 460 + (current.session.phase.actor ?? 0) * 90 : 220,
  }),

  renderPending: ({ fx, fxKey, error }) => (
    <PalaceTableScreen view={null} fx={fx} fxKey={fxKey} error={error} />
  ),

  renderSolo({ snapshot, fx, fxKey, error, dispatch, transport, quit }) {
    const actingLocally =
      snapshot.session.status === 'playing' &&
      ((snapshot.session.phase.actors ?? []).includes(0) || snapshot.session.phase.actor === 0);

    return (
      <PalaceTableScreen
        view={palaceTableView(snapshot, actingLocally ? transport.legalMoves() : [])}
        fx={fx}
        fxKey={fxKey}
        busy={!actingLocally}
        error={error}
        onSwap={(pairs) => dispatch('swap', { pairs })}
        onReady={() => dispatch('ready')}
        onPlay={(cards) => dispatch('playCards', { cards })}
        onPickup={() => dispatch('pickup')}
        onPlayDown={(slot) => dispatch('playDown', { slot })}
        onQuit={quit}
      />
    );
  },

  soloReport({ snapshot, push }) {
    if (snapshot.matchWinner === null || !snapshot.session.result) return null;
    return {
      id: crypto.randomUUID(),
      game: 'palace',
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
        key: player.isBot ? botKey(player.avatarId) : friendKey('local-palace-player'),
      })),
      onPlayAgain: () => push('/palace/table'),
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
    const roomSnapshot: PalaceSnapshot = {
      mode: palaceModeForRules(session.config),
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
      <PalaceTableScreen
        view={palaceTableView(roomSnapshot, legal, localSeat)}
        fx={snapshot.fx}
        fxKey={snapshot.fxKey}
        busy={!isLocalActing}
        error={error}
        onSwap={(pairs) => dispatch('swap', { pairs })}
        onReady={() => dispatch('ready')}
        onPlay={(cards) => dispatch('playCards', { cards })}
        onPickup={() => dispatch('pickup')}
        onPlayDown={(slot) => dispatch('playDown', { slot })}
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
      game: 'palace',
      mode: palaceModeForRules(session.config),
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
