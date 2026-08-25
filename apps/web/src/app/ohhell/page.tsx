'use client';

import { useState } from 'react';
import { MAX_SEATS, MIN_SEATS } from '@parlour/game-ohhell';
import { useWipeRouter } from '@/hooks/useWipeRouter';
import { GameArt } from '@/components/GameArt';
import {
  BotDifficultyPicker,
  GameSetupScreen,
  SeatPicker,
  SetupPanel,
  SetupTableActions,
} from '@/components/setup';
import { OHHELL_MODES } from '@/lib/ohhell/modes';
import { getGameMode } from '@/lib/games';
import { useT } from '@/lib/i18n';
import { useLocalizedGame, useLocalizedModes } from '@/lib/i18n/gameContent';
import { useOhHellSetupStore } from '@/stores/ohhellSetup';

const SEAT_OPTIONS = Array.from(
  { length: MAX_SEATS - MIN_SEATS + 1 },
  (_, index) => MIN_SEATS + index,
);

export default function OhHellSetupPage() {
  const router = useWipeRouter();
  const mode = useOhHellSetupStore((s) => s.mode);
  const botTier = useOhHellSetupStore((s) => s.botTier);
  const seats = useOhHellSetupStore((s) => s.seats);
  const setMode = useOhHellSetupStore((s) => s.setMode);
  const setBotTier = useOhHellSetupStore((s) => s.setBotTier);
  const setSeats = useOhHellSetupStore((s) => s.setSeats);
  const [starting, setStarting] = useState(false);
  const t = useT();
  const shelfEntry = useLocalizedGame('ohhell');
  const modes = useLocalizedModes('ohhell', OHHELL_MODES);

  const startSolo = () => {
    if (starting) return;
    setStarting(true);
    router.push('/ohhell/table');
  };

  return (
    <GameSetupScreen
      title={shelfEntry.name}
      eyebrow="setup.eyebrow.pickTable"
      modes={modes}
      selected={mode}
      onSelect={(id) => setMode(id as typeof mode)}
      renderArt={(def) => <GameArt cards={getGameMode('ohhell', def.id).art} />}
    >
      <SetupPanel>
        <SeatPicker
          options={SEAT_OPTIONS}
          value={seats}
          onChange={setSeats}
          hint={t.count('setup.youPlusOthersHand', seats - 1)}
        />
        <BotDifficultyPicker value={botTier} onChange={setBotTier} />
      </SetupPanel>

      <SetupTableActions
        busy={starting}
        soloBusyLabel={t('setup.busy.cuttingDeal')}
        onSolo={startSolo}
        note={t('setup.note.ohhell')}
      />
    </GameSetupScreen>
  );
}
