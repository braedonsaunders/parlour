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
import { SPADES_MODES } from '@/lib/spades/modes';
import { getGameMode } from '@/lib/games';
import { useT } from '@/lib/i18n';
import { useLocalizedGame, useLocalizedModes } from '@/lib/i18n/gameContent';
import { useSpadesSetupStore } from '@/stores/spadesSetup';

export default function SpadesSetupPage() {
  const router = useWipeRouter();
  const mode = useSpadesSetupStore((s) => s.mode);
  const botTier = useSpadesSetupStore((s) => s.botTier);
  const setMode = useSpadesSetupStore((s) => s.setMode);
  const setBotTier = useSpadesSetupStore((s) => s.setBotTier);
  const [starting, setStarting] = useState(false);
  const t = useT();
  const shelfEntry = useLocalizedGame('spades');
  const modes = useLocalizedModes('spades', SPADES_MODES);

  const startSolo = () => {
    if (starting) return;
    setStarting(true);
    router.push('/spades/table');
  };

  return (
    <GameSetupScreen
      title={shelfEntry.name}
      eyebrow="setup.eyebrow.pickTable"
      modes={modes}
      selected={mode}
      onSelect={(id) => setMode(id as typeof mode)}
      renderArt={(def) => <GameArt cards={getGameMode('spades', def.id).art} />}
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
            onClick: () => router.push('/spades/create'),
            testId: 'create-spades-room',
          },
          { label: t('setup.joinWithCode'), tone: 'ghost', href: '/join' },
        ]}
        note={t('setup.note.friendRooms')}
      />
    </GameSetupScreen>
  );
}
