'use client';

import { useWipeRouter } from '@/hooks/useWipeRouter';
import { useState } from 'react';
import { wildpileConfig } from '@parlour/game-wildpile';
import { getGame } from '@/lib/games';
import { useT } from '@/lib/i18n';
import { useLocalizedGame, useLocalizedModes, useLocalizedSchema } from '@/lib/i18n/gameContent';
import { RuleSettings } from '@/components/settings/RuleSettings';
import {
  BotDifficultyPicker,
  GameSetupScreen,
  SeatPicker,
  SetupActions,
  SetupPanel,
} from '@/components/setup';
import { WILD_MODES } from '@/lib/wild/modes';
import { useWildSetupStore, wildRulesFor } from '@/stores/wildSetup';

const SEAT_OPTIONS = getGame('wild').seats;

export default function WildSetupPage() {
  const router = useWipeRouter();
  const mode = useWildSetupStore((s) => s.mode);
  const seats = useWildSetupStore((s) => s.seats);
  const botTier = useWildSetupStore((s) => s.botTier);
  const setMode = useWildSetupStore((s) => s.setMode);
  const setSeats = useWildSetupStore((s) => s.setSeats);
  const setBotTier = useWildSetupStore((s) => s.setBotTier);
  const overrides = useWildSetupStore((s) => s.overrides);
  const setRule = useWildSetupStore((s) => s.setRule);
  const resetRules = useWildSetupStore((s) => s.resetRules);
  const [starting, setStarting] = useState(false);
  const t = useT();
  const shelfEntry = useLocalizedGame('wild');
  const modes = useLocalizedModes('wild', WILD_MODES);
  const schema = useLocalizedSchema('wild', wildpileConfig);

  const startSolo = () => {
    if (starting) return;
    setStarting(true);
    router.push('/wild/table');
  };

  return (
    <GameSetupScreen
      title={shelfEntry.name}
      eyebrow="setup.eyebrow.pickPile"
      help={{ doc: shelfEntry.howToPlay, subtitle: shelfEntry.subtitle }}
      modes={modes}
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

      <RuleSettings
        schema={schema}
        values={wildRulesFor(mode, overrides)}
        onChange={setRule}
        onReset={resetRules}
      />

      <SetupActions
        busy={starting}
        actions={[
          {
            label: t('setup.playSolo'),
            busyLabel: t('setup.busy.shufflingPile'),
            onClick: startSolo,
            testId: 'deal-me-in',
          },
          {
            label: t('setup.createFriendRoom'),
            tone: 'teal',
            onClick: () => router.push('/wild/create'),
            testId: 'create-wild-room',
          },
          { label: t('setup.joinWithCode'), tone: 'ghost', href: '/join' },
        ]}
        note={t('setup.note.friendRoomsBlitz')}
      />
    </GameSetupScreen>
  );
}
