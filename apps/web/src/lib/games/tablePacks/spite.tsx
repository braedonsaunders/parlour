'use client';

import type { SpiteRules, SpiteState } from '@parlour/game-spite';
import { SpiteTableScreen } from '@/components/table/spite/SpiteTableScreen';
import { defineTablePack, turnBasedDriver } from '@/components/table/GameTablePage';
import { spiteTableView } from '@/lib/spite/view';
import { SpiteTransport, type SpiteDispatch, type SpiteSnapshot } from '@/lib/solo/SpiteTransport';
import { botKey, friendKey } from '@/stores/history';
import { useProfileStore } from '@/stores/profile';
import { useSpiteSetupStore } from '@/stores/spiteSetup';

export const spiteTablePack = defineTablePack<
  SpiteSnapshot,
  SpiteDispatch,
  SpiteTransport,
  SpiteState,
  SpiteRules
>({
  id: 'spite',
  gameId: 'spite',

  useSoloDeal() {
    const mode = useSpiteSetupStore((state) => state.mode);
    const botTier = useSpiteSetupStore((state) => state.botTier);
    const seats = useSpiteSetupStore((state) => state.seats);
    const name = useProfileStore((state) => state.name);
    const avatarId = useProfileStore((state) => state.avatarId);
    return {
      create: () =>
        new SpiteTransport({
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
    // A bot turn is often a long run of builds; keep each one readable.
    botPaceMs: () => 380,
  }),

  renderPending: ({ fx, fxKey, error }) => (
    <SpiteTableScreen view={null} fx={fx} fxKey={fxKey} error={error} />
  ),

  renderSolo({ snapshot, fx, fxKey, error, dispatch, transport, quit }) {
    const view = spiteTableView(snapshot, transport.legalMoves(), 0);
    return (
      <SpiteTableScreen
        view={view}
        fx={fx}
        fxKey={fxKey}
        busy={!view.yourTurn}
        error={error}
        onBuild={(card, pile, rank) => dispatch('build', { card, pile, rank })}
        onDiscard={(card, pile) => dispatch('discard', { card, pile })}
        onQuit={quit}
      />
    );
  },

  soloReport({ snapshot, push }) {
    if (!snapshot.session.result) return null;
    return {
      id: crypto.randomUUID(),
      game: 'spite',
      mode: snapshot.mode,
      result: snapshot.session.result,
      localSeat: 0,
      won: snapshot.won === true,
      seats: snapshot.players.map((player) => ({
        seat: player.seat,
        name: player.name,
        avatarId: player.avatarId,
        kind: player.isBot ? ('bot' as const) : ('friend' as const),
        key: player.isBot ? botKey(player.avatarId) : friendKey('local-spite-player'),
      })),
      onPlayAgain: () => push('/spite/table'),
      onFinish: () => push('/match-end'),
    };
  },
});
