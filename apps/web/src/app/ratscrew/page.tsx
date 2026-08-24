'use client';

import { useWipeRouter } from '@/hooks/useWipeRouter';
import { useState } from 'react';
import { ratscrewConfigSchema, ratscrewHowToPlay } from '@parlour/game-ratscrew';
import { getGame } from '@/lib/games';
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

  const startSolo = () => {
    if (starting) return;
    setStarting(true);
    router.push('/ratscrew/table');
  };

  return (
    <GameSetupScreen
      title="Rat Screw"
      eyebrow="hands on the pile"
      help={{ doc: ratscrewHowToPlay, subtitle: 'the slap game' }}
      modes={RATSCREW_MODES}
      modesLabel="House rules"
      selected={mode}
      onSelect={(id) => setMode(id as typeof mode)}
    >
      <SetupPanel>
        <SeatPicker
          options={SEAT_OPTIONS}
          value={seats}
          onChange={setSeats}
          hint={`you + ${seats - 1} bot${seats > 2 ? 's' : ''} with real reflexes`}
        />
        <BotDifficultyPicker value={botTier} onChange={setBotTier} />
      </SetupPanel>

      <RuleSettings
        schema={ratscrewConfigSchema}
        values={ratscrewRulesFor(mode, overrides)}
        onChange={setRule}
        onReset={resetRules}
        label="Advanced options"
      />

      <SetupActions
        busy={starting}
        actions={[
          {
            label: 'Play solo',
            busyLabel: 'Shuffling the stacks…',
            onClick: startSolo,
            testId: 'deal-me-in',
          },
          {
            label: 'Create friend room',
            tone: 'teal',
            onClick: () => router.push('/ratscrew/create'),
            testId: 'create-ratscrew-room',
          },
          { label: 'Join with a code', tone: 'ghost', href: '/join' },
        ]}
        note="Slaps race in real time — first palm on the pile takes it. Mis-slaps burn your top card."
      />
    </GameSetupScreen>
  );
}
