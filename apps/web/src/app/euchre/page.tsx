'use client';

import { useWipeRouter } from '@/hooks/useWipeRouter';
import { useState } from 'react';
import { GameArt } from '@/components/GameArt';
import {
  BotDifficultyPicker,
  GameSetupScreen,
  SetupActions,
  SetupFact,
  SetupPanel,
} from '@/components/setup';
import { EUCHRE_MODES } from '@/lib/euchre/modes';
import { getGameMode } from '@/lib/games';
import { useEuchreSetupStore } from '@/stores/euchreSetup';

export default function EuchreSetupPage() {
  const router = useWipeRouter();
  const mode = useEuchreSetupStore((s) => s.mode);
  const botTier = useEuchreSetupStore((s) => s.botTier);
  const setMode = useEuchreSetupStore((s) => s.setMode);
  const setBotTier = useEuchreSetupStore((s) => s.setBotTier);
  const [starting, setStarting] = useState(false);

  const startSolo = () => {
    if (starting) return;
    setStarting(true);
    router.push('/euchre/table');
  };

  return (
    <GameSetupScreen
      title="Euchre"
      eyebrow="pick your table"
      modes={EUCHRE_MODES}
      modesLabel="House rules"
      selected={mode}
      onSelect={(id) => setMode(id as typeof mode)}
      renderArt={(def) => <GameArt cards={getGameMode('euchre', def.id).art} />}
    >
      <SetupPanel>
        <SetupFact
          label="Seats"
          value="4 players · two partnerships"
          hint="you + a bot partner across from you, two bot opponents flanking — or bring three friends"
        />
        <BotDifficultyPicker value={botTier} onChange={setBotTier} />
      </SetupPanel>

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
            onClick: () => router.push('/euchre/create'),
            testId: 'create-euchre-room',
          },
          { label: 'Join with a code', tone: 'ghost', href: '/join' },
        ]}
        note="Friend rooms use the same four-character codes, live replay sync, and reconnect flow as every parlour table."
      />
    </GameSetupScreen>
  );
}
