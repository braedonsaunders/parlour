'use client';

import { useState } from 'react';
import { MAX_SEATS, MIN_SEATS } from '@parlour/game-poker';
import { useWipeRouter } from '@/hooks/useWipeRouter';
import { GameArt } from '@/components/GameArt';
import {
  BotDifficultyPicker,
  GameSetupScreen,
  SeatPicker,
  SetupPanel,
  SetupTableActions,
} from '@/components/setup';
import { POKER_MODES } from '@/lib/poker/modes';
import { getGameMode } from '@/lib/games';
import { useT } from '@/lib/i18n';
import { useLocalizedGame, useLocalizedModes } from '@/lib/i18n/gameContent';
import { usePokerSetupStore } from '@/stores/pokerSetup';

const SEAT_OPTIONS = Array.from(
  { length: MAX_SEATS - MIN_SEATS + 1 },
  (_, index) => MIN_SEATS + index,
);

export default function PokerSetupPage() {
  const router = useWipeRouter();
  const mode = usePokerSetupStore((s) => s.mode);
  const botTier = usePokerSetupStore((s) => s.botTier);
  const seats = usePokerSetupStore((s) => s.seats);
  const setMode = usePokerSetupStore((s) => s.setMode);
  const setBotTier = usePokerSetupStore((s) => s.setBotTier);
  const setSeats = usePokerSetupStore((s) => s.setSeats);
  const [starting, setStarting] = useState(false);
  const t = useT();
  const shelfEntry = useLocalizedGame('poker');
  const modes = useLocalizedModes('poker', POKER_MODES);

  const startSolo = () => {
    if (starting) return;
    setStarting(true);
    router.push('/poker/table');
  };

  return (
    <GameSetupScreen
      title={shelfEntry.name}
      eyebrow="setup.eyebrow.pickTable"
      modes={modes}
      selected={mode}
      onSelect={(id) => setMode(id as typeof mode)}
      renderArt={(def) => <GameArt cards={getGameMode('poker', def.id).art} />}
    >
      <SetupPanel>
        <SeatPicker
          options={SEAT_OPTIONS}
          value={seats}
          onChange={setSeats}
          hint={t.count('setup.youPlusOpponents', seats - 1)}
        />
        <BotDifficultyPicker value={botTier} onChange={setBotTier} />
      </SetupPanel>

      <SetupTableActions
        busy={starting}
        soloBusyLabel={t('setup.busy.shuffling')}
        onSolo={startSolo}
        createHref="/poker/create"
        createTestId="create-poker-room"
        note={t('setup.note.poker')}
      />
    </GameSetupScreen>
  );
}
