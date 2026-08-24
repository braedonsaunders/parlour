'use client';

import { useState } from 'react';
import { useWipeRouter } from '@/hooks/useWipeRouter';
import { GameArt } from '@/components/GameArt';
import {
  BotDifficultyPicker,
  GameSetupScreen,
  SeatPicker,
  SetupActions,
  SetupPanel,
} from '@/components/setup';
import { SCOPA_MODES } from '@/lib/scopa/modes';
import { getGameMode } from '@/lib/games';
import { SCOPA_SEAT_OPTIONS, useScopaSetupStore } from '@/stores/scopaSetup';

export default function ScopaSetupPage() {
  const router = useWipeRouter();
  const mode = useScopaSetupStore((s) => s.mode);
  const botTier = useScopaSetupStore((s) => s.botTier);
  const seats = useScopaSetupStore((s) => s.seats);
  const setMode = useScopaSetupStore((s) => s.setMode);
  const setBotTier = useScopaSetupStore((s) => s.setBotTier);
  const setSeats = useScopaSetupStore((s) => s.setSeats);
  const [starting, setStarting] = useState(false);

  const startSolo = () => {
    if (starting) return;
    setStarting(true);
    router.push('/scopa/table');
  };

  return (
    <GameSetupScreen
      title="Scopa"
      eyebrow="pick your table"
      modes={SCOPA_MODES}
      modesLabel="House rules"
      selected={mode}
      onSelect={(id) => setMode(id as typeof mode)}
      renderArt={(def) => <GameArt cards={getGameMode('scopa', def.id).art} />}
    >
      <SetupPanel>
        <SeatPicker
          options={[...SCOPA_SEAT_OPTIONS]}
          value={seats}
          onChange={setSeats}
          hint={
            mode === 'scopone'
              ? 'Scopone is always four, in partnerships'
              : `you plus ${seats - 1} others — four and six play as partnerships`
          }
        />
        <BotDifficultyPicker value={botTier} onChange={setBotTier} />
      </SetupPanel>

      <SetupActions
        busy={starting}
        actions={[
          { label: 'Play solo', busyLabel: 'Laying out the table…', onClick: startSolo, testId: 'deal-me-in' },
        ]}
        note="Clear the table to score a scopa. Friend rooms for Scopa are not open yet."
      />
    </GameSetupScreen>
  );
}
