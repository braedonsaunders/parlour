'use client';

import type { OhHellRules, OhHellState } from '@parlour/game-ohhell';
import { OhHellTableScreen } from '@/components/table/ohhell/OhHellTableScreen';
import { defineTablePack, turnBasedDriver } from '@/components/table/GameTablePage';
import { ohhellTableView } from '@/lib/ohhell/view';
import {
  OhHellTransport,
  type OhHellDispatch,
  type OhHellSnapshot,
} from '@/lib/solo/OhHellTransport';
import { botKey, friendKey } from '@/stores/history';
import { useProfileStore } from '@/stores/profile';
import { useOhHellSetupStore } from '@/stores/ohhellSetup';

export const ohhellTablePack = defineTablePack<
  OhHellSnapshot,
  OhHellDispatch,
  OhHellTransport,
  OhHellState,
  OhHellRules
>({
  id: 'ohhell',
  gameId: 'ohhell',

  useSoloDeal() {
    const mode = useOhHellSetupStore((state) => state.mode);
    const botTier = useOhHellSetupStore((state) => state.botTier);
    const seats = useOhHellSetupStore((state) => state.seats);
    const name = useProfileStore((state) => state.name);
    const avatarId = useProfileStore((state) => state.avatarId);
    return {
      create: () =>
        new OhHellTransport({
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
    round: (snapshot) => snapshot.match.round,
    // Bidding is a conversation; the play of a trick keeps a steadier beat.
    botPaceMs: (current) => (current.match.round.state.stage === 'bidding' ? 520 : 430),
  }),

  renderPending: ({ fx, fxKey, error }) => (
    <OhHellTableScreen view={null} fx={fx} fxKey={fxKey} error={error} />
  ),

  renderSolo({ snapshot, fx, fxKey, error, dispatch, transport, quit }) {
    const view = ohhellTableView(snapshot, transport.legalMoves(0), 0);
    return (
      <OhHellTableScreen
        view={view}
        fx={fx}
        fxKey={fxKey}
        busy={view.decision === null}
        error={error}
        onBid={(bid) => dispatch('bid', { bid })}
        onPlay={(card) => dispatch('playCard', { card })}
        onChooseTrump={(suit) => dispatch('chooseTrump', { suit })}
        onQuit={quit}
      />
    );
  },

  soloReport({ snapshot, push }) {
    const result = snapshot.match.result;
    if (!result) return null;
    return {
      id: crypto.randomUUID(),
      game: 'ohhell',
      mode: snapshot.mode,
      result,
      localSeat: 0,
      won: result.winner === 0,
      seats: snapshot.players.map((player) => ({
        seat: player.seat,
        name: player.name,
        avatarId: player.avatarId,
        kind: player.isBot ? ('bot' as const) : ('friend' as const),
        key: player.isBot ? botKey(player.avatarId) : friendKey('local-ohhell-player'),
      })),
      onPlayAgain: () => push('/ohhell/table'),
      onFinish: () => push('/match-end'),
    };
  },
});
