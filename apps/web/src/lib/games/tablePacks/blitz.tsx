'use client';

import { useEffect } from 'react';
import { Fx, isActingSeat, type FxEvent, type MatchResult } from '@parlour/engine';
import type { BlitzConfig, BlitzState } from '@parlour/game-blitz';
import { RoundEndOverlay } from '@/components/celebration/RoundEndOverlay';
import { TableScreen, type TableView } from '@/components/table/TableScreen';
import {
  defineTablePack,
  type SoloDriver,
  type SoloTableContext,
} from '@/components/table/GameTablePage';
import { roomMatchId } from '@/lib/table/useMatchReport';
import { LocalTransport, type LocalDispatch, type SoloSnapshot } from '@/lib/solo/LocalTransport';
import { botKey, friendKey } from '@/stores/history';
import { useProfileStore } from '@/stores/profile';
import { useSetupStore } from '@/stores/setup';
import { useSoloTable } from '@/lib/table/useSoloTable';

type BlitzSoloContext = SoloTableContext<LocalTransport, SoloSnapshot, LocalDispatch>;

/**
 * Accumulates a whole round's fx for the round-end overlay.
 *
 * The shared driver only keeps the last move. The overlay replays the deal
 * through the last chip, so each transport keeps its own timeline here.
 */
const roundTimelines = new WeakMap<LocalTransport, readonly FxEvent[]>();

function rememberRoundFx(transport: LocalTransport, outcome: LocalDispatch): void {
  const current = roundTimelines.get(transport) ?? transport.getSnapshot().session.setupFx ?? [];
  const next =
    outcome.events.length === 0 && outcome.fx.some((event) => event.kind === Fx.DealCard)
      ? outcome.fx
      : [...current, ...outcome.fx];
  roundTimelines.set(transport, next);
}

const useBlitzDriver: SoloDriver<LocalTransport, SoloSnapshot, LocalDispatch> = (transport) => {
  if (!roundTimelines.has(transport)) {
    roundTimelines.set(transport, transport.getSnapshot().session.setupFx ?? []);
  }
  return useSoloTable(transport, {
    round: (current) => current.session,
    botPaceMs: (current) =>
      current.mode === 'timed' ? 120 : 480 + (current.session.phase.actor ?? 0) * 90,
    onAccepted: (outcome) => rememberRoundFx(transport, outcome),
  });
};

/** Timed mode: the match clock, and a legal move if the human's seven seconds run out. */
function useBlitzClocks({ snapshot, transport, accept, setSnapshot }: BlitzSoloContext): void {
  useEffect(() => {
    if (snapshot.mode !== 'timed' || snapshot.matchWinner !== null || !setSnapshot) return;
    const timer = window.setInterval(() => {
      const next = transport.tick(Date.now());
      if (next.matchWinner !== snapshot.matchWinner) setSnapshot(next);
    }, 250);
    return () => window.clearInterval(timer);
  }, [setSnapshot, snapshot.matchWinner, snapshot.mode, transport]);

  useEffect(() => {
    if (
      snapshot.mode !== 'timed' ||
      snapshot.session.status !== 'playing' ||
      snapshot.session.phase.actor !== 0
    ) {
      return;
    }
    const timer = window.setTimeout(() => {
      const legal = transport.legalMoves();
      const automatic = legal.find((move) => move.id === 'draw.stock') ?? legal[0];
      if (automatic) accept(transport.dispatch(automatic.id, automatic.payload));
    }, 7_000);
    return () => window.clearTimeout(timer);
  }, [
    accept,
    snapshot.mode,
    snapshot.session.log.length,
    snapshot.session.phase.actor,
    snapshot.session.status,
    transport,
  ]);
}

