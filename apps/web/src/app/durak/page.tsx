'use client';

import { useWipeRouter } from '@/hooks/useWipeRouter';
import { useState } from 'react';
import { durakConfig } from '@parlour/game-durak';
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
import { DURAK_MODES } from '@/lib/durak/modes';
import { durakRulesFor, useDurakSetupStore } from '@/stores/durakSetup';

const SEAT_OPTIONS = getGame('durak').seats;

export default function DurakSetupPage() {
  const router = useWipeRouter();
  const mode = useDurakSetupStore((s) => s.mode);
  const seats = useDurakSetupStore((s) => s.seats);
  const botTier = useDurakSetupStore((s) => s.botTier);
  const setMode = useDurakSetupStore((s) => s.setMode);
  const setSeats = useDurakSetupStore((s) => s.setSeats);
  const setBotTier = useDurakSetupStore((s) => s.setBotTier);
  const overrides = useDurakSetupStore((s) => s.overrides);
  const setRule = useDurakSetupStore((s) => s.setRule);
  const resetRules = useDurakSetupStore((s) => s.resetRules);
  const [starting, setStarting] = useState(false);
  const t = useT();
  const shelfEntry = useLocalizedGame('durak');
  const modes = useLocalizedModes('durak', DURAK_MODES);
  const schema = useLocalizedSchema('durak', durakConfig);

  const startSolo = () => {
    if (starting) return;
    setStarting(true);
    router.push('/durak/table');
  };

  return (
    <GameSetupScreen
      title={shelfEntry.name}
      eyebrow="setup.eyebrow.beatTheAttack"
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
        values={durakRulesFor(mode, overrides)}
        onChange={setRule}
        onReset={resetRules}
      />

      <SetupTableActions
        busy={starting}
        soloBusyLabel={t('setup.busy.turningTrump')}
        onSolo={startSolo}
        createHref="/durak/create"
        createTestId="create-durak-room"
        note={t('setup.note.friendRooms')}
      />
    </GameSetupScreen>
  );
}
