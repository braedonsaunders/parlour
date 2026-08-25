'use client';

import { useWipeRouter } from '@/hooks/useWipeRouter';
import { useState } from 'react';
import { GameArt } from '@/components/GameArt';
import {
  BotDifficultyPicker,
  GameSetupScreen,
  SetupActions,
  SetupFact,
  SetupPanel,
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

      <SetupActions
        busy={starting}
        actions={[
          {
            label: t('setup.playSolo'),
            busyLabel: t('setup.busy.shuffling'),
            onClick: startSolo,
            testId: 'deal-me-in',
          },
          {
            label: t('setup.createFriendRoom'),
            tone: 'teal',
            onClick: () => router.push('/euchre/create'),
            testId: 'create-euchre-room',
          },
          { label: t('setup.joinWithCode'), tone: 'ghost', href: '/join' },
        ]}
        note={t('setup.note.friendRooms')}
      />
    </GameSetupScreen>
  );
}
