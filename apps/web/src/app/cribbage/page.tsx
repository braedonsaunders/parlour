'use client';

import { useWipeRouter } from '@/hooks/useWipeRouter';
import { useState } from 'react';
import { cribbageConfigSchema } from '@parlour/game-cribbage';
import { RuleSettings } from '@/components/settings/RuleSettings';
import {
  BotDifficultyPicker,
  GameSetupScreen,
  SetupActions,
  SetupFact,
  SetupPanel,
} from '@/components/setup';
import { CRIBBAGE_MODES } from '@/lib/cribbage/modes';
import { useT } from '@/lib/i18n';
import { useLocalizedGame, useLocalizedModes, useLocalizedSchema } from '@/lib/i18n/gameContent';
import { cribbageRulesFor, useCribbageSetupStore } from '@/stores/cribbageSetup';

export default function CribbageSetupPage() {
  const router = useWipeRouter();
  const mode = useCribbageSetupStore((state) => state.mode);
  const botTier = useCribbageSetupStore((state) => state.botTier);
  const overrides = useCribbageSetupStore((state) => state.overrides);
  const setMode = useCribbageSetupStore((state) => state.setMode);
  const setBotTier = useCribbageSetupStore((state) => state.setBotTier);
  const setRule = useCribbageSetupStore((state) => state.setRule);
  const resetRules = useCribbageSetupStore((state) => state.resetRules);
  const [starting, setStarting] = useState(false);
  const t = useT();
  const shelfEntry = useLocalizedGame('cribbage');
  const modes = useLocalizedModes('cribbage', CRIBBAGE_MODES);
  const schema = useLocalizedSchema('cribbage', cribbageConfigSchema);
  const rules = cribbageRulesFor(mode, overrides);
  const matchPlay = rules.gamesToWin > 1;

  const startSolo = () => {
    if (starting) return;
    setStarting(true);
    router.push('/cribbage/table');
  };

  return (
    <GameSetupScreen
      title={shelfEntry.name}
      eyebrow="setup.eyebrow.chooseBoard"
      help={{ doc: shelfEntry.howToPlay, subtitle: shelfEntry.subtitle }}
      modes={modes}
      modesLabel="setup.modes.cribbageFormat"
      selected={mode}
      onSelect={(id) => setMode(id as typeof mode)}
    >
      <SetupPanel>
        <SetupFact
          label={t('setup.table')}
          value={t('setup.cribbageSeats')}
          hint={t('setup.cribbageHint')}
        />
        <BotDifficultyPicker value={botTier} onChange={setBotTier} />
      </SetupPanel>

      <RuleSettings
        schema={schema}
        values={rules}
        onChange={setRule}
        onReset={resetRules}
        label={t('setup.houseRules')}
      />

      <SetupActions
        busy={starting}
        actions={[
          {
            label: matchPlay ? t('setup.startSoloMatch') : t('setup.playSolo'),
            busyLabel: t('setup.busy.settingPegs'),
            onClick: startSolo,
            testId: 'deal-me-in',
          },
          {
            label: t('setup.createFriendRoom'),
            tone: 'teal',
            onClick: () => router.push('/cribbage/create'),
            disabled: matchPlay,
            title: matchPlay ? t('setup.cribbageRoomsLocked') : undefined,
            testId: 'create-cribbage-room',
          },
          { label: t('setup.joinWithCode'), tone: 'ghost', href: '/join' },
        ]}
        note={matchPlay ? t('setup.note.cribbageMatch') : t('setup.note.cribbage')}
      />
    </GameSetupScreen>
  );
}
