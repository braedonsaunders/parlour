'use client';

import { useWipeRouter } from '@/hooks/useWipeRouter';
import { useState } from 'react';
import { palaceConfig } from '@parlour/game-palace';
import { RuleSettings } from '@/components/settings/RuleSettings';
import {
  BotDifficultyPicker,
  GameSetupScreen,
  SeatPicker,
  SetupPanel,
  SetupTableActions,
} from '@/components/setup';
import { getGame } from '@/lib/games';
import { useT } from '@/lib/i18n';
import { useLocalizedGame, useLocalizedModes, useLocalizedSchema } from '@/lib/i18n/gameContent';
import { PALACE_MODES } from '@/lib/palace/modes';
import { palaceRulesFor, usePalaceSetupStore } from '@/stores/palaceSetup';

const SEAT_OPTIONS = getGame('palace').seats;

export default function PalaceSetupPage() {
  const router = useWipeRouter();
  const mode = usePalaceSetupStore((s) => s.mode);
  const seats = usePalaceSetupStore((s) => s.seats);
  const botTier = usePalaceSetupStore((s) => s.botTier);
  const setMode = usePalaceSetupStore((s) => s.setMode);
  const setSeats = usePalaceSetupStore((s) => s.setSeats);
  const setBotTier = usePalaceSetupStore((s) => s.setBotTier);
  const overrides = usePalaceSetupStore((s) => s.overrides);
  const setRule = usePalaceSetupStore((s) => s.setRule);
  const resetRules = usePalaceSetupStore((s) => s.resetRules);
  const [starting, setStarting] = useState(false);
  const t = useT();
  const shelfEntry = useLocalizedGame('palace');
  const modes = useLocalizedModes('palace', PALACE_MODES);
  const schema = useLocalizedSchema('palace', palaceConfig);

  const startSolo = () => {
    if (starting) return;
    setStarting(true);
    router.push('/palace/table');
  };

  return (
    <GameSetupScreen
      title={shelfEntry.name}
      eyebrow="setup.eyebrow.emptyEveryLayer"
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
          hint={t.count('setup.youPlusBots', seats - 1)}
        />
        <BotDifficultyPicker value={botTier} onChange={setBotTier} />
      </SetupPanel>

      <RuleSettings
        schema={schema}
        values={palaceRulesFor(mode, overrides)}
        onChange={setRule}
        onReset={resetRules}
      />

      <SetupTableActions
        busy={starting}
        soloBusyLabel={t('setup.busy.cuttingDeck')}
        onSolo={startSolo}
        createHref="/palace/create"
        createTestId="create-palace-room"
        note={t('setup.note.friendRooms')}
      />
    </GameSetupScreen>
  );
}
