'use client';

import { useCallback, useSyncExternalStore } from 'react';
import { useWipeRouter } from '@/hooks/useWipeRouter';
import { isActingSeat } from '@parlour/engine';
import type { HeartsModeId } from '@/lib/hearts/modes';
import { heartsModeForRules } from '@/lib/hearts/modes';
import { heartsTableView } from '@/lib/hearts/view';
import { useSoloTable } from '@/lib/table/useSoloTable';
import { HeartsTransport, type HeartsSnapshot } from '@/lib/solo/HeartsTransport';
import {
  leaveRoom,
  roomMatchId,
  roomSeats,
  soloSeats,
  useMatchReport,
  useMultiplayerRoom,
  useRoomDispatch,
  useSoloTransport,
} from '@/lib/table/useGameTable';
import { useProfileStore } from '@/stores/profile';
import { heartsRulesFor, useHeartsSetupStore } from '@/stores/heartsSetup';
import {
  HeartsTableScreen,
  type HeartsHandEndInfo,
} from '@/components/table/hearts/HeartsTableScreen';
import { multiplayerSession, type MultiplayerRoomSession } from '../../_multiplayer/roomSession';
import type { HeartsRules, HeartsState } from '@parlour/game-hearts';

export default function HeartsTablePage() {
  const room = useMultiplayerRoom('hearts');
  if (room) return <ActiveMultiplayerHeartsTable room={room} />;
  return <SoloHeartsTablePage />;
}

function SoloHeartsTablePage() {
  const mode = useHeartsSetupStore((state) => state.mode);
  const overrides = useHeartsSetupStore((state) => state.overrides);
  const botTier = useHeartsSetupStore((state) => state.botTier);
  const name = useProfileStore((state) => state.name);
  const avatarId = useProfileStore((state) => state.avatarId);
  const transport = useSoloTransport(
    () =>
      new HeartsTransport({
        config: heartsRulesFor(mode, overrides),
        mode,
        seed: Date.now() | 0,
        player: { name, avatarId },
        botTier,
      }),
    [avatarId, botTier, mode, name, overrides],
  );

  if (!transport) return <HeartsTableScreen view={null} fx={[]} fxKey="loading" />;
  return <ActiveSoloHeartsTable transport={transport} />;
}

const BOT_THINK_MS = 520;

function ActiveSoloHeartsTable({ transport }: { transport: HeartsTransport }) {
  const router = useWipeRouter();
  const botPaceMs = useCallback((_current: HeartsSnapshot) => BOT_THINK_MS, []);
  const { snapshot, fx, fxKey, error, dispatch, accept } = useSoloTable(transport, {
    round: (current) => current.hand,
    botPaceMs,
    fxFor: (outcome) =>
      outcome.fx.length > 0 ? outcome.fx : (outcome.snapshot.hand.setupFx ?? []),
  });

  useMatchReport({
    result: snapshot.matchWinner === null ? null : (snapshot.matchResult ?? null),
    game: 'hearts',
    mode: snapshot.mode,
    localSeat: 0,
    seats: soloSeats(snapshot.players),
    id: `solo:hearts:${snapshot.hand.seed}`,
    won: snapshot.matchWinner === 0,
    playAgain: () => router.push('/hearts/table'),
  });

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
      onQuit={() => router.push('/hearts')}
      handEnd={handEnd}
    />
  );
}

function ActiveMultiplayerHeartsTable({ room }: { room: MultiplayerRoomSession }) {
  const router = useWipeRouter();
  const snapshot = useSyncExternalStore(room.subscribe, room.getSnapshot, room.getSnapshot);
  const { dispatch, error: localError } = useRoomDispatch(room);
  const session = multiplayerSession<HeartsState, HeartsRules>(snapshot, 'hearts');
  const localSeat = snapshot.localSeat;
  const roomMode = session ? heartsModeForRules(session.config) : 'classic';

  useMatchReport({
    result: session?.result ?? null,
    game: 'hearts',
    mode: roomMode,
    localSeat,
    seats: roomSeats(snapshot.seats),
    id: session ? roomMatchId(snapshot.room?.code, session) : '',
    // Hearts has a single winner, so "the winning seat is mine" and "I ranked
    // first" agree; the default predicate is the one that keeps agreeing if a
    // future rule ever ties the lowest score.
    playAgain: () => router.push('/hearts/create'),
    onLeave: () => leaveRoom(room),
  });

  if (!session || localSeat === null) {
    return (
      <HeartsTableScreen
        view={null}
        fx={snapshot.fx}
        fxKey={snapshot.fxKey}
        error={localError ?? snapshot.error}
      />
    );
  }

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
        mode: roomMode,
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
      error={localError ?? snapshot.error}
      onPass={(cards) => dispatch('passCards', { cards })}
      onPlayCard={(card) => dispatch('playCard', { card })}
      onQuit={() => {
        leaveRoom(room);
        router.push('/hearts');
      }}
    />
  );
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
