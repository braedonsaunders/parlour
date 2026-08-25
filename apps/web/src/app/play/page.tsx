'use client';

import { useWipeRouter } from '@/hooks/useWipeRouter';
import { useState } from 'react';
import {
  BotDifficultyPicker,
  GameSetupScreen,
  SeatPicker,
  SetupPanel,
  SetupTableActions,
} from '@/components/setup';
import { getGame } from '@/lib/games';
import { useT } from '@/lib/i18n';
import { useLocalizedGame, useLocalizedModes } from '@/lib/i18n/gameContent';
import { MODES } from '@/lib/modes';
import { useSetupStore } from '@/stores/setup';

const SEAT_OPTIONS = getGame('blitz').seats;

export default function ModeSelectPage() {
  const router = useWipeRouter();
  const mode = useSetupStore((s) => s.mode);
  const seats = useSetupStore((s) => s.seats);
  const botTier = useSetupStore((s) => s.botTier);
  const setMode = useSetupStore((s) => s.setMode);
  const setSeats = useSetupStore((s) => s.setSeats);
  const setBotTier = useSetupStore((s) => s.setBotTier);
  const [starting, setStarting] = useState(false);
  const t = useT();
  const shelfEntry = useLocalizedGame('blitz');
  const modes = useLocalizedModes('blitz', MODES);

  const start = () => {
    if (starting) return;
    setStarting(true);
    router.push('/table');
  };

  return (
    <GameSetupScreen
      title={shelfEntry.name}
      eyebrow="setup.eyebrow.pickMode"
      help={{ doc: shelfEntry.howToPlay, subtitle: shelfEntry.subtitle }}
      modes={modes}
      modesLabel="setup.matchFormat"
      selected={mode}
      onSelect={(id) => setMode(id as typeof mode)}
    >
      <SetupPanel>
        <SeatPicker
          options={SEAT_OPTIONS}
          value={seats}
          onChange={setSeats}
          hint={t.count('setup.youPlusBots', seats - 1)}
        />
        <BotDifficultyPicker value={botTier} onChange={setBotTier} />
      </SetupPanel>

      <SetupTableActions
        busy={starting}
        soloBusyLabel={t('setup.busy.settingTable')}
        onSolo={start}
        createHref="/create"
        createTestId="create-blitz-room"
        note={t('setup.note.friendRooms')}
      />
    </GameSetupScreen>
  );
}
