'use client';

import { useEffect } from 'react';
import {
  wildpileDiscardAllCards,
  type WildpileColor,
  type WildpileRules,
  type WildpileState,
} from '@parlour/game-wildpile';
import { WildTableScreen } from '@/components/table/wild/WildTableScreen';
import {
  defineTablePack,
  turnBasedDriver,
  type RoomTableContext,
  type SoloTableContext,
} from '@/components/table/GameTablePage';
import { wildModeForRules } from '@/lib/wild/modes';
import { wildTableView } from '@/lib/wild/view';
import { roomMatchId } from '@/lib/table/useMatchReport';
import { WildTransport, type WildDispatch, type WildSnapshot } from '@/lib/solo/WildTransport';
import { botKey, friendKey } from '@/stores/history';
import { useProfileStore } from '@/stores/profile';
import { useWildSetupStore, wildRulesFor } from '@/stores/wildSetup';

type WildSoloContext = SoloTableContext<WildTransport, WildSnapshot, WildDispatch>;
type WildRoomContext = RoomTableContext<WildpileState, WildpileRules>;

/**
 * Wild is the only table on a clock, so it is the only one that arms timers.
 *
 * Solo, the transport owns both deadlines and the table simply asks it to time
 * out. In a room the same two deadlines exist but only the host may act on
 * them, and it does so by *injecting* into the log rather than sending a move —
 * that is what keeps every peer's replay identical through a timeout.
 */
function useSoloClocks({ snapshot, transport, accept }: WildSoloContext): void {
  useEffect(() => {
    if (snapshot.session.status !== 'playing') return;
    const actor = snapshot.session.phase.actor;
    if (actor === null) return;
    const timer = window.setTimeout(() => {
      accept(transport.timeoutTurn(actor));
    }, snapshot.session.config.turnTimeSeconds * 1_000);
    return () => window.clearTimeout(timer);
  }, [
    accept,
    snapshot.session.config.turnTimeSeconds,
    snapshot.session.log.length,
    snapshot.session.phase.actor,
    snapshot.session.status,
    transport,
  ]);

  useEffect(() => {
    if (snapshot.session.status !== 'playing') return;
    const timer = window.setTimeout(
      () => {
        accept(transport.timeoutMatch());
      },
      Math.max(0, transport.matchEndsAt() - Date.now()),
    );
    return () => window.clearTimeout(timer);
  }, [accept, snapshot.session.status, transport]);
}

function useRoomClocks(ctx: WildRoomContext | null): void {
  const room = ctx?.room;
  const session = ctx?.session;
  const isHost = ctx?.snapshot.isHost ?? false;
  const matchEndsAt = ctx ? roomMatchEndsAt(ctx) : 0;

  useEffect(() => {
    if (!room || !isHost || session?.status !== 'playing' || session.phase.actor === null) return;
    const actor = session.phase.actor;
    const timer = window.setTimeout(() => {
      try {
        room.inject('timeout', { kind: 'turn', actor });
      } catch {
        // The move that beat the clock already replaced this timer's phase.
      }
    }, session.config.turnTimeSeconds * 1_000);
    return () => window.clearTimeout(timer);
  }, [
    isHost,
    room,
    session?.config.turnTimeSeconds,
    session?.log.length,
    session?.phase.actor,
    session?.status,
  ]);

  useEffect(() => {
    if (!room || !isHost || session?.status !== 'playing') return;
    const timer = window.setTimeout(
      () => {
        try {
          room.inject('timeout', { kind: 'match' });
        } catch {
          // A hand emptied at the same instant; that result wins the race.
        }
      },
      Math.max(0, matchEndsAt - Date.now()),
    );
    return () => window.clearTimeout(timer);
  }, [isHost, matchEndsAt, room, session?.status]);
}

/**
 * When this room's match clock expires.
 *
 * A room session carries no start stamp, so the deadline is anchored the first
 * time this device renders the table and held steady from there. That is the
 * same anchor the hand-written page used; a peer joining late sees a shorter
 * clock, which is a known limitation of a room whose authority is a peer.
 */
const roomStartAt = new WeakMap<object, number>();
function roomMatchEndsAt(ctx: WildRoomContext): number {
  let started = roomStartAt.get(ctx.room);
  if (started === undefined) {
    started = Date.now();
    roomStartAt.set(ctx.room, started);
  }
  return started + (ctx.session.config.matchTimeMinutes ?? 5) * 60_000;
}

export const wildTablePack = defineTablePack<
  WildSnapshot,
  WildDispatch,
  WildTransport,
  WildpileState,
  WildpileRules
