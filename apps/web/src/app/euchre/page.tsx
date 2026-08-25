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
import { EUCHRE_MODES } from '@/lib/euchre/modes';
import { getGameMode } from '@/lib/games';
import { useT } from '@/lib/i18n';
import { useLocalizedGame, useLocalizedModes } from '@/lib/i18n/gameContent';
import { useEuchreSetupStore } from '@/stores/euchreSetup';

export default function EuchreSetupPage() {
  const router = useWipeRouter();
  const mode = useEuchreSetupStore((s) => s.mode);
  const botTier = useEuchreSetupStore((s) => s.botTier);
  const setMode = useEuchreSetupStore((s) => s.setMode);
  const setBotTier = useEuchreSetupStore((s) => s.setBotTier);
  const [starting, setStarting] = useState(false);
  const t = useT();
  const shelfEntry = useLocalizedGame('euchre');
  const modes = useLocalizedModes('euchre', EUCHRE_MODES);

  const startSolo = () => {
    if (starting) return;
    setStarting(true);
    router.push('/euchre/table');
  };

  return (
    <GameSetupScreen
      title={shelfEntry.name}
      eyebrow="setup.eyebrow.pickTable"
      modes={modes}
      selected={mode}
      onSelect={(id) => setMode(id as typeof mode)}
      renderArt={(def) => <GameArt cards={getGameMode('euchre', def.id).art} />}
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
        createHref="/euchre/create"
        createTestId="create-euchre-room"
        note={t('setup.note.friendRooms')}
      />
    </GameSetupScreen>
  );
}
