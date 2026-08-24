'use client';

import { useWipeRouter } from '@/hooks/useWipeRouter';
import { useState } from 'react';
import { wildpileConfig, wildpileHowToPlay } from '@parlour/game-wildpile';
import { getGame } from '@/lib/games';
import { RuleSettings } from '@/components/settings/RuleSettings';
import {
  BotDifficultyPicker,
  GameSetupScreen,
  SeatPicker,
  SetupActions,
  SetupPanel,
} from '@/components/setup';
import { WILD_MODES } from '@/lib/wild/modes';
import { useWildSetupStore, wildRulesFor } from '@/stores/wildSetup';

const SEAT_OPTIONS = getGame('wild').seats;

export default function WildSetupPage() {
  const router = useWipeRouter();
  const mode = useWildSetupStore((s) => s.mode);
  const seats = useWildSetupStore((s) => s.seats);
  const botTier = useWildSetupStore((s) => s.botTier);
  const setMode = useWildSetupStore((s) => s.setMode);
  const setSeats = useWildSetupStore((s) => s.setSeats);
  const setBotTier = useWildSetupStore((s) => s.setBotTier);
  const overrides = useWildSetupStore((s) => s.overrides);
  const setRule = useWildSetupStore((s) => s.setRule);
  const resetRules = useWildSetupStore((s) => s.resetRules);
  const [starting, setStarting] = useState(false);

  const startSolo = () => {
    if (starting) return;
    setStarting(true);
    router.push('/wild/table');
  };

  return (
    <GameSetupScreen
      title="Wild"
      eyebrow="pick your pile"
      help={{ doc: wildpileHowToPlay, subtitle: 'the shedding game' }}
      modes={WILD_MODES}
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
        schema={wildpileConfig}
        values={wildRulesFor(mode, overrides)}
        onChange={setRule}
        onReset={resetRules}
        label="Advanced options"
      />

      <SetupActions
        busy={starting}
        actions={[
          {
            label: 'Play solo',
            busyLabel: 'Shuffling the pile…',
            onClick: startSolo,
            testId: 'deal-me-in',
          },
          {
            label: 'Create friend room',
            tone: 'teal',
            onClick: () => router.push('/wild/create'),
            testId: 'create-wild-room',
          },
          { label: 'Join with a code', tone: 'ghost', href: '/join' },
        ]}
        note="Friend rooms use the same four-character codes, live replay sync, and reconnect flow as Blitz."
      />
    </GameSetupScreen>
  );
}
