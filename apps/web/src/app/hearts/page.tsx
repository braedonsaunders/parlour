'use client';

import { useWipeRouter } from '@/hooks/useWipeRouter';
import { useState } from 'react';
import { getGame } from '@/lib/games';
import { useT } from '@/lib/i18n';
import { useLocalizedGame, useLocalizedModes, useLocalizedSchema } from '@/lib/i18n/gameContent';
import { RuleSettings } from '@/components/settings/RuleSettings';
import {
  BotDifficultyPicker,
  GameSetupScreen,
  SetupFact,
  SetupPanel,
  SetupTableActions,
} from '@/components/setup';
import { HEARTS_MODES } from '@/lib/hearts/modes';
import { heartsRulesFor, useHeartsSetupStore } from '@/stores/heartsSetup';

export default function HeartsSetupPage() {
  const router = useWipeRouter();
  const mode = useHeartsSetupStore((s) => s.mode);
  const overrides = useHeartsSetupStore((s) => s.overrides);
  const botTier = useHeartsSetupStore((s) => s.botTier);
  const setMode = useHeartsSetupStore((s) => s.setMode);
  const setBotTier = useHeartsSetupStore((s) => s.setBotTier);
  const setRule = useHeartsSetupStore((s) => s.setRule);
  const resetRules = useHeartsSetupStore((s) => s.resetRules);
  const [starting, setStarting] = useState(false);
  const t = useT();
  const shelfEntry = useLocalizedGame('hearts');
  const modes = useLocalizedModes('hearts', HEARTS_MODES);
  const schema = useLocalizedSchema('hearts', getGame('hearts').configSchema);

  const startSolo = () => {
    if (starting) return;
    setStarting(true);
    router.push('/hearts/table');
  };

  return (
    <GameSetupScreen
      title={shelfEntry.name}
      eyebrow="setup.eyebrow.dodgeEverything"
      help={{ doc: shelfEntry.howToPlay, subtitle: shelfEntry.subtitle }}
      modes={modes}
      selected={mode}
      onSelect={(id) => setMode(id as typeof mode)}
    >
      <SetupPanel>
        <SetupFact
          label={t('setup.seats')}
          value={t('setup.heartsSeats')}
          hint={t('setup.heartsHint')}
        />
        <BotDifficultyPicker value={botTier} onChange={setBotTier} />
      </SetupPanel>

      <RuleSettings
        schema={schema}
        values={heartsRulesFor(mode, overrides)}
        onChange={setRule}
        onReset={resetRules}
      />

      <SetupTableActions
        busy={starting}
        soloBusyLabel={t('setup.busy.shuffling')}
        onSolo={startSolo}
        createHref="/hearts/create"
        createTestId="create-hearts-room"
        note={t('setup.note.hearts')}
      />
    </GameSetupScreen>
  );
}