>({
  id: 'wild',
  gameId: 'wildpile',

  useSoloDeal() {
    const mode = useWildSetupStore((state) => state.mode);
    const seats = useWildSetupStore((state) => state.seats);
    const overrides = useWildSetupStore((state) => state.overrides);
    const botTier = useWildSetupStore((state) => state.botTier);
    const name = useProfileStore((state) => state.name);
    const avatarId = useProfileStore((state) => state.avatarId);
    // rulesKey stands in for the rules object so a fresh identity per render
    // does not re-deal the table.
    const rulesKey = JSON.stringify(wildRulesFor(mode, overrides));
    return {
      create: () =>
        new WildTransport({
          mode,
          seats,
          seed: Date.now() | 0,
          player: { name, avatarId },
          botTier,
          rules: JSON.parse(rulesKey) as WildpileRules,
        }),
      deps: [avatarId, botTier, mode, name, seats, rulesKey],
    };
  },

  useSoloDriver: turnBasedDriver({
    round: (snapshot) => snapshot.session,
    botPaceMs: (current) =>
      current.session.phase.phase === 'play' ? 480 + (current.session.phase.actor ?? 0) * 90 : 240,
  }),
  useSoloEffects: useSoloClocks,
  useRoomEffects: useRoomClocks,

  renderPending: ({ fx, fxKey, error }) => (
    <WildTableScreen view={null} fx={fx} fxKey={fxKey} error={error} />
  ),

  renderSolo({ snapshot, fx, fxKey, error, dispatch, transport, quit }) {
    return (
      <WildTableScreen
        view={wildTableView(snapshot, transport.legalMoves())}
        matchEndsAt={transport.matchEndsAt()}
        turnDurationMs={snapshot.session.config.turnTimeSeconds * 1_000}
        turnClockKey={`${snapshot.session.log.length}:${snapshot.session.phase.actor ?? 'ended'}`}
        fx={fx}
        fxKey={fxKey}
        busy={snapshot.session.phase.actor !== 0 || snapshot.session.status !== 'playing'}
        error={error}
        onPlay={(card) => dispatch('playCard', { card })}
        onDraw={() => dispatch('draw')}
        onChooseColor={(color: WildpileColor) => dispatch('chooseColor', { color })}
        onDeclineJump={() => dispatch('declineJump')}
        onCallLastCard={() => dispatch('callLastCard')}
        onChooseTarget={(seat: number) => dispatch('chooseTarget', { seat })}
        onPass={() => dispatch('pass')}
        onChallengeDrawFour={() => dispatch('challengeDrawFour')}
        onQuit={quit}
      />
    );
  },

  soloReport({ snapshot, push }) {
    if (snapshot.matchWinner === null || !snapshot.session.result) return null;
    return {
      id: crypto.randomUUID(),
      game: 'wild',
      mode: snapshot.mode,
      result: snapshot.session.result,
      localSeat: 0,
      won: snapshot.matchWinner === 0,
      seats: snapshot.players.map((player) => ({
        seat: player.seat,
        name: player.name,
        avatarId: player.avatarId,
        kind: player.isBot ? ('bot' as const) : ('friend' as const),
        key: player.isBot ? botKey(player.avatarId) : friendKey('local-wild-player'),
      })),
      onPlayAgain: () => push('/wild/table'),
      onFinish: () => push('/match-end'),
    };
  },

  renderRoom(ctx) {
    const { session, snapshot, localSeat, error, dispatch, quit } = ctx;
    const isLocalTurn = session.status === 'playing' && session.phase.actor === localSeat;
    const legal = isLocalTurn ? session.def.flow.legalMoves(session.state, session.phase) : [];
    const wildSnapshot: WildSnapshot = {
      mode: wildModeForRules(session.config),
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
      <WildTableScreen
        view={wildTableView(wildSnapshot, legal, localSeat)}
        matchEndsAt={roomMatchEndsAt(ctx)}
        turnDurationMs={session.config.turnTimeSeconds * 1_000}
        turnClockKey={`${session.log.length}:${session.phase.actor ?? 'ended'}`}
        fx={snapshot.fx}
        fxKey={snapshot.fxKey}
        busy={!isLocalTurn}
        error={error}
        onPlay={(card) => {
          // Dumping a colour makes several cards public at once, so the move
          // carries every opening it performs rather than just the card played.
          const cards = session.state.hands[localSeat] ?? [];
          dispatch('playCard', { card }, wildpileDiscardAllCards(cards, card));
        }}
        onDraw={() => dispatch('draw')}
        onChooseColor={(color: WildpileColor) => dispatch('chooseColor', { color })}
        onDeclineJump={() => dispatch('declineJump')}
        onCallLastCard={() => dispatch('callLastCard')}
        onChooseTarget={(seat: number) => dispatch('chooseTarget', { seat })}
        onPass={() => dispatch('pass')}
        onChallengeDrawFour={() => dispatch('challengeDrawFour')}
        onQuit={quit}
      />
    );
  },

  roomReport({ session, snapshot, localSeat, leave, push }) {
    if (!session.result) return null;
    return {
      id: roomMatchId(
        snapshot.room?.code,
        session.seed,
        session.lastAppliedHash ?? session.log.length,
      ),
      game: 'wild',
      mode: wildModeForRules(session.config),
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
      onPlayAgain: () => push('/wild/create'),
      onFinish: () => leave(() => push('/match-end')),
    };
  },
});
