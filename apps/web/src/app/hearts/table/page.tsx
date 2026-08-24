'use client';

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useWipeRouter } from '@/hooks/useWipeRouter';
import { isActingSeat } from '@parlour/engine';
import type { HeartsModeId } from '@/lib/hearts/modes';
import { usePodiumHandoff } from '@/lib/table/usePodiumHandoff';
import { heartsModeForRules } from '@/lib/hearts/modes';
import { heartsTableView } from '@/lib/hearts/view';
import { useSoloTable } from '@/lib/table/useSoloTable';
import { HeartsTransport, type HeartsSnapshot } from '@/lib/solo/HeartsTransport';
import { botKey, buildMatchRecord, friendKey, useHistoryStore } from '@/stores/history';
import { useMatchFlowStore } from '@/stores/matchFlow';
import { useProfileStore } from '@/stores/profile';
import { heartsRulesFor, useHeartsSetupStore } from '@/stores/heartsSetup';
import {
  HeartsTableScreen,
  type HeartsHandEndInfo,
} from '@/components/table/hearts/HeartsTableScreen';
import {
  clearActiveMultiplayerSession,
  getActiveMultiplayerSession,
  multiplayerSession,
  subscribeActiveMultiplayerSession,
  type MultiplayerRoomSession,
} from '../../_multiplayer/roomSession';
import type { HeartsRules, HeartsState } from '@parlour/game-hearts';

export default function HeartsTablePage() {
  const multiplayer = useSyncExternalStore(
    subscribeActiveMultiplayerSession,
    getActiveMultiplayerSession,
    () => null,
  );
  if (multiplayer?.getSnapshot().gameId === 'hearts') {
    return <ActiveMultiplayerHeartsTable room={multiplayer} />;
  }
  return <SoloHeartsTablePage />;
}

function SoloHeartsTablePage() {
  const mode = useHeartsSetupStore((state) => state.mode);
  const overrides = useHeartsSetupStore((state) => state.overrides);
  const botTier = useHeartsSetupStore((state) => state.botTier);
  const name = useProfileStore((state) => state.name);
  const avatarId = useProfileStore((state) => state.avatarId);
  const [transport, setTransport] = useState<HeartsTransport | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setTransport(
        new HeartsTransport({
          config: heartsRulesFor(mode, overrides),
          mode,
          seed: Date.now() | 0,
          player: { name, avatarId },
          botTier,
        }),
      );
    }, 0);
    return () => window.clearTimeout(timer);
  }, [avatarId, botTier, mode, name, overrides]);

  if (!transport) return <HeartsTableScreen view={null} fx={[]} fxKey="loading" />;
  return <ActiveSoloHeartsTable transport={transport} />;
}

const BOT_THINK_MS = 520;

