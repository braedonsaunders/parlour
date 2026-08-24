'use client';

import { useState } from 'react';
import { MAX_SEATS, MIN_SEATS } from '@parlour/game-ohhell';
import { useWipeRouter } from '@/hooks/useWipeRouter';
import { GameArt } from '@/components/GameArt';
import {
  BotDifficultyPicker,
  GameSetupScreen,
  SeatPicker,
  SetupActions,
  SetupPanel,
} from '@/components/setup';
import { OHHELL_MODES } from '@/lib/ohhell/modes';
import { getGameMode } from '@/lib/games';
import { useOhHellSetupStore } from '@/stores/ohhellSetup';

const SEAT_OPTIONS = Array.from(
  { length: MAX_SEATS - MIN_SEATS + 1 },
  (_, index) => MIN_SEATS + index,
);

export default function OhHellSetupPage() {
  const router = useWipeRouter();
  const mode = useOhHellSetupStore((s) => s.mode);
  const botTier = useOhHellSetupStore((s) => s.botTier);
  const seats = useOhHellSetupStore((s) => s.seats);
  const setMode = useOhHellSetupStore((s) => s.setMode);
  const setBotTier = useOhHellSetupStore((s) => s.setBotTier);
  const setSeats = useOhHellSetupStore((s) => s.setSeats);
  const [starting, setStarting] = useState(false);

  const startSolo = () => {
    if (starting) return;
    setStarting(true);
    router.push('/ohhell/table');
  };

  return (
    <GameSetupScreen
      title="Oh Hell"
      eyebrow="pick your table"
      modes={OHHELL_MODES}
      modesLabel="House rules"
      selected={mode}
      onSelect={(id) => setMode(id as typeof mode)}
      renderArt={(def) => <GameArt cards={getGameMode('ohhell', def.id).art} />}
    >
      <SetupPanel>
        <SeatPicker
          options={SEAT_OPTIONS}
          value={seats}
          onChange={setSeats}
          hint={`you plus ${seats - 1} others — the hand size changes every round`}
        />
        <BotDifficultyPicker value={botTier} onChange={setBotTier} />
      </SetupPanel>

      <SetupActions
        busy={starting}
        actions={[
          { label: 'Play solo', busyLabel: 'Cutting for the deal…', onClick: startSolo, testId: 'deal-me-in' },
        ]}
        note="Bid exactly what you will take. Friend rooms for Oh Hell are not open yet."
      />
    </GameSetupScreen>
  );
}
