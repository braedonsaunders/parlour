'use client';

import { useWipeRouter } from '@/hooks/useWipeRouter';
import { useState } from 'react';
import { blitzHowToPlay } from '@parlour/game-blitz';
import {
  BotDifficultyPicker,
  GameSetupScreen,
  SeatPicker,
  SetupActions,
  SetupPanel,
} from '@/components/setup';
import { getGame } from '@/lib/games';
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

  const start = () => {
    if (starting) return;
    setStarting(true);
    router.push('/table');
  };

  return (
    <GameSetupScreen
      title="Blitz"
      eyebrow="pick your mode"
      help={{ doc: blitzHowToPlay, subtitle: 'the 31 game' }}
      modes={MODES}
      modesLabel="Match format"
      selected={mode}
      onSelect={(id) => setMode(id as typeof mode)}
    >
      <SetupPanel>
        <SeatPicker
          options={SEAT_OPTIONS}
          value={seats}
          onChange={setSeats}
          hint={`you + ${seats - 1} bot${seats > 2 ? 's' : ''}`}
        />
        <BotDifficultyPicker value={botTier} onChange={setBotTier} />
      </SetupPanel>

      <SetupActions
        busy={starting}
        actions={[
          {
            label: 'Deal me in',
            busyLabel: 'Setting the table…',
            onClick: start,
            testId: 'deal-me-in',
          },
          { label: 'Create Room', tone: 'teal', onClick: () => router.push('/create') },
          { label: 'Join Room', tone: 'ghost', onClick: () => router.push('/join') },
        ]}
        note="Rooms play with friends over a share code — solo deals you in with the bots above."
      />
    </GameSetupScreen>
  );
}
