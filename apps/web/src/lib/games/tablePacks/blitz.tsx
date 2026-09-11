'use client';

import { useEffect, useRef } from 'react';
import {
  Fx,
  isActingSeat,
  isVeilHandle,
  type FxEvent,
  type MatchResult,
  type PhaseState,
} from '@parlour/engine';
import {
  isBlitz,
  type BlitzConfig,
  type BlitzMatchState,
  type BlitzState,
} from '@parlour/game-blitz';
import { RoundEndOverlay } from '@/components/celebration/RoundEndOverlay';
import { TableScreen, type TableView } from '@/components/table/TableScreen';
import {
  defineTablePack,
  type RoomTableContext,
  type SoloDriver,
  type SoloTableContext,
} from '@/components/table/GameTablePage';
import { roomMatchId, wonByRank } from '@/lib/table/useMatchReport';
import { LocalTransport, type LocalDispatch, type SoloSnapshot } from '@/lib/solo/LocalTransport';
import { botKey, friendKey } from '@/stores/history';
import { useProfileStore } from '@/stores/profile';
import { useSetupStore } from '@/stores/setup';
import { useSoloTable } from '@/lib/table/useSoloTable';

type BlitzSoloContext = SoloTableContext<LocalTransport, SoloSnapshot, LocalDispatch>;
type BlitzRoomContext = RoomTableContext<BlitzMatchState, BlitzConfig>;

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
    pacing: (current) => (current.mode === 'timed' ? 'timed' : 'casual'),
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
  match: BlitzMatchState,
  activeSeat: number | null,
  seats: readonly {
    seat: number;
    name: string;
    avatarId: string;
    bot: boolean;
  }[],
  localSeat: number,
  legal: readonly { id: string; payload?: unknown }[],
): TableView {
  const round = match.round;
  const moveIds = new Set(legal.map((move) => move.id));
  const discardCards = legal.flatMap((move) =>
    move.id === 'discard' &&
    typeof (move.payload as { card?: unknown } | undefined)?.card === 'string'
      ? [(move.payload as { card: string }).card]
      : [],
  );
  const scores = match.format === 'lives' ? match.lives : match.wins;
  return {
    players: seats.map((player) => {
      const eliminated = match.format === 'lives' && (match.lives[player.seat] ?? 0) <= 0;
      return {
        seat: player.seat,
        name: player.name,
        avatarId: player.avatarId,
        hand: player.seat === localSeat ? (round.hands[player.seat] ?? []) : [],
        handCount: round.hands[player.seat]?.length ?? 0,
        // The room used to hardcode three here, so every seat showed a full
        // rack for the whole match however many rounds they had lost.
        lives: scores[player.seat] ?? 0,
        isLocal: player.seat === localSeat,
        isBot: player.bot,
        eliminated,
      };
    }),
    activeSeat,
    stockCount: round.stock.length,
    discard: round.discard,
    phaseLabel: `round ${match.roundIndex + 1} · ${match.format === 'lives' ? 'lives' : 'wins'}`,
    legal: {
      drawStock: moveIds.has('draw.stock'),
      drawDiscard: moveIds.has('draw.discard'),
      discardCards,
      knock: moveIds.has('knock'),
      // No claim button: a 31 announces itself (see `useBlitzRoomClaim`).
    },
  };
}

/**
 * Declares a blitz for you, the moment you are holding one.
 *
 * In an open room the flow spots a 31 the instant it exists, because it can
 * read every hand. Under Veil only the owner's own client can — so the rules
 * carry a `blitz.claim` move, and the room turned that into a "Blitz!" button
 * the player had to notice and press. That is not a decision: the claim opens
 * your hand and settles the round in your favour, there is never a reason to
 * decline it, and a seat that missed the button played on holding a winning
 * hand. Reading your own cards is the client's job, so the client does it.
 *
 * Guarded by the log position rather than a boolean: one claim per position,
 * re-armed by the next thing that happens, so a refused claim (someone else got
 * there first) is not a seat that can never claim again.
 */
function useBlitzRoomClaim(ctx: BlitzRoomContext | null): void {
  const sent = useRef<number | null>(null);
  const session = ctx?.session ?? null;
  const localSeat = ctx?.localSeat ?? null;
  const dispatch = ctx?.dispatch;
  const position = session?.log.length ?? -1;

  useEffect(() => {
    if (!session || localSeat === null || !dispatch) return;
    if (session.status !== 'playing' || sent.current === position) return;
    const round = session.state.round;
    if (!isActingSeat(session.phase, localSeat)) return;
    const legal = session.def.flow.legalMovesFor?.(session.state, session.phase, localSeat) ?? [];
    if (!legal.some((move) => move.id === 'blitz.claim')) return;
    // The engine's own legality is count-based, so it says "you may claim", not
    // "you are holding 31". Only send when the hand has peeled and really is.
    if (!claimableHand(round, localSeat)) return;
    sent.current = position;
    // A race, not a decision: two seats can be holding 31 at once and the hold
    // that waits for the cards to land is exactly how you lose that race.
    ctx.race('blitz.claim', undefined, round.hands[localSeat] ?? []);
  }, [ctx, dispatch, localSeat, position, session]);
}

