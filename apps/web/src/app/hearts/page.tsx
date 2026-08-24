'use client';

import { heartsHowToPlay } from '@parlour/game-hearts';
import { useWipeRouter } from '@/hooks/useWipeRouter';
import { useState } from 'react';
import { getGame } from '@/lib/games';
import { RuleSettings } from '@/components/settings/RuleSettings';
import {
  BotDifficultyPicker,
  GameSetupScreen,
  SetupActions,
  SetupFact,
  SetupPanel,
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

  const startSolo = () => {
    if (starting) return;
    setStarting(true);
    router.push('/hearts/table');
  };

  return (
    <GameSetupScreen
      title="Hearts"
      eyebrow="dodge everything"
      help={{ doc: heartsHowToPlay, subtitle: 'the evasion game' }}
      modes={HEARTS_MODES}
      modesLabel="House rules"
      selected={mode}
      onSelect={(id) => setMode(id as typeof mode)}
    >
      <SetupPanel>
        <SetupFact
          label="Seats"
          value="4 players"
          hint="you + 3 bots in solo · every chair filled for friend rooms"
        />
        <BotDifficultyPicker value={botTier} onChange={setBotTier} />
      </SetupPanel>

      <RuleSettings
        schema={getGame('hearts').configSchema}
        values={heartsRulesFor(mode, overrides)}
        onChange={setRule}
        onReset={resetRules}
        label="Advanced options"
      />

      <SetupActions
        busy={starting}
        actions={[
          {
            label: 'Play solo',
            busyLabel: 'Shuffling up…',
            onClick: startSolo,
            testId: 'deal-me-in',
          },
          {
            label: 'Create friend room',
            tone: 'teal',
            onClick: () => router.push('/hearts/create'),
            testId: 'create-hearts-room',
          },
          { label: 'Join with a code', tone: 'ghost', href: '/join' },
        ]}
        note="Lowest score wins — dodge the hearts, fear the queen."
      />
    </GameSetupScreen>
  );
}
