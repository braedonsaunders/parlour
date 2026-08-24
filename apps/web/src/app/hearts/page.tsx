'use client';

import { heartsHowToPlay } from '@parlour/game-hearts';
import Link from 'next/link';
import { useWipeRouter } from '@/hooks/useWipeRouter';
import { useState } from 'react';
import { GameArt } from '@/components/GameArt';
import { getGame } from '@/lib/games';
import type { GameMode } from '@/lib/games';
import { HowToPlayButton } from '@/components/HowToPlay';
import { RuleSettings } from '@/components/settings/RuleSettings';
import { BotDifficultyPicker } from '@/components/setup/BotDifficultyPicker';
import { useCenteredCarousel } from '@/hooks/useCenteredCarousel';
import { HEARTS_MODES } from '@/lib/hearts/modes';
import { heartsRulesFor, useHeartsSetupStore } from '@/stores/heartsSetup';
import styles from '@/styles/modes.module.css';
import gameStyles from '@/styles/games.module.css';

export default function HeartsSetupPage() {
  const router = useWipeRouter();
  const mode = useHeartsSetupStore((s) => s.mode);
  const overrides = useHeartsSetupStore((s) => s.overrides);
  const botTier = useHeartsSetupStore((s) => s.botTier);
  const setMode = useHeartsSetupStore((s) => s.setMode);
  const setBotTier = useHeartsSetupStore((s) => s.setBotTier);
  const setRule = useHeartsSetupStore((s) => s.setRule);
  const resetRules = useHeartsSetupStore((s) => s.resetRules);
  const [starting, setStarting] = useState(false);
  const carouselRef = useCenteredCarousel(mode);

  const startSolo = () => {
    if (starting) return;
    setStarting(true);
    router.push('/hearts/table');
  };

  return (
    <main className="flex min-h-dvh flex-col">
      <header className="flex items-center justify-between px-6 pt-5">
        <Link
          href="/games"
          className="pill-soft text-sm font-bold text-dusk-100 hover:text-hearth-200"
        >
          ← Games
        </Link>
        <h1 className="font-display text-xl font-extrabold tracking-tight text-hearth-50">
          Hearts <span className="text-dusk-100/80">· dodge everything</span>
        </h1>
        <HowToPlayButton doc={heartsHowToPlay} title="Hearts" subtitle="the evasion game" />
      </header>

      <div
        ref={carouselRef}
        className={`${styles.carousel} ${styles.centeredCarousel}`}
        role="radiogroup"
        aria-label="House rules"
      >
        {HEARTS_MODES.map((modeDef) => (
          <ModeTile
            key={modeDef.id}
            def={modeDef}
            selected={modeDef.id === mode}
            onSelect={() => setMode(modeDef.id)}
          />
        ))}
      </div>

      <section
        className="mx-auto mb-auto flex w-full max-w-3xl flex-col gap-4 rounded-chunky px-6 pb-8"
        aria-label="Table setup"
      >
        <div className="panel-soft flex flex-wrap items-center justify-between gap-4 p-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-dusk-200">Seats</p>
            <p className="mt-1.5 font-display text-2xl font-extrabold text-hearth-50">4 players</p>
            <p className="mt-1 text-xs text-dusk-200/80">
              you + 3 bots in solo · every chair filled for friend rooms
            </p>
          </div>
          <BotDifficultyPicker value={botTier} onChange={setBotTier} />
        </div>

        <RuleSettings
          schema={getGame('hearts').configSchema}
          values={heartsRulesFor(mode, overrides)}
          onChange={setRule}
          onReset={resetRules}
          label="Advanced options"
        />

        <div className="mx-auto flex w-full max-w-xl flex-wrap justify-center gap-3">
          <button
            type="button"
            onClick={startSolo}
            disabled={starting}
            className="btn-fat w-64 text-lg"
            data-testid="deal-me-in"
          >
            {starting ? 'Shuffling up…' : 'Play solo'}
          </button>
          <button
            type="button"
            onClick={() => router.push('/hearts/create')}
            disabled={starting}
            className="btn-fat btn-fat--teal w-64 text-lg"
            data-testid="create-hearts-room"
          >
            Create friend room
          </button>
          <Link href="/join" className="btn-fat btn-fat--ghost w-64 text-center text-lg">
            Join with a code
          </Link>
        </div>

        <p className="text-center text-xs text-dusk-200/80">
          Lowest score wins — dodge the hearts, fear the queen.
        </p>
      </section>
    </main>
  );
}

function ModeTile({
  def,
  selected,
  onSelect,
}: {
  def: GameMode;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <div className={gameStyles.tileWrap}>
      <HowToPlayButton
        doc={heartsHowToPlay}
        title={def.name}
        subtitle={`Hearts · ${def.tagline}`}
        variant="chip"
        className={gameStyles.tileHelp}
      />
      <button
        type="button"
        role="radio"
        aria-checked={selected}
        data-selected={selected}
        onClick={onSelect}
        className={styles.tile}
        style={{
          ['--tile-accent' as string]: def.accent,
          ['--tile-accent-soft' as string]: `${def.accent}44`,
        }}
      >
        <span className={styles.tileGlow} />
        <GameArt cards={def.art} motif={def.motif} />
        <span className={styles.tagline}>{def.tagline}</span>
        <h2 className={styles.modeName}>{def.name}</h2>
        <span className={styles.facts}>
          {def.facts.map((fact) => (
            <span key={fact} className={styles.fact}>
              {fact}
            </span>
          ))}
        </span>
        <p className={styles.description}>{def.description}</p>
      </button>
    </div>
  );
}
