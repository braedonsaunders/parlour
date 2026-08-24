'use client';

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { useWipeRouter } from '@/hooks/useWipeRouter';
import {
  wildpileDiscardAllCards,
  type WildpileColor,
  type WildpileRules,
  type WildpileState,
} from '@parlour/game-wildpile';
import { WildTableScreen } from '@/components/table/wild/WildTableScreen';
import { useSoloTable } from '@/lib/table/useSoloTable';
import { usePodiumHandoff } from '@/lib/table/usePodiumHandoff';
import { WildTransport, type WildSnapshot } from '@/lib/solo/WildTransport';
import { wildModeForRules } from '@/lib/wild/modes';
import { wildTableView } from '@/lib/wild/view';
import { botKey, buildMatchRecord, friendKey, useHistoryStore } from '@/stores/history';
import { useMatchFlowStore } from '@/stores/matchFlow';
import { useProfileStore } from '@/stores/profile';
import { useWildSetupStore, wildRulesFor } from '@/stores/wildSetup';
import {
  clearActiveMultiplayerSession,
  getActiveMultiplayerSession,
  subscribeActiveMultiplayerSession,
  multiplayerSession,
  type MultiplayerRoomSession,
} from '../../_multiplayer/roomSession';

export default function WildTablePage() {
  const multiplayer = useSyncExternalStore(
    subscribeActiveMultiplayerSession,
    getActiveMultiplayerSession,
    () => null,
  );
  if (multiplayer?.getSnapshot().gameId === 'wildpile') {
    return <ActiveMultiplayerWildTable room={multiplayer} />;
  }
  return <SoloWildTablePage />;
}

function SoloWildTablePage() {
  const mode = useWildSetupStore((state) => state.mode);
  const seats = useWildSetupStore((state) => state.seats);
  const overrides = useWildSetupStore((state) => state.overrides);
  const botTier = useWildSetupStore((state) => state.botTier);
  const name = useProfileStore((state) => state.name);
  const avatarId = useProfileStore((state) => state.avatarId);
  const [transport, setTransport] = useState<WildTransport | null>(null);
  const rules = wildRulesFor(mode, overrides);
  const rulesKey = JSON.stringify(rules);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setTransport(
        new WildTransport({
          mode,
          seats,
          seed: Date.now() | 0,
          player: { name, avatarId },
          botTier,
          rules: JSON.parse(rulesKey) as typeof rules,
        }),
      );
    }, 0);
    return () => window.clearTimeout(timer);
    // rulesKey stands in for the rules object so a fresh identity per render
    // does not re-deal the table.
  }, [avatarId, botTier, mode, name, seats, rulesKey]);

  if (!transport) return <WildTableScreen view={null} fx={[]} fxKey="loading" />;
  return <ActiveWildTable transport={transport} />;
}

