'use client';

import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { useWipeRouter } from '@/hooks/useWipeRouter';
import {
  wildpileDiscardAllCards,
  type WildpileColor,
  type WildpileRules,
  type WildpileState,
} from '@parlour/game-wildpile';
import { WildTableScreen } from '@/components/table/wild/WildTableScreen';
import { useSoloTable } from '@/lib/table/useSoloTable';
import { WildTransport, type WildSnapshot } from '@/lib/solo/WildTransport';
import { wildModeForRules } from '@/lib/wild/modes';
import { wildTableView } from '@/lib/wild/view';
import {
  leaveRoom,
  roomMatchId,
  roomSeats,
  soloSeats,
  useMatchReport,
  useMultiplayerRoom,
  useSoloTransport,
} from '@/lib/table/useGameTable';
import { useProfileStore } from '@/stores/profile';
import { useWildSetupStore, wildRulesFor } from '@/stores/wildSetup';
import { multiplayerSession, type MultiplayerRoomSession } from '../../_multiplayer/roomSession';

export default function WildTablePage() {
  const room = useMultiplayerRoom('wildpile');
  if (room) return <ActiveMultiplayerWildTable room={room} />;
  return <SoloWildTablePage />;
}

function SoloWildTablePage() {
  const mode = useWildSetupStore((state) => state.mode);
  const seats = useWildSetupStore((state) => state.seats);
  const overrides = useWildSetupStore((state) => state.overrides);
  const botTier = useWildSetupStore((state) => state.botTier);
  const name = useProfileStore((state) => state.name);
  const avatarId = useProfileStore((state) => state.avatarId);
  const rules = wildRulesFor(mode, overrides);
  const rulesKey = JSON.stringify(rules);

  const transport = useSoloTransport(
    () =>
      new WildTransport({
        mode,
        seats,
        seed: Date.now() | 0,
        player: { name, avatarId },
        botTier,
        rules: JSON.parse(rulesKey) as typeof rules,
      }),
    [avatarId, botTier, mode, name, rulesKey, seats],
  );

  if (!transport) return <WildTableScreen view={null} fx={[]} fxKey="loading" />;
  return <ActiveWildTable transport={transport} />;
}

function ActiveMultiplayerWildTable({ room }: { room: MultiplayerRoomSession }) {
  const router = useWipeRouter();
  const snapshot = useSyncExternalStore(room.subscribe, room.getSnapshot, room.getSnapshot);
  const [startedAtMs] = useState(() => Date.now());
  const session = multiplayerSession<WildpileState, WildpileRules>(snapshot, 'wildpile');
  const localSeat = snapshot.localSeat;
  const roomMode = session ? wildModeForRules(session.config) : 'classic';
  const matchEndsAt = startedAtMs + (session?.config.matchTimeMinutes ?? 5) * 60_000;

  // Wild's send carries a third argument (the Veil reveals for the card being
  // played), so it keeps its own wrapper rather than using `useRoomDispatch`.
  const [localError, setLocalError] = useState<string | null>(null);
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

  useMatchReport({
    result: session?.result ?? null,
    game: 'wild',
    mode: roomMode,
    localSeat,
    seats: roomSeats(snapshot.seats),
    id: session ? roomMatchId(snapshot.room?.code, session) : '',
    playAgain: () => router.push('/wild/create'),
    onLeave: () => leaveRoom(room),
  });

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
        leaveRoom(room);
        router.push('/wild');
      }}
    />
  );
}

function ActiveWildTable({ transport }: { transport: WildTransport }) {
  const router = useWipeRouter();
  const botPaceMs = useCallback(
    (current: WildSnapshot) =>
      current.session.phase.phase === 'play' ? 480 + (current.session.phase.actor ?? 0) * 90 : 240,
    [],
  );
  const { snapshot, fx, fxKey, error, dispatch, accept } = useSoloTable(transport, {
    round: (current) => current.session,
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

  useMatchReport({
    result: snapshot.matchWinner === null ? null : (snapshot.session.result ?? null),
    game: 'wild',
    mode: snapshot.mode,
    localSeat: 0,
    seats: soloSeats(snapshot.players),
    id: `solo:wild:${snapshot.session.seed}`,
    won: snapshot.matchWinner === 0,
    playAgain: () => router.push('/wild/table'),
  });

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