/**
 * Whose turn it is — which under Veil is not the same as who may act.
 *
 * A veiled Blitz round lists every live seat as an acting seat so that any of
 * them can claim a blitz the table cannot see (`withClaimants` in game-blitz).
 * The felt is asking a narrower question: the piles ring, the hand spotlight
 * and the "Your turn" whisper belong to `phase.actor` alone. Asking
 * `isActingSeat` instead meant every player in every veiled room was told it
 * was their turn for the whole match. `showdown.reveal` names an actor too, but
 * the room answers it on the seat's behalf, so it is nobody's turn either.
 */
export function isBlitzTurn(phase: PhaseState, seat: number): boolean {
  return phase.actor === seat && phase.phase !== 'showdown.reveal';
}

/** This seat's presented hand is fully readable and actually holds 31. */
function claimableHand(state: BlitzState, seat: number): boolean {
  const hand = state.hands[seat] ?? [];
  return hand.length === 3 && hand.every((card) => !isVeilHandle(card)) && isBlitz(hand);
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
  BlitzMatchState,
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

  useRoomEffects: useBlitzRoomClaim,

  renderRoom({ session, snapshot, localSeat, error, dispatch, quit }) {
    const playing = session.status === 'playing';
    const match = session.state;
    // Between rounds the table is not busy waiting on a turn, it is waiting on
    // everyone to look at the result and say go.
    const betweenRounds = playing && match.folded;
    const myTurn = playing && !betweenRounds && isBlitzTurn(session.phase, localSeat);
    // Legality follows the wider question: the claim is deliberately off-turn.
    const legal =
      playing && !betweenRounds && isActingSeat(session.phase, localSeat)
        ? (session.def.flow.legalMovesFor?.(session.state, session.phase, localSeat) ??
          session.def.flow.legalMoves(session.state, session.phase))
        : [];

    return (
      <>
        <TableScreen
          view={roomTableView(
            match,
            betweenRounds ? null : session.phase.actor,
            snapshot.seats,
            localSeat,
            legal,
          )}
          fx={snapshot.fx}
          fxKey={snapshot.fxKey}
          busy={!myTurn}
          error={error}
          onDraw={(source) => dispatch(`draw.${source}`)}
          onDiscard={(card) => dispatch('discard', { card })}
          onKnock={() => dispatch('knock')}
          onQuit={quit}
        />
        {betweenRounds && (
          <RoundEndOverlay
            fx={snapshot.fx}
            seats={snapshot.seats.map(({ seat, name, avatarId }) => ({ seat, name, avatarId }))}
            livesBySeat={Object.fromEntries(match.lives.map((lives, seat) => [seat, lives]))}
            // Every seat readies for itself, and the last one deals — so a peer
            // that is still watching the chips fall is not dealt over.
            onNextRound={() => {
              if (!match.readied.includes(localSeat)) dispatch('ready');
            }}
          />
        )}
      </>
    );
  },

  /*
   * The MATCH is the thing that ends, not the round.
   *
   * This used to report the moment a session's status went to `ended`, which
   * on the round def was after one deal — so a friend room showed the podium
   * after a single hand, with that hand's values where the match score belongs
   * and `mode: 'fast'` hardcoded over whatever was actually being played. The
   * match def only ends when the format says so, and its result carries every
   * seat's standing, so both are now simply true.
   */
  roomReport({ session, snapshot, localSeat }) {
    if (session.status !== 'ended' || !session.result) return null;
    return {
      id: roomMatchId(
        snapshot.room?.code,
        session.seed,
        session.lastAppliedHash ?? session.log.length,
      ),
      game: 'blitz',
      mode: session.state.format === 'lives' ? 'classic' : 'fast',
      result: session.result,
      localSeat,
      // Rank, not `winner`: a Blitz match can be tied at the top, and a tie
      // leaves `winner` null — which told both seats who had just shared first
      // that they had lost, jingle and all.
      won: wonByRank(session.result, localSeat),
      stats: session.state.metrics[localSeat] ?? { blitzes: 0, knocks: 0, knockWins: 0 },
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
