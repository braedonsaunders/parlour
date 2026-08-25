'use client';

import { useState } from 'react';
import { useWipeRouter } from '@/hooks/useWipeRouter';
import { GameArt } from '@/components/GameArt';
import {
  BotDifficultyPicker,
  GameSetupScreen,
  SeatPicker,
  SetupPanel,
  SetupTableActions,
} from '@/components/setup';
import { SPITE_MODES } from '@/lib/spite/modes';
import { getGameMode } from '@/lib/games';
import { useT } from '@/lib/i18n';
import { useLocalizedGame, useLocalizedModes } from '@/lib/i18n/gameContent';
import { SPITE_SEAT_OPTIONS, useSpiteSetupStore } from '@/stores/spiteSetup';

export default function SpiteSetupPage() {
  const router = useWipeRouter();
  const mode = useSpiteSetupStore((s) => s.mode);
  const botTier = useSpiteSetupStore((s) => s.botTier);
  const seats = useSpiteSetupStore((s) => s.seats);
  const setMode = useSpiteSetupStore((s) => s.setMode);
  const setBotTier = useSpiteSetupStore((s) => s.setBotTier);
  const setSeats = useSpiteSetupStore((s) => s.setSeats);
  const [starting, setStarting] = useState(false);
  const t = useT();
  const shelfEntry = useLocalizedGame('spite');
  const modes = useLocalizedModes('spite', SPITE_MODES);

  const startSolo = () => {
    if (starting) return;
    setStarting(true);
    router.push('/spite/table');
  };

  return (
    <GameSetupScreen
      title={shelfEntry.name}
      eyebrow="setup.eyebrow.pickTable"
      modes={modes}
      selected={mode}
      onSelect={(id) => setMode(id as typeof mode)}
      renderArt={(def) => <GameArt cards={getGameMode('spite', def.id).art} />}
    >
      <SetupPanel>
        <SeatPicker
          options={[...SPITE_SEAT_OPTIONS]}
          value={seats}
          onChange={setSeats}
          hint={t('setup.youPlusSpite', { count: seats - 1 })}
        />
        <BotDifficultyPicker value={botTier} onChange={setBotTier} />
      </SetupPanel>

      <SetupTableActions
        busy={starting}
        soloBusyLabel={t('setup.busy.stackingPiles')}
        onSolo={startSolo}
        note={t('setup.note.spite')}
      />
    </GameSetupScreen>
  );
}
