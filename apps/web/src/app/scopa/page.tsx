'use client';

import { useState } from 'react';
import { useWipeRouter } from '@/hooks/useWipeRouter';
import { GameArt } from '@/components/GameArt';
import {
  BotDifficultyPicker,
  GameSetupScreen,
  SeatPicker,
  SetupPanel,
  SetupTableActions,
} from '@/components/setup';
import { SCOPA_MODES } from '@/lib/scopa/modes';
import { getGameMode } from '@/lib/games';
import { useT } from '@/lib/i18n';
import { useLocalizedGame, useLocalizedModes } from '@/lib/i18n/gameContent';
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
  const t = useT();
  const shelfEntry = useLocalizedGame('scopa');
  const modes = useLocalizedModes('scopa', SCOPA_MODES);

  const startSolo = () => {
    if (starting) return;
    setStarting(true);
    router.push('/scopa/table');
  };

  return (
    <GameSetupScreen
      title={shelfEntry.name}
      eyebrow="setup.eyebrow.pickTable"
      modes={modes}
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
              ? t('setup.scopaAlwaysFour')
              : t('setup.scopaOthers', { count: seats - 1 })
          }
        />
        <BotDifficultyPicker value={botTier} onChange={setBotTier} />
      </SetupPanel>

      <SetupTableActions
        busy={starting}
        soloBusyLabel={t('setup.busy.layingTable')}
        onSolo={startSolo}
        createHref="/scopa/create"
        createTestId="create-scopa-room"
        note={t('setup.note.scopa')}
      />
    </GameSetupScreen>
  );
}
