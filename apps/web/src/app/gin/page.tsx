'use client';

import { useWipeRouter } from '@/hooks/useWipeRouter';
import { useState } from 'react';
import { RuleSettings } from '@/components/settings/RuleSettings';
import {
  BotDifficultyPicker,
  GameSetupScreen,
  SetupActions,
  SetupFact,
  SetupPanel,
} from '@/components/setup';
import { getGame } from '@/lib/games';
import { useT } from '@/lib/i18n';
import { useLocalizedGame, useLocalizedModes, useLocalizedSchema } from '@/lib/i18n/gameContent';
import { GIN_MODES, type GinModeDef } from '@/lib/gin/modes';
import { useGinSetupStore, ginRulesFor } from '@/stores/ginSetup';
import styles from '@/styles/modes.module.css';
import gameStyles from '@/styles/games.module.css';

/** Gin's tiles fan a hand rather than the pack's catalog art. */
const PREVIEW_HANDS: Record<string, readonly string[]> = {
  classic: ['7♠', '7♥', '7♦'],
  quick: ['A♠', '10♥', 'J♦'],
  purist: ['Q♠', '8♣', '3♥'],
};

function GinPreview({ def }: { def: GinModeDef }) {
  return (
    <span className={styles.preview}>
      {(PREVIEW_HANDS[def.id] ?? []).map((card) => (
        <span key={card} className={gameStyles.wildCard}>
          {card}
        </span>
      ))}
    </span>
  );
}

export default function GinSetupPage() {
  const router = useWipeRouter();
  const mode = useGinSetupStore((s) => s.mode);
  const botTier = useGinSetupStore((s) => s.botTier);
  const overrides = useGinSetupStore((s) => s.overrides);
  const setMode = useGinSetupStore((s) => s.setMode);
  const setBotTier = useGinSetupStore((s) => s.setBotTier);
  const setRule = useGinSetupStore((s) => s.setRule);
  const resetRules = useGinSetupStore((s) => s.resetRules);
  const [starting, setStarting] = useState(false);
  const t = useT();
  const shelfEntry = useLocalizedGame('gin');
  const modes = useLocalizedModes('gin', GIN_MODES);
  const schema = useLocalizedSchema('gin', getGame('gin').configSchema);
  const values = ginRulesFor(mode, overrides);

  const startSolo = () => {
    if (starting) return;
    setStarting(true);
    router.push('/gin/table');
  };

  return (
    <GameSetupScreen
      title={shelfEntry.name}
      eyebrow="setup.eyebrow.pickTable"
      help={{ doc: shelfEntry.howToPlay, subtitle: shelfEntry.subtitle }}
      modes={modes}
      modesLabel="setup.matchRules"
      selected={mode}
      onSelect={(id) => setMode(id as typeof mode)}
      renderArt={(def) => <GinPreview def={def} />}
    >
      <SetupPanel>
        <SetupFact label={t('setup.seats')} value={t('setup.ginSeats')} hint={t('setup.ginHint')} />
        <BotDifficultyPicker value={botTier} onChange={setBotTier} />
      </SetupPanel>

      <RuleSettings
        schema={schema as never}
        values={values as never}
        onChange={(key, value) => setRule(key, value as never)}
        onReset={resetRules}
        label={t('setup.houseRules')}
      />

      <SetupActions
        busy={starting}
        actions={[
          {
            label: t('setup.playSolo'),
            busyLabel: t('setup.busy.shuffling'),
            onClick: startSolo,
            testId: 'deal-me-in',
          },
          {
            label: t('setup.createFriendRoom'),
            tone: 'teal',
            onClick: () => router.push('/gin/create'),
            testId: 'create-gin-room',
          },
          { label: t('setup.joinWithCode'), tone: 'ghost', href: '/join' },
        ]}
        note={t('setup.note.friendRoomsGin')}
      />
    </GameSetupScreen>
  );
}
