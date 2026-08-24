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
import { SPITE_MODES } from '@/lib/spite/modes';
import { getGameMode } from '@/lib/games';
import { SPITE_SEAT_OPTIONS, useSpiteSetupStore } from '@/stores/spiteSetup';

export default function SpiteSetupPage() {
  const router = useWipeRouter();
  const mode = useSpiteSetupStore((s) => s.mode);
  const botTier = useSpiteSetupStore((s) => s.botTier);
  const seats = useSpiteSetupStore((s) => s.seats);
  const setMode = useSpiteSetupStore((s) => s.setMode);
  const setBotTier = useSpiteSetupStore((s) => s.setBotTier);
  const setSeats = useSpiteSetupStore((s) => s.setSeats);
  const [starting, setStarting] = useState(false);

  const startSolo = () => {
    if (starting) return;
    setStarting(true);
    router.push('/spite/table');
  };

  return (
    <GameSetupScreen
      title="Spite & Malice"
      eyebrow="pick your table"
      modes={SPITE_MODES}
      modesLabel="House rules"
      selected={mode}
      onSelect={(id) => setMode(id as typeof mode)}
      renderArt={(def) => <GameArt cards={getGameMode('spite', def.id).art} />}
    >
      <SetupPanel>
        <SeatPicker
          options={[...SPITE_SEAT_OPTIONS]}
          value={seats}
          onChange={setSeats}
          hint={`you plus ${seats - 1} — first to empty their payoff pile wins`}
        />
        <BotDifficultyPicker value={botTier} onChange={setBotTier} />
      </SetupPanel>

      <SetupActions
        busy={starting}
        actions={[
          {
            label: 'Play solo',
            busyLabel: 'Stacking the piles…',
            onClick: startSolo,
            testId: 'deal-me-in',
          },
        ]}
        note="Build the centre up from ace to queen. Friend rooms for Spite are not open yet."
      />
    </GameSetupScreen>
  );
}
