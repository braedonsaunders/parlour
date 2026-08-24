'use client';

import { useWipeRouter } from '@/hooks/useWipeRouter';
import { useState } from 'react';
import { ginHowToPlay } from '@parlour/game-gin';
import { RuleSettings } from '@/components/settings/RuleSettings';
import {
  BotDifficultyPicker,
  GameSetupScreen,
  SetupActions,
  SetupFact,
  SetupPanel,
} from '@/components/setup';
import { getGame } from '@/lib/games';
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
  const values = ginRulesFor(mode, overrides);

  const startSolo = () => {
    if (starting) return;
    setStarting(true);
    router.push('/gin/table');
  };

  return (
    <GameSetupScreen
      title="Gin"
      eyebrow="pick your table"
      help={{ doc: ginHowToPlay, subtitle: 'the rummy classic' }}
      modes={GIN_MODES}
      modesLabel="Match rules"
      selected={mode}
      onSelect={(id) => setMode(id as typeof mode)}
      renderArt={(def) => <GinPreview def={def} />}
    >
      <SetupPanel>
        <SetupFact label="Seats" value="2 — head to head" hint="you + one bot" />
        <BotDifficultyPicker value={botTier} onChange={setBotTier} />
      </SetupPanel>

      <RuleSettings
        schema={getGame('gin').configSchema as never}
        values={values as never}
        onChange={(key, value) => setRule(key, value as never)}
        onReset={resetRules}
        label="House rules"
      />

      <SetupActions
        busy={starting}
        actions={[
          {
            label: 'Play solo',
            busyLabel: 'Shuffling up…',
            onClick: startSolo,
            testId: 'deal-me-in',
          },
          {
            label: 'Create friend room',
            tone: 'teal',
            onClick: () => router.push('/gin/create'),
            testId: 'create-gin-room',
          },
          { label: 'Join with a code', tone: 'ghost', href: '/join' },
        ]}
        note="Friend rooms use the same four-character codes and live replay sync as every parlour table."
      />
    </GameSetupScreen>
  );
}