function ActiveSoloHeartsTable({ transport }: { transport: HeartsTransport }) {
  const router = useWipeRouter();
  const setLastMatch = useMatchFlowStore((state) => state.setLastMatch);
  const registerPlayAgain = useMatchFlowStore((state) => state.registerPlayAgain);
  const handOffToPodium = usePodiumHandoff();
  const recordResult = useProfileStore((state) => state.recordResult);
  const recordMatch = useHistoryStore((state) => state.recordMatch);
  const reportedMatch = useRef<HeartsTransport | null>(null);
  const botPaceMs = useCallback((_current: HeartsSnapshot) => BOT_THINK_MS, []);
  const { snapshot, fx, fxKey, error, dispatch, accept } = useSoloTable(transport, {
    round: (current) => current.hand,
    botPaceMs,
    fxFor: (outcome) =>
      outcome.fx.length > 0 ? outcome.fx : (outcome.snapshot.hand.setupFx ?? []),
  });

  useEffect(() => {
    if (
      snapshot.matchWinner === null ||
      reportedMatch.current === transport ||
      !snapshot.matchResult
    ) {
      return;
    }
    reportedMatch.current = transport;
    recordResult({ won: snapshot.matchWinner === 0, blitzes: 0, knocks: 0, knockWins: 0 });
    const id = crypto.randomUUID();
    const seats = snapshot.players.map((player) => ({
      seat: player.seat,
      name: player.name,
      avatarId: player.avatarId,
      kind: player.isBot ? ('bot' as const) : ('friend' as const),
      key: player.isBot ? botKey(player.avatarId) : friendKey(`seat-${player.seat}`),
    }));
    const record = buildMatchRecord({
      id,
      at: Date.now(),
      game: 'hearts',
      mode: snapshot.mode,
      result: matchResultFrom(snapshot),
      localSeat: 0,
      seats,
    });
    if (record) recordMatch(record);
    setLastMatch({
      id,
      result: matchResultFrom(snapshot),
      seats,
      game: 'hearts',
      mode: snapshot.mode,
      localSeat: 0,
    });
    registerPlayAgain(() => router.push('/hearts/table'));
    handOffToPodium(900, () => router.push('/match-end'));
  }, [recordMatch, recordResult, registerPlayAgain, router, setLastMatch, snapshot, transport]);

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

/** The podium wants the whole match, not just the last hand. */
function matchResultFrom(snapshot: HeartsSnapshot) {
  if (snapshot.matchResult) return snapshot.matchResult;
  return snapshot.handResult ?? { winner: null, rankings: [], reason: 'hand-complete' };
}

function ActiveMultiplayerHeartsTable({ room }: { room: MultiplayerRoomSession }) {
  const router = useWipeRouter();
  const setLastMatch = useMatchFlowStore((state) => state.setLastMatch);
  const registerPlayAgain = useMatchFlowStore((state) => state.registerPlayAgain);
  const handOffToPodium = usePodiumHandoff();
  const recordResult = useProfileStore((state) => state.recordResult);
  const recordMatch = useHistoryStore((state) => state.recordMatch);
  const reportedMatch = useRef(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const snapshot = useSyncExternalStore(room.subscribe, room.getSnapshot, room.getSnapshot);
  const session = multiplayerSession<HeartsState, HeartsRules>(snapshot, 'hearts');
  const localSeat = snapshot.localSeat;

  const dispatch = useCallback(
    (move: string, payload?: unknown) => {
      try {
        room.send(move, payload);
        setLocalError(null);
      } catch (caught) {
        setLocalError(caught instanceof Error ? caught.message : 'The move could not be sent.');
      }
    },
    [room],
  );

  useEffect(() => {
    if (!session?.result || localSeat === null || reportedMatch.current) return;
    reportedMatch.current = true;
    const mode = heartsModeForRules(session.config);
    const id = `multiplayer:${snapshot.room?.code ?? 'room'}:${session.seed}:${
      session.lastAppliedHash ?? session.log.length
    }`;
    recordResult({ won: session.result.winner === localSeat, blitzes: 0, knocks: 0, knockWins: 0 });
    const seats = snapshot.seats.map((seat) => ({
      seat: seat.seat,
      name: seat.name,
      avatarId: seat.avatarId,
      kind: 'friend' as const,
      key: friendKey(seat.profileId),
    }));
    const record = buildMatchRecord({
      id,
      at: Date.now(),
      game: 'hearts',
      mode,
      result: session.result,
      localSeat,
      seats,
    });
    if (record) recordMatch(record);
    setLastMatch({
      id,
      result: session.result,
      seats,
      game: 'hearts',
      mode,
      localSeat,
    });
    registerPlayAgain(() => {
      router.push('/hearts/create');
    });
    handOffToPodium(900, () => {
      room.close();
      clearActiveMultiplayerSession();
      router.push('/match-end');
    });
  }, [
    localSeat,
    recordMatch,
    recordResult,
    registerPlayAgain,
    room,
    router,
    session,
    setLastMatch,
    snapshot.room?.code,
    snapshot.seats,
  ]);

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
  const mode = heartsModeForRules(session.config);

  return (
    <HeartsTableScreen
      view={heartsTableView({
        mode,
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
        room.close();
        clearActiveMultiplayerSession();
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