function soloTableView(snapshot: SoloSnapshot, transport: LocalTransport): TableView {
  const state = snapshot.session.state;
  const isHumanTurn = snapshot.session.status === 'playing' && snapshot.session.phase.actor === 0;
  const legal = isHumanTurn ? transport.legalMoves() : [];
  const moveIds = new Set(legal.map(({ id }) => id));
  const discardCards = legal.flatMap((move) =>
    move.id === 'discard' &&
    typeof (move.payload as { card?: unknown } | undefined)?.card === 'string'
      ? [(move.payload as { card: string }).card]
      : [],
  );
  const scores = snapshot.mode === 'classic' ? snapshot.lives : snapshot.wins;
  const scoreLabel = snapshot.mode === 'classic' ? 'lives' : 'wins';
  return {
    players: snapshot.players.map((player) => {
      const eliminated = snapshot.mode === 'classic' && snapshot.lives[player.seat] === 0;
      return {
        ...player,
        hand: eliminated ? [] : (state.hands[player.seat] ?? []),
        handCount: eliminated ? 0 : (state.hands[player.seat]?.length ?? 0),
        lives: scores[player.seat] ?? 0,
        isLocal: player.seat === 0,
        eliminated,
      };
    }),
    activeSeat: snapshot.session.phase.actor,
    stockCount: state.stock.length,
    discard: state.discard,
    phaseLabel: `${snapshot.mode} · round ${snapshot.round} · ${scoreLabel}`,
    legal: {
      drawStock: moveIds.has('draw.stock'),
      drawDiscard: moveIds.has('draw.discard'),
      discardCards,
      knock: moveIds.has('knock'),
    },
  };
}

function roomTableView(
  session: { state: BlitzState; status: string; phase: { actor: number | null } },
  seats: readonly {
    seat: number;
    name: string;
    avatarId: string;
    bot: boolean;
  }[],
  localSeat: number,
  legal: readonly { id: string; payload?: unknown }[],
  code: string,
): TableView {
  const moveIds = new Set(legal.map((move) => move.id));
  const discardCards = legal.flatMap((move) =>
    move.id === 'discard' &&
    typeof (move.payload as { card?: unknown } | undefined)?.card === 'string'
      ? [(move.payload as { card: string }).card]
      : [],
  );
  return {
    players: seats.map((player) => ({
      seat: player.seat,
      name: player.name,
      avatarId: player.avatarId,
      hand: player.seat === localSeat ? (session.state.hands[player.seat] ?? []) : [],
      handCount: session.state.hands[player.seat]?.length ?? 0,
      lives: 3,
      isLocal: player.seat === localSeat,
      isBot: player.bot,
    })),
    activeSeat: session.phase.actor,
    stockCount: session.state.stock.length,
    discard: session.state.discard,
    phaseLabel: `friend room ${code}`,
    legal: {
      drawStock: moveIds.has('draw.stock'),
      drawDiscard: moveIds.has('draw.discard'),
      discardCards,
      knock: moveIds.has('knock'),
    },
  };
}

function matchResult(snapshot: SoloSnapshot): MatchResult {
  const values = snapshot.mode === 'classic' ? snapshot.lives : snapshot.wins;
  const ordered = values
    .map((value, seat) => ({ seat, value }))
    .sort((a, b) => b.value - a.value || a.seat - b.seat);
  let priorValue: number | null = null;
  let priorRank = 0;
  return {
    winner: snapshot.matchWinner,
    reason:
      snapshot.mode === 'classic'
        ? 'last player standing'
        : snapshot.mode === 'fast'
          ? 'first to three'
          : 'time expired',
    rankings: ordered.map(({ seat, value }, index) => {
      if (value !== priorValue) priorRank = index + 1;
      priorValue = value;
      const detail: Record<string, number> =
        snapshot.mode === 'classic'
          ? { livesLeft: value, ...snapshot.metrics[seat] }
          : { roundWins: value, ...snapshot.metrics[seat] };
      return {
        seat,
        rank: priorRank,
        detail,
      };
    }),
  };
}

export const blitzTablePack = defineTablePack<
  SoloSnapshot,
  LocalDispatch,
  LocalTransport,
  BlitzState,
  BlitzConfig
