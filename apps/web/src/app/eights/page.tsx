'use client';

import { useWipeRouter } from '@/hooks/useWipeRouter';
import { useState } from 'react';
import { eightsConfig } from '@parlour/game-eights';
import { RuleSettings } from '@/components/settings/RuleSettings';
import {
  BotDifficultyPicker,
  GameSetupScreen,
  SeatPicker,
  SetupActions,
  SetupPanel,
} from '@/components/setup';
import { getGame } from '@/lib/games';
import { useT } from '@/lib/i18n';
import { useLocalizedGame, useLocalizedModes, useLocalizedSchema } from '@/lib/i18n/gameContent';
import { EIGHTS_MODES } from '@/lib/eights/modes';
import { eightsRulesFor, useEightsSetupStore } from '@/stores/eightsSetup';

const SEAT_OPTIONS = getGame('eights').seats;

export default function EightsSetupPage() {
  const router = useWipeRouter();
  const mode = useEightsSetupStore((s) => s.mode);
  const seats = useEightsSetupStore((s) => s.seats);
  const botTier = useEightsSetupStore((s) => s.botTier);
  const setMode = useEightsSetupStore((s) => s.setMode);
  const setSeats = useEightsSetupStore((s) => s.setSeats);
  const setBotTier = useEightsSetupStore((s) => s.setBotTier);
  const overrides = useEightsSetupStore((s) => s.overrides);
  const setRule = useEightsSetupStore((s) => s.setRule);
  const resetRules = useEightsSetupStore((s) => s.resetRules);
  const [starting, setStarting] = useState(false);
  const t = useT();
  // The pack keeps its English; each locale overlays it. See ADDING-A-GAME.md §6.
  const shelfEntry = useLocalizedGame('eights');
  const modes = useLocalizedModes('eights', EIGHTS_MODES);
  const schema = useLocalizedSchema('eights', eightsConfig);

  const startSolo = () => {
    if (starting) return;
    setStarting(true);
    router.push('/eights/table');
  };

  return (
    <GameSetupScreen
      title={shelfEntry.name}
      eyebrow="setup.eyebrow.callSuit"
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
        values={eightsRulesFor(mode, overrides)}
        onChange={setRule}
        onReset={resetRules}
      />

      <SetupActions
        busy={starting}
        actions={[
          {
            label: t('setup.playSolo'),
            busyLabel: t('setup.busy.shufflingPack'),
            onClick: startSolo,
            testId: 'deal-me-in',
          },
          {
            label: t('setup.createFriendRoom'),
            tone: 'teal',
            onClick: () => router.push('/eights/create'),
            testId: 'create-eights-room',
          },
          { label: t('setup.joinWithCode'), tone: 'ghost', href: '/join' },
        ]}
        note={t('setup.note.friendRooms')}
      />
    </GameSetupScreen>
  );
}
