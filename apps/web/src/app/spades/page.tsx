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
import { SPADES_MODES } from '@/lib/spades/modes';
import { getGameMode } from '@/lib/games';
import { useSpadesSetupStore } from '@/stores/spadesSetup';

export default function SpadesSetupPage() {
  const router = useWipeRouter();
  const mode = useSpadesSetupStore((s) => s.mode);
  const botTier = useSpadesSetupStore((s) => s.botTier);
  const setMode = useSpadesSetupStore((s) => s.setMode);
  const setBotTier = useSpadesSetupStore((s) => s.setBotTier);
  const [starting, setStarting] = useState(false);

  const startSolo = () => {
    if (starting) return;
    setStarting(true);
    router.push('/spades/table');
  };

  return (
    <GameSetupScreen
      title="Spades"
      eyebrow="pick your table"
      modes={SPADES_MODES}
      modesLabel="House rules"
      selected={mode}
      onSelect={(id) => setMode(id as typeof mode)}
      renderArt={(def) => <GameArt cards={getGameMode('spades', def.id).art} />}
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
            onClick: () => router.push('/spades/create'),
            testId: 'create-spades-room',
          },
          { label: 'Join with a code', tone: 'ghost', href: '/join' },
        ]}
        note="Friend rooms use the same four-character codes, live replay sync, and reconnect flow as every parlour table."
      />
    </GameSetupScreen>
  );
}
