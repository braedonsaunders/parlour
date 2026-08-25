'use client';

import { useWipeRouter } from '@/hooks/useWipeRouter';
import { useState } from 'react';
import { ratscrewConfigSchema } from '@parlour/game-ratscrew';
import { getGame } from '@/lib/games';
import { useT } from '@/lib/i18n';
import { useLocalizedGame, useLocalizedModes, useLocalizedSchema } from '@/lib/i18n/gameContent';
import { RuleSettings } from '@/components/settings/RuleSettings';
import {
  BotDifficultyPicker,
  GameSetupScreen,
  SeatPicker,
  SetupActions,
  SetupPanel,
} from '@/components/setup';
import { RATSCREW_MODES } from '@/lib/ratscrew/modes';
import { useRatscrewSetupStore, ratscrewRulesFor } from '@/stores/ratscrewSetup';

const SEAT_OPTIONS = getGame('ratscrew').seats;

export default function RatscrewSetupPage() {
  const router = useWipeRouter();
  const mode = useRatscrewSetupStore((s) => s.mode);
  const seats = useRatscrewSetupStore((s) => s.seats);
  const botTier = useRatscrewSetupStore((s) => s.botTier);
  const setMode = useRatscrewSetupStore((s) => s.setMode);
  const setSeats = useRatscrewSetupStore((s) => s.setSeats);
  const setBotTier = useRatscrewSetupStore((s) => s.setBotTier);
  const overrides = useRatscrewSetupStore((s) => s.overrides);
  const setRule = useRatscrewSetupStore((s) => s.setRule);
  const resetRules = useRatscrewSetupStore((s) => s.resetRules);
  const [starting, setStarting] = useState(false);
  const t = useT();
  const shelfEntry = useLocalizedGame('ratscrew');
  const modes = useLocalizedModes('ratscrew', RATSCREW_MODES);
  const schema = useLocalizedSchema('ratscrew', ratscrewConfigSchema);

  const startSolo = () => {
    if (starting) return;
    setStarting(true);
    router.push('/ratscrew/table');
  };

  return (
    <GameSetupScreen
      title={shelfEntry.name}
      eyebrow="setup.eyebrow.handsOnPile"
      help={{ doc: shelfEntry.howToPlay, subtitle: shelfEntry.subtitle }}
      modes={modes}
      selected={mode}
      onSelect={(id) => setMode(id as typeof mode)}
    >
      <SetupPanel>
        <SeatPicker
          options={SEAT_OPTIONS}
          value={seats}
          onChange={setSeats}
          hint={t.count('setup.youPlusBotsReflexes', seats - 1)}
        />
        <BotDifficultyPicker value={botTier} onChange={setBotTier} />
      </SetupPanel>

      <RuleSettings
        schema={schema}
        values={ratscrewRulesFor(mode, overrides)}
        onChange={setRule}
        onReset={resetRules}
      />

      <SetupActions
        busy={starting}
        actions={[
          {
            label: t('setup.playSolo'),
            busyLabel: t('setup.busy.shufflingStacks'),
            onClick: startSolo,
            testId: 'deal-me-in',
          },
          {
            label: t('setup.createFriendRoom'),
            tone: 'teal',
            onClick: () => router.push('/ratscrew/create'),
            testId: 'create-ratscrew-room',
          },
          { label: t('setup.joinWithCode'), tone: 'ghost', href: '/join' },
        ]}
        note={t('setup.note.ratscrew')}
      />
    </GameSetupScreen>
  );
}
