'use client';

import { useWipeRouter } from '@/hooks/useWipeRouter';
import { useState } from 'react';
import { eightsConfig } from '@parlour/game-eights';
import { RuleSettings } from '@/components/settings/RuleSettings';
import {
  BotDifficultyPicker,
  GameSetupScreen,
  SeatPicker,
  SetupActions,
  SetupPanel,
} from '@/components/setup';
import { getGame } from '@/lib/games';
import { useLocalizedGame, useLocalizedModes, useLocalizedSchema } from '@/lib/i18n/gameContent';
import { EIGHTS_MODES } from '@/lib/eights/modes';
import { eightsRulesFor, useEightsSetupStore } from '@/stores/eightsSetup';

const SEAT_OPTIONS = getGame('eights').seats;

export default function EightsSetupPage() {
  const router = useWipeRouter();
  const mode = useEightsSetupStore((s) => s.mode);
  const seats = useEightsSetupStore((s) => s.seats);
  const botTier = useEightsSetupStore((s) => s.botTier);
  const setMode = useEightsSetupStore((s) => s.setMode);
  const setSeats = useEightsSetupStore((s) => s.setSeats);
  const setBotTier = useEightsSetupStore((s) => s.setBotTier);
  const overrides = useEightsSetupStore((s) => s.overrides);
  const setRule = useEightsSetupStore((s) => s.setRule);
  const resetRules = useEightsSetupStore((s) => s.resetRules);
  const [starting, setStarting] = useState(false);
  // The pack keeps its English; each locale overlays it. See ADDING-A-GAME.md §6.
  const shelfEntry = useLocalizedGame('eights');
  const modes = useLocalizedModes('eights', EIGHTS_MODES);
  const schema = useLocalizedSchema('eights', eightsConfig);

  const startSolo = () => {
    if (starting) return;
    setStarting(true);
    router.push('/eights/table');
  };

  return (
    <GameSetupScreen
      title="Crazy Eights"
      eyebrow="call the suit"
      help={{ doc: shelfEntry.howToPlay, subtitle: shelfEntry.subtitle }}
      modes={modes}
      modesLabel="House rules"
      selected={mode}
      onSelect={(id) => setMode(id as typeof mode)}
    >
      <SetupPanel>
        <SeatPicker
          options={SEAT_OPTIONS}
          value={seats}
          onChange={setSeats}
          hint={`you + ${seats - 1} bot${seats > 2 ? 's' : ''}`}
        />
        <BotDifficultyPicker value={botTier} onChange={setBotTier} />
      </SetupPanel>

      <RuleSettings
        schema={schema}
        values={eightsRulesFor(mode, overrides)}
        onChange={setRule}
        onReset={resetRules}
        label="Advanced options"
      />

      <SetupActions
        busy={starting}
        actions={[
          {
            label: 'Play solo',
            busyLabel: 'Shuffling the pack…',
            onClick: startSolo,
            testId: 'deal-me-in',
          },
          {
            label: 'Create friend room',
            tone: 'teal',
            onClick: () => router.push('/eights/create'),
            testId: 'create-eights-room',
          },
          { label: 'Join with a code', tone: 'ghost', href: '/join' },
        ]}
        note="Friend rooms use the same four-character codes, live replay sync, and reconnect flow as every parlour table."
      />
    </GameSetupScreen>
  );
}
