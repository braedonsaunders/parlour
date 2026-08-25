'use client';

import { useWipeRouter } from '@/hooks/useWipeRouter';
import { useState } from 'react';
import { presidentConfig } from '@parlour/game-president';
import { RuleSettings } from '@/components/settings/RuleSettings';
import {
  BotDifficultyPicker,
  GameSetupScreen,
  SeatPicker,
  SetupActions,
  SetupPanel,
} from '@/components/setup';
import { getGame } from '@/lib/games';
import { useT } from '@/lib/i18n';
import { useLocalizedGame, useLocalizedModes, useLocalizedSchema } from '@/lib/i18n/gameContent';
import { PRESIDENT_MODES } from '@/lib/president/modes';
import { presidentRulesFor, usePresidentSetupStore } from '@/stores/presidentSetup';

const SEAT_OPTIONS = getGame('president').seats;

export default function PresidentSetupPage() {
  const router = useWipeRouter();
  const mode = usePresidentSetupStore((s) => s.mode);
  const seats = usePresidentSetupStore((s) => s.seats);
  const botTier = usePresidentSetupStore((s) => s.botTier);
  const setMode = usePresidentSetupStore((s) => s.setMode);
  const setSeats = usePresidentSetupStore((s) => s.setSeats);
  const setBotTier = usePresidentSetupStore((s) => s.setBotTier);
  const overrides = usePresidentSetupStore((s) => s.overrides);
  const setRule = usePresidentSetupStore((s) => s.setRule);
  const resetRules = usePresidentSetupStore((s) => s.resetRules);
  const [starting, setStarting] = useState(false);
  const t = useT();
  const shelfEntry = useLocalizedGame('president');
  const modes = useLocalizedModes('president', PRESIDENT_MODES);
  const schema = useLocalizedSchema('president', presidentConfig);

  const startSolo = () => {
    if (starting) return;
    setStarting(true);
    router.push('/president/table');
  };

  return (
    <GameSetupScreen
      title={shelfEntry.name}
      eyebrow="setup.eyebrow.claimCrown"
      help={{ doc: shelfEntry.howToPlay, subtitle: shelfEntry.subtitle }}
      modes={modes}
      modesLabel="setup.matchFormat"
      selected={mode}
      onSelect={(id) => setMode(id as typeof mode)}
    >
      <SetupPanel>
        <SeatPicker
          options={SEAT_OPTIONS}
          value={seats}
          onChange={setSeats}
          hint={t('setup.youPlusPresident', { count: seats - 1 })}
        />
        <BotDifficultyPicker value={botTier} onChange={setBotTier} />
      </SetupPanel>

      <RuleSettings
        schema={schema}
        values={presidentRulesFor(mode, overrides)}
        onChange={setRule as (key: string, value: string | number | boolean) => void}
        onReset={resetRules}
      />

      <SetupActions
        busy={starting}
        actions={[
          {
            label: t('setup.playSolo'),
            busyLabel: t('setup.busy.cuttingDeck'),
            onClick: startSolo,
            testId: 'deal-me-in',
          },
          {
            label: t('setup.createFriendRoom'),
            tone: 'teal',
            onClick: () => router.push('/president/create'),
            testId: 'create-president-room',
          },
          { label: t('setup.joinWithCode'), tone: 'ghost', href: '/join' },
        ]}
        note={t('setup.note.friendRoomsEight')}
      />
    </GameSetupScreen>
  );
}
