'use client';

import { useWipeRouter } from '@/hooks/useWipeRouter';
import { useState } from 'react';
import { cribbageConfigSchema, cribbageHowToPlay } from '@parlour/game-cribbage';
import { RuleSettings } from '@/components/settings/RuleSettings';
import {
  BotDifficultyPicker,
  GameSetupScreen,
  SetupActions,
  SetupFact,
  SetupPanel,
} from '@/components/setup';
import { CRIBBAGE_MODES } from '@/lib/cribbage/modes';
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
  const rules = cribbageRulesFor(mode, overrides);
  const matchPlay = rules.gamesToWin > 1;

  const startSolo = () => {
    if (starting) return;
    setStarting(true);
    router.push('/cribbage/table');
  };

  return (
    <GameSetupScreen
      title="Cribbage"
      eyebrow="choose your board"
      help={{ doc: cribbageHowToPlay, subtitle: 'the pegging race' }}
      modes={CRIBBAGE_MODES}
      modesLabel="Cribbage format"
      selected={mode}
      onSelect={(id) => setMode(id as typeof mode)}
    >
      <SetupPanel>
        <SetupFact
          label="Table"
          value="Two seats · you deal first"
          hint="dealer alternates every hand"
        />
        <BotDifficultyPicker value={botTier} onChange={setBotTier} />
      </SetupPanel>

      <RuleSettings
        schema={cribbageConfigSchema}
        values={rules}
        onChange={setRule}
        onReset={resetRules}
        label="House rules"
      />

      <SetupActions
        busy={starting}
        actions={[
          {
            label: matchPlay ? 'Start solo match' : 'Play solo',
            busyLabel: 'Setting the pegs…',
            onClick: startSolo,
            testId: 'deal-me-in',
          },
          {
            label: 'Create friend room',
            tone: 'teal',
            onClick: () => router.push('/cribbage/create'),
            disabled: matchPlay,
            title: matchPlay ? 'Friend rooms currently play one complete race to 121' : undefined,
            testId: 'create-cribbage-room',
          },
          { label: 'Join with a code', tone: 'ghost', href: '/join' },
        ]}
        note={
          matchPlay
            ? 'Match Play is available solo; friend rooms play one complete 121-point game.'
            : 'Friend rooms share the same host-authoritative replay log and reconnect flow as the rest of Parlour.'
        }
      />
    </GameSetupScreen>
  );
}
