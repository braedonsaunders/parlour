'use client';

import { isActingSeat } from '@parlour/engine';
import {
  HeartsTableScreen,
  type HeartsHandEndInfo,
} from '@/components/table/hearts/HeartsTableScreen';
import { defineTablePack, turnBasedDriver } from '@/components/table/GameTablePage';
import { heartsModeForRules, type HeartsModeId } from '@/lib/hearts/modes';
import { heartsTableView } from '@/lib/hearts/view';
import { roomMatchId } from '@/lib/table/useMatchReport';
import {
  HeartsTransport,
  type HeartsDispatch,
  type HeartsSnapshot,
} from '@/lib/solo/HeartsTransport';
import { botKey, friendKey } from '@/stores/history';
import { useProfileStore } from '@/stores/profile';
import { heartsRulesFor, useHeartsSetupStore } from '@/stores/heartsSetup';
import type { HeartsRules, HeartsState } from '@parlour/game-hearts';

const BOT_THINK_MS = 520;

/** The podium wants the whole match, not just the last hand. */
function matchResultFrom(snapshot: HeartsSnapshot) {
  if (snapshot.matchResult) return snapshot.matchResult;
  return snapshot.handResult ?? { winner: null, rankings: [], reason: 'hand-complete' };
}

/**
 * Friend rooms play one hand per room session (the shared authority is a flat
 * GameSession), so the score strip shows this hand's running points.
 */
function cumulativeScoresForMultiplayer(session: {
  state: { taken: readonly string[][]; rules: { jackDiamonds: boolean } };
}): number[] {
  return session.state.taken.map((pile) =>
    pile.reduce((sum, card) => {
      if (card.startsWith('H')) return sum + 1;
      if (card === 'S12') return sum + 13;
      if (session.state.rules.jackDiamonds && card === 'D11') return sum - 10;
      return sum;
    }, 0),
  );
}

export const heartsTablePack = defineTablePack<
  HeartsSnapshot,
  HeartsDispatch,
  HeartsTransport,
  HeartsState,
  HeartsRules
>({
  id: 'hearts',
  gameId: 'hearts',

  useSoloDeal() {
    const mode = useHeartsSetupStore((state) => state.mode);
    const overrides = useHeartsSetupStore((state) => state.overrides);
    const botTier = useHeartsSetupStore((state) => state.botTier);
    const name = useProfileStore((state) => state.name);
    const avatarId = useProfileStore((state) => state.avatarId);
    return {
      create: () =>
        new HeartsTransport({
          config: heartsRulesFor(mode, overrides),
          mode,
          seed: Date.now() | 0,
          player: { name, avatarId },
          botTier,
        }),
      deps: [avatarId, botTier, mode, name, overrides],
    };
  },

  useSoloDriver: turnBasedDriver({
    round: (snapshot) => snapshot.hand,
    botPaceMs: () => BOT_THINK_MS,
    // A move that emitted nothing falls back to the deal timeline, so the
    // opening cascade is not swallowed by the first pass.
    fxFor: (outcome) =>
      outcome.fx.length > 0 ? outcome.fx : (outcome.snapshot.hand.setupFx ?? []),
  }),

  renderPending: ({ fx, fxKey, error }) => (
    <HeartsTableScreen view={null} fx={fx} fxKey={fxKey} error={error} />
  ),

  renderSolo({ snapshot, fx, fxKey, error, dispatch, accept, transport, quit }) {
    const legal =
      snapshot.status === 'playing' && isActingSeat(snapshot.hand.phase, 0)
        ? transport.legalMovesForSeat(0)
        : [];
    const view = heartsTableView({
      mode: snapshot.mode as HeartsModeId,
      localSeat: 0,
      players: snapshot.players,
      scores: snapshot.scores,
      state: snapshot.hand.state,
      legal,
    });

    const handEnd: HeartsHandEndInfo | null =
      snapshot.status === 'round-over' && snapshot.handResult
        ? { result: snapshot.handResult, scores: snapshot.scores, matchOver: false }
        : null;

    return (
      <HeartsTableScreen
        view={view}
        fx={fx}
        fxKey={fxKey}
        busy={!isActingSeat(snapshot.hand.phase, 0) || snapshot.status !== 'playing'}
        error={error}
        onPass={(cards) => dispatch('passCards', { cards })}
        onPlayCard={(card) => dispatch('playCard', { card })}
        onNextHand={() => accept(transport.startNextHand())}
        onQuit={quit}
        handEnd={handEnd}
      />
    );
  },

  soloReport({ snapshot, push }) {
    if (snapshot.matchWinner === null || !snapshot.matchResult) return null;
    const result = matchResultFrom(snapshot);
    return {
      id: crypto.randomUUID(),
      game: 'hearts',
      mode: snapshot.mode,
      result,
      localSeat: 0,
      won: snapshot.matchWinner === 0,
      seats: snapshot.players.map((player) => ({
        seat: player.seat,
        name: player.name,
        avatarId: player.avatarId,
        kind: player.isBot ? ('bot' as const) : ('friend' as const),
        key: player.isBot ? botKey(player.avatarId) : friendKey(`seat-${player.seat}`),
      })),
      onPlayAgain: () => push('/hearts/table'),
      onFinish: () => push('/match-end'),
    };
  },

  renderRoom({ session, snapshot, localSeat, error, dispatch, quit }) {
    const myTurn =
      session.status === 'playing' &&
      isActingSeat(session.phase, localSeat) &&
      (session.state.passing
        ? session.state.selections[localSeat] === null
        : session.state.turn === localSeat || !session.state.ledTwoClubs);
    const legal = myTurn
      ? (session.def.flow.legalMovesFor?.(session.state, session.phase, localSeat) ?? [])
      : [];

    return (
      <HeartsTableScreen
        view={heartsTableView({
          mode: heartsModeForRules(session.config),
          localSeat,
          players: snapshot.seats.map((player) => ({
            seat: player.seat,
            name: player.name,
            avatarId: player.avatarId,
            isBot: player.bot,
          })),
          scores: cumulativeScoresForMultiplayer(session),
          state: session.state,
          legal,
        })}
        fx={snapshot.fx}
        fxKey={snapshot.fxKey}
        busy={!myTurn}
        error={error}
        onPass={(cards) => dispatch('passCards', { cards })}
        onPlayCard={(card) => dispatch('playCard', { card })}
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
      game: 'hearts',
      mode: heartsModeForRules(session.config),
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
