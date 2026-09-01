'use client';

import { useEffect, useRef, useState } from 'react';
import type { FxEvent } from '@parlour/engine';
import { SLAP_GRACE_MS, type RatscrewConfig, type RatscrewState } from '@parlour/game-ratscrew';
import { RatscrewTableScreen } from '@/components/table/ratscrew/RatscrewTableScreen';
import {
  defineTablePack,
  type RoomTableContext,
  type SoloDriver,
} from '@/components/table/GameTablePage';
import { ratscrewModeForRules } from '@/lib/ratscrew/modes';
import { ratscrewTableView } from '@/lib/ratscrew/view';
import { roomMatchId } from '@/lib/table/useMatchReport';
import {
  RatscrewTransport,
  type RatscrewDispatch,
  type RatscrewSnapshot,
} from '@/lib/solo/RatscrewTransport';
import { botKey, friendKey } from '@/stores/history';
import { useProfileStore } from '@/stores/profile';
import { ratscrewRulesFor, useRatscrewSetupStore } from '@/stores/ratscrewSetup';

/**
 * Rat Screw's solo driver.
 *
 * The shared turn-based driver waits for a bot's turn and paces it against the
 * fx timeline. Rat Screw has neither: flips and slaps land on the transport's
 * own real-time clock, so this subscribes to the transport and re-renders from
 * whatever it pushes. The `fxKey` bump on each drained batch is what makes the
 * slap flash replay rather than freeze.
 */
const useRatscrewDriver: SoloDriver<RatscrewTransport, RatscrewSnapshot, RatscrewDispatch> = (
  transport,
) => {
  const [, setTick] = useState(0);
  const [fx, setFx] = useState<readonly FxEvent[]>(
    () => transport.getSnapshot().session.setupFx ?? [],
  );
  const [fxKey, setFxKey] = useState(0);

  useEffect(
    () =>
      transport.subscribe(() => {
        const batch = transport.drainRecentFx();
        setTick((tick) => tick + 1);
        if (batch.length > 0) {
          setFx(batch);
          setFxKey((key) => key + 1);
        }
      }),
    [transport],
  );

  return {
    snapshot: transport.getSnapshot(),
    fx,
    fxKey,
    error: null,
    dispatch: (move, payload) => transport.dispatch(move, payload),
    accept: () => {},
  };
};

/**
 * Host duty: keep slap windows honest by injecting the authoritative close.
 *
 * Only the host arms it, so a dead race always resumes play exactly as it does
 * solo. A new host re-arms from its own copy of this effect after a migration.
 */
function useSlapWindowCloser(ctx: RoomTableContext<RatscrewState, RatscrewConfig> | null): void {
  const armedClose = useRef<string | null>(null);
  const closeTimer = useRef<number | null>(null);
  const room = ctx?.room;
  const session = ctx?.session;
  const isHost = ctx?.snapshot.isHost ?? false;

  useEffect(() => {
    if (!room || !isHost || !session?.state.window || session.status !== 'playing') {
      armedClose.current = null;
      return;
    }
    const windowKey = `${session.log.length}:${session.state.window.pattern}`;
    if (armedClose.current === windowKey) return;
    armedClose.current = windowKey;
    if (closeTimer.current !== null) window.clearTimeout(closeTimer.current);
    closeTimer.current = window.setTimeout(() => {
      try {
        room.inject('windowClose');
      } catch {
        // room closing mid-race; the new host re-arms from its own effect
      }
    }, session.state.rules.slapWindowMs + SLAP_GRACE_MS);
    return () => {
      if (closeTimer.current !== null) {
        window.clearTimeout(closeTimer.current);
        closeTimer.current = null;
      }
    };
  }, [isHost, room, session]);
}

export const ratscrewTablePack = defineTablePack<
  RatscrewSnapshot,
  RatscrewDispatch,
  RatscrewTransport,
  RatscrewState,
  RatscrewConfig
>({
  id: 'ratscrew',
  gameId: 'ratscrew',
  pacing: 'realtime',

  useSoloDeal() {
    const mode = useRatscrewSetupStore((state) => state.mode);
    const seats = useRatscrewSetupStore((state) => state.seats);
    const overrides = useRatscrewSetupStore((state) => state.overrides);
    const botTier = useRatscrewSetupStore((state) => state.botTier);
    const name = useProfileStore((state) => state.name);
    const avatarId = useProfileStore((state) => state.avatarId);
    // rulesKey stands in for the rules object so a fresh identity per render
    // does not re-deal the table.
    const rulesKey = JSON.stringify(ratscrewRulesFor(mode, overrides));
    return {
      create: () =>
        new RatscrewTransport({
          seats,
          seed: Date.now() | 0,
          rules: JSON.parse(rulesKey) as ReturnType<typeof ratscrewRulesFor>,
          player: { name, avatarId },
          botTier,
        }),
      deps: [avatarId, botTier, name, seats, rulesKey],
      destroy: (transport: RatscrewTransport) => transport.dispose(),
    };
  },

  useSoloDriver: useRatscrewDriver,
  useRoomEffects: useSlapWindowCloser,

  renderPending: ({ fx, fxKey, error }) => (
    <RatscrewTableScreen view={null} fx={fx} fxKey={fxKey} error={error} />
  ),

  renderSolo({ snapshot, fx, fxKey, transport, quit }) {
    return (
      <RatscrewTableScreen
        view={ratscrewTableView(snapshot, transport.legalMoves())}
        fx={fx}
        fxKey={fxKey}
        busy={false}
        error={null}
        onFlip={() => transport.dispatch('flip')}
        onSlap={() => transport.dispatch('slap')}
        onQuit={() => {
          transport.dispose();
          quit();
        }}
      />
    );
  },

  soloReport({ snapshot, push }) {
    if (!snapshot.session.result) return null;
    const mode = ratscrewModeForRules(snapshot.session.config);
    return {
      id: crypto.randomUUID(),
      game: 'ratscrew',
      mode,
      result: snapshot.session.result,
      localSeat: 0,
      won: snapshot.matchWinner === 0,
      seats: snapshot.players.map((player) => ({
        seat: player.seat,
        name: player.name,
        avatarId: player.avatarId,
        kind: player.isBot ? ('bot' as const) : ('friend' as const),
        key: player.isBot ? botKey(player.avatarId) : friendKey('local-ratscrew-player'),
      })),
      onPlayAgain: () => push('/ratscrew/table'),
      onFinish: () => push('/match-end'),
    };
  },

  renderRoom({ session, snapshot, localSeat, error, dispatch, quit }) {
    const playing = session.status === 'playing';
    const legal = playing
      ? (session.def.flow.legalMovesFor?.(session.state, session.phase, localSeat) ?? [])
      : [];
    const partial: RatscrewSnapshot = {
      players: snapshot.seats.map((player) => ({
        seat: player.seat,
        name: player.name,
        avatarId: player.avatarId,
        isBot: player.bot,
      })),
      session,
      mode: ratscrewModeForRules(session.config),
      matchWinner: session.result?.winner ?? null,
    };

    return (
      <RatscrewTableScreen
        view={ratscrewTableView(partial, legal, localSeat)}
        fx={snapshot.fx}
        fxKey={snapshot.fxKey}
        busy={false}
        error={error}
        onFlip={() => dispatch('flip')}
        onSlap={() => dispatch('slap')}
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
      game: 'ratscrew',
      mode: ratscrewModeForRules(session.config),
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