>({
  id: 'blitz',
  gameId: 'blitz',
  homeHref: '/play',

  useSoloDeal() {
    const mode = useSetupStore((state) => state.mode);
    const seats = useSetupStore((state) => state.seats);
    const botTier = useSetupStore((state) => state.botTier);
    const name = useProfileStore((state) => state.name);
    const avatarId = useProfileStore((state) => state.avatarId);
    return {
      create: () => {
        const startedAtMs = Date.now();
        return new LocalTransport({
          mode,
          seats,
          botTier,
          seed: startedAtMs | 0,
          startedAtMs,
          player: { name, avatarId },
        });
      },
      deps: [avatarId, botTier, mode, name, seats],
    };
  },

  useSoloDriver: useBlitzDriver,
  useSoloEffects: useBlitzClocks,

  renderPending: ({ fx, fxKey, error }) => (
    <TableScreen view={null} fx={fx} fxKey={fxKey} error={error} />
  ),

  renderSolo({ snapshot, fx, fxKey, error, dispatch, accept, transport, quit }) {
    return (
      <>
        <TableScreen
          view={soloTableView(snapshot, transport)}
          fx={fx}
          fxKey={fxKey}
          busy={snapshot.session.phase.actor !== 0 || snapshot.session.status !== 'playing'}
          error={error}
          onDraw={(source) => dispatch(`draw.${source}`)}
          onDiscard={(card) => dispatch('discard', { card })}
          onKnock={() => dispatch('knock')}
          onQuit={quit}
        />
        {snapshot.session.status === 'ended' && snapshot.matchWinner === null && (
          <RoundEndOverlay
            fx={roundTimelines.get(transport) ?? []}
            seats={snapshot.players.map(({ seat, name, avatarId }) => ({ seat, name, avatarId }))}
            livesBySeat={Object.fromEntries(snapshot.lives.map((lives, seat) => [seat, lives]))}
            onNextRound={() => accept(transport.startNextRound())}
          />
        )}
      </>
    );
  },

  soloReport({ snapshot, push }) {
    if (snapshot.matchWinner === null) return null;
    const result = matchResult(snapshot);
    const localMetrics = snapshot.metrics[0] ?? { blitzes: 0, knocks: 0, knockWins: 0 };
    return {
      id: `solo:blitz:${snapshot.session.seed}`,
      game: 'blitz',
      mode: snapshot.mode,
      result,
      localSeat: 0,
      won: snapshot.matchWinner === 0,
      stats: localMetrics,
      seats: snapshot.players.map((player) => ({
        seat: player.seat,
        name: player.name,
        avatarId: player.avatarId,
        kind: player.isBot ? ('bot' as const) : ('friend' as const),
        key: player.isBot ? botKey(player.personaId ?? player.avatarId) : friendKey('local-player'),
      })),
      onPlayAgain: () => push('/table'),
      onFinish: () => push('/match-end'),
    };
  },

  renderRoom({ session, snapshot, localSeat, error, dispatch, quit }) {
    const myTurn = session.status === 'playing' && isActingSeat(session.phase, localSeat);
    const legal = myTurn
      ? (session.def.flow.legalMovesFor?.(session.state, session.phase, localSeat) ??
        session.def.flow.legalMoves(session.state, session.phase))
      : [];

    return (
      <TableScreen
        view={roomTableView(session, snapshot.seats, localSeat, legal, snapshot.room?.code ?? '')}
        fx={snapshot.fx}
        fxKey={snapshot.fxKey}
        busy={!myTurn}
        error={error}
        onDraw={(source) => dispatch(`draw.${source}`)}
        onDiscard={(card) => dispatch('discard', { card })}
        onKnock={() => dispatch('knock')}
        onQuit={quit}
      />
    );
  },

  roomReport({ session, snapshot, localSeat }) {
    if (session.status !== 'ended' || !session.result) return null;
    return {
      id: roomMatchId(
        snapshot.room?.code,
        session.seed,
        session.lastAppliedHash ?? session.log.length,
      ),
      game: 'blitz',
      mode: 'fast',
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
