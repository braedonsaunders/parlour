'use client';

import { useWipeRouter } from '@/hooks/useWipeRouter';
import { useState } from 'react';
import { GameArt } from '@/components/GameArt';
import {
  BotDifficultyPicker,
  GameSetupScreen,
  SetupFact,
  SetupPanel,
  SetupTableActions,
} from '@/components/setup';
import { PINOCHLE_MODES } from '@/lib/pinochle/modes';
import { getGameMode } from '@/lib/games';
import { useT } from '@/lib/i18n';
import { useLocalizedGame, useLocalizedModes } from '@/lib/i18n/gameContent';
import { usePinochleSetupStore } from '@/stores/pinochleSetup';

export default function PinochleSetupPage() {
  const router = useWipeRouter();
  const mode = usePinochleSetupStore((s) => s.mode);
  const botTier = usePinochleSetupStore((s) => s.botTier);
  const setMode = usePinochleSetupStore((s) => s.setMode);
  const setBotTier = usePinochleSetupStore((s) => s.setBotTier);
  const [starting, setStarting] = useState(false);
  const t = useT();
  const shelfEntry = useLocalizedGame('pinochle');
  const modes = useLocalizedModes('pinochle', PINOCHLE_MODES);

  const startSolo = () => {
    if (starting) return;
    setStarting(true);
    router.push('/pinochle/table');
  };

  return (
    <GameSetupScreen
      title={shelfEntry.name}
      eyebrow="setup.eyebrow.pickTable"
      modes={modes}
      selected={mode}
      onSelect={(id) => setMode(id as typeof mode)}
      renderArt={(def) => <GameArt cards={getGameMode('pinochle', def.id).art} />}
    >
      <SetupPanel>
        <SetupFact
          label={t('setup.seats')}
          value={t('setup.partnershipsValue')}
          hint={t('setup.partnershipsHint')}
        />
        <BotDifficultyPicker value={botTier} onChange={setBotTier} />
      </SetupPanel>

      <SetupTableActions
        busy={starting}
        soloBusyLabel={t('setup.busy.shuffling')}
        onSolo={startSolo}
        createHref="/pinochle/create"
        createTestId="create-pinochle-room"
        note={t('setup.note.pinochle')}
      />
    </GameSetupScreen>
  );
}