function ActiveMultiplayerWildTable({ room }: { room: MultiplayerRoomSession }) {
  const router = useWipeRouter();
  const setLastMatch = useMatchFlowStore((state) => state.setLastMatch);
  const registerPlayAgain = useMatchFlowStore((state) => state.registerPlayAgain);
  const recordResult = useProfileStore((state) => state.recordResult);
  const recordMatch = useHistoryStore((state) => state.recordMatch);
  const snapshot = useSyncExternalStore(room.subscribe, room.getSnapshot, room.getSnapshot);
  const reportedMatch = useRef(false);
  const handOffToPodium = usePodiumHandoff();
  const [startedAtMs] = useState(() => Date.now());
  const [localError, setLocalError] = useState<string | null>(null);
  const session = multiplayerSession<WildpileState, WildpileRules>(snapshot, 'wildpile');
  const localSeat = snapshot.localSeat;
  const matchEndsAt = startedAtMs + (session?.config.matchTimeMinutes ?? 5) * 60_000;

  const dispatch = useCallback(
    (move: string, payload?: unknown, reveals?: readonly string[]) => {
      try {
        room.send(move, payload, reveals);
        setLocalError(null);
      } catch (error) {
        setLocalError(error instanceof Error ? error.message : 'The move could not be sent.');
      }
    },
    [room],
  );

  useEffect(() => {
    if (!snapshot.isHost || session?.status !== 'playing' || session.phase.actor === null) return;
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
    room,
    session?.config.turnTimeSeconds,
    session?.log.length,
    session?.phase.actor,
    session?.status,
    snapshot.isHost,
  ]);

  useEffect(() => {
    if (!snapshot.isHost || session?.status !== 'playing') return;
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
  }, [matchEndsAt, room, session?.status, snapshot.isHost]);

  useEffect(() => {
    if (!session?.result || localSeat === null || reportedMatch.current) return;
    reportedMatch.current = true;
    const mode = wildModeForRules(session.config);
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
      game: 'wild',
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
      game: 'wild',
      mode,
      localSeat,
    });
    registerPlayAgain(() => {
      router.push('/wild/create');
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
      <WildTableScreen
        view={null}
        fx={snapshot.fx}
        fxKey={snapshot.fxKey}
        error={localError ?? snapshot.error}
      />
    );
  }

  const isLocalTurn = session.status === 'playing' && session.phase.actor === localSeat;
  const legal = isLocalTurn ? session.def.flow.legalMoves(session.state, session.phase) : [];
  const mode = wildModeForRules(session.config);
  const wildSnapshot: WildSnapshot = {
    mode,
    players: snapshot.seats.map((player) => ({
      seat: player.seat,
      name: player.name,
      avatarId: player.avatarId,
      isBot: player.bot,
    })),
    session,
    matchWinner: session.result?.winner ?? null,
  };
  const playCard = (card: string) => {
    const cards = session.state.hands[localSeat] ?? [];
    dispatch('playCard', { card }, wildpileDiscardAllCards(cards, card));
  };

  return (
    <WildTableScreen
      view={wildTableView(wildSnapshot, legal, localSeat)}
      matchEndsAt={matchEndsAt}
      turnDurationMs={session.config.turnTimeSeconds * 1_000}
      turnClockKey={`${session.log.length}:${session.phase.actor ?? 'ended'}`}
      fx={snapshot.fx}
      fxKey={snapshot.fxKey}
      busy={!isLocalTurn}
      error={localError ?? snapshot.error}
      onPlay={playCard}
      onDraw={() => dispatch('draw')}
      onChooseColor={(color: WildpileColor) => dispatch('chooseColor', { color })}
      onDeclineJump={() => dispatch('declineJump')}
      onCallLastCard={() => dispatch('callLastCard')}
      onChooseTarget={(seat: number) => dispatch('chooseTarget', { seat })}
      onPass={() => dispatch('pass')}
      onChallengeDrawFour={() => dispatch('challengeDrawFour')}
      onQuit={() => {
        room.close();
        clearActiveMultiplayerSession();
        router.push('/wild');
      }}
    />
  );
}

function ActiveWildTable({ transport }: { transport: WildTransport }) {
  const router = useWipeRouter();
  const setLastMatch = useMatchFlowStore((state) => state.setLastMatch);
  const registerPlayAgain = useMatchFlowStore((state) => state.registerPlayAgain);
  const recordResult = useProfileStore((state) => state.recordResult);
  const recordMatch = useHistoryStore((state) => state.recordMatch);
  const reportedMatch = useRef<WildTransport | null>(null);
  const handOffToPodium = usePodiumHandoff();
  const botPaceMs = useCallback(
    (current: WildSnapshot) =>
      current.session.phase.phase === 'play' ? 480 + (current.session.phase.actor ?? 0) * 90 : 240,
    [],
  );
  // `round` feeds the bot-turn effect's dependency list, so an inline arrow
  // re-armed the bot's think timer on every render of this table.
  const round = useCallback((current: WildSnapshot) => current.session, []);
  const { snapshot, fx, fxKey, error, dispatch, accept } = useSoloTable(transport, {
    round,
    botPaceMs,
  });
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

  useEffect(() => {
    if (snapshot.matchWinner === null || reportedMatch.current === transport) return;
    if (!snapshot.session.result) return;
    reportedMatch.current = transport;
    recordResult({ won: snapshot.matchWinner === 0, blitzes: 0, knocks: 0, knockWins: 0 });
    const id = crypto.randomUUID();
    const seats = snapshot.players.map((player) => ({
      seat: player.seat,
      name: player.name,
      avatarId: player.avatarId,
      kind: player.isBot ? ('bot' as const) : ('friend' as const),
      key: player.isBot ? botKey(player.avatarId) : friendKey('local-wild-player'),
    }));
    const record = buildMatchRecord({
      id,
      at: Date.now(),
      game: 'wild',
      mode: snapshot.mode,
      result: snapshot.session.result,
      localSeat: 0,
      seats,
    });
    if (record) recordMatch(record);
    setLastMatch({
      id,
      result: snapshot.session.result,
      seats,
      game: 'wild',
      mode: snapshot.mode,
      localSeat: 0,
    });
    registerPlayAgain(() => router.push('/wild/table'));
    handOffToPodium(900, () => router.push('/match-end'));
  }, [recordMatch, recordResult, registerPlayAgain, router, setLastMatch, snapshot, transport]);

  const view = wildTableView(snapshot, transport.legalMoves());

  return (
    <WildTableScreen
      view={view}
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
      onQuit={() => router.push('/wild')}
    />
  );
}
