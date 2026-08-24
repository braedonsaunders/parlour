'use client';

import { useWipeRouter } from '@/hooks/useWipeRouter';
import { useState } from 'react';
import { presidentConfig, presidentHowToPlay } from '@parlour/game-president';
import { RuleSettings } from '@/components/settings/RuleSettings';
import {
  BotDifficultyPicker,
  GameSetupScreen,
  SeatPicker,
  SetupActions,
  SetupPanel,
} from '@/components/setup';
import { getGame } from '@/lib/games';
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

  const startSolo = () => {
    if (starting) return;
    setStarting(true);
    router.push('/president/table');
  };

  return (
    <GameSetupScreen
      title="President"
      eyebrow="claim the crown"
      help={{ doc: presidentHowToPlay, subtitle: 'the climbing game' }}
      modes={PRESIDENT_MODES}
      modesLabel="Match format"
      selected={mode}
      onSelect={(id) => setMode(id as typeof mode)}
    >
      <SetupPanel>
        <SeatPicker
          options={SEAT_OPTIONS}
          value={seats}
          onChange={setSeats}
          hint={`you + ${seats - 1} rivals — the full ladder, crowns included`}
        />
        <BotDifficultyPicker value={botTier} onChange={setBotTier} />
      </SetupPanel>

      <RuleSettings
        schema={presidentConfig}
        values={presidentRulesFor(mode, overrides)}
        onChange={setRule as (key: string, value: string | number | boolean) => void}
        onReset={resetRules}
        label="Advanced options"
      />

      <SetupActions
        busy={starting}
        actions={[
          {
            label: 'Play solo',
            busyLabel: 'Cutting the deck…',
            onClick: startSolo,
            testId: 'deal-me-in',
          },
          {
            label: 'Create friend room',
            tone: 'teal',
            onClick: () => router.push('/president/create'),
            testId: 'create-president-room',
          },
          { label: 'Join with a code', tone: 'ghost', href: '/join' },
        ]}
        note="Friend rooms use the same four-character codes, live replay sync, and reconnect flow as every parlour table — with room for up to eight chairs."
      />
    </GameSetupScreen>
  );
}
