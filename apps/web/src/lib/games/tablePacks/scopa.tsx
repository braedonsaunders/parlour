'use client';

import type { ScopaRules, ScopaState } from '@parlour/game-scopa';
import { ScopaTableScreen } from '@/components/table/scopa/ScopaTableScreen';
import { defineTablePack, turnBasedDriver } from '@/components/table/GameTablePage';
import { scopaTableView } from '@/lib/scopa/view';
import { ScopaTransport, type ScopaDispatch, type ScopaSnapshot } from '@/lib/solo/ScopaTransport';
import { botKey, friendKey } from '@/stores/history';
import { useProfileStore } from '@/stores/profile';
import { useScopaSetupStore } from '@/stores/scopaSetup';

export const scopaTablePack = defineTablePack<
  ScopaSnapshot,
  ScopaDispatch,
  ScopaTransport,
  ScopaState,
  ScopaRules
>({
  id: 'scopa',
  gameId: 'scopa',

  useSoloDeal() {
    const mode = useScopaSetupStore((state) => state.mode);
    const botTier = useScopaSetupStore((state) => state.botTier);
    const seats = useScopaSetupStore((state) => state.seats);
    const name = useProfileStore((state) => state.name);
    const avatarId = useProfileStore((state) => state.avatarId);
    return {
      create: () =>
        new ScopaTransport({
          mode,
          seats,
          seed: Date.now() | 0,
          player: { name, avatarId },
          botTier,
        }),
      deps: [avatarId, botTier, mode, name, seats],
    };
  },

  useSoloDriver: turnBasedDriver({
    round: (snapshot) => snapshot.session,
    // A capture wants a beat to read: the cards leave the table as they land.
    botPaceMs: () => 520,
  }),

  renderPending: ({ fx, fxKey, error }) => (
    <ScopaTableScreen view={null} fx={fx} fxKey={fxKey} error={error} />
  ),

  renderSolo({ snapshot, fx, fxKey, error, dispatch, transport, quit }) {
    const view = scopaTableView(snapshot, transport.legalMoves(), 0);
    return (
      <ScopaTableScreen
        view={view}
        fx={fx}
        fxKey={fxKey}
        busy={!view.yourTurn}
        error={error}
        onPlay={(card, take) => dispatch('playCard', take.length > 0 ? { card, take } : { card })}
        onQuit={quit}
      />
    );
  },

  soloReport({ snapshot, push }) {
    if (!snapshot.session.result) return null;
    return {
      id: crypto.randomUUID(),
      game: 'scopa',
      mode: snapshot.mode,
      result: snapshot.session.result,
      localSeat: 0,
      won: snapshot.won === true,
      seats: snapshot.players.map((player) => ({
        seat: player.seat,
        name: player.name,
        avatarId: player.avatarId,
        kind: player.isBot ? ('bot' as const) : ('friend' as const),
        key: player.isBot ? botKey(player.avatarId) : friendKey('local-scopa-player'),
      })),
      onPlayAgain: () => push('/scopa/table'),
      onFinish: () => push('/match-end'),
    };
  },
});
