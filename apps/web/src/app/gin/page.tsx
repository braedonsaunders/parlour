'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { ginHowToPlay } from '@parlour/game-gin';
import { HowToPlayButton } from '@/components/HowToPlay';
import { RuleSettings } from '@/components/settings/RuleSettings';
import { useCenteredCarousel } from '@/hooks/useCenteredCarousel';
import { getGame } from '@/lib/games';
import { GIN_MODES, type GinModeDef } from '@/lib/gin/modes';
import { useGinSetupStore, ginRulesFor } from '@/stores/ginSetup';
import styles from '@/styles/modes.module.css';
import gameStyles from '@/styles/games.module.css';

const TIERS = [
  { tier: 1, label: 'Easy' },
  { tier: 2, label: 'Medium' },
  { tier: 3, label: 'Hard' },
] as const;

export default function GinSetupPage() {
  const router = useRouter();
  const mode = useGinSetupStore((s) => s.mode);
  const botTier = useGinSetupStore((s) => s.botTier);
  const overrides = useGinSetupStore((s) => s.overrides);
  const setMode = useGinSetupStore((s) => s.setMode);
  const setBotTier = useGinSetupStore((s) => s.setBotTier);
  const setRule = useGinSetupStore((s) => s.setRule);
  const resetRules = useGinSetupStore((s) => s.resetRules);
  const [starting, setStarting] = useState(false);
  const carouselRef = useCenteredCarousel(mode);
  const values = ginRulesFor(mode, overrides);

  const startSolo = () => {
    if (starting) return;
    setStarting(true);
    router.push('/gin/table');
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
          Gin <span className="text-dusk-100/80">· pick your table</span>
        </h1>
        <HowToPlayButton doc={ginHowToPlay} title="Gin" subtitle="the rummy classic" />
      </header>

      <div
        ref={carouselRef}
        className={`${styles.carousel} ${styles.centeredCarousel}`}
        role="radiogroup"
        aria-label="Match rules"
      >
        {GIN_MODES.map((modeDef) => (
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
            <p className="mt-1.5 font-display text-sm font-extrabold text-hearth-50">
              2 — head to head
            </p>
            <p className="mt-1 text-xs text-dusk-200/80">you + one bot</p>
          </div>
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-dusk-200">Bot skill</p>
            <div className="mt-1.5 flex items-center gap-2" role="group" aria-label="Bot skill">
              {TIERS.map((tier) => (
                <button
                  key={tier.tier}
                  type="button"
                  aria-pressed={tier.tier === botTier}
                  onClick={() => setBotTier(tier.tier)}
                  className={`rounded-fat border-2 px-3.5 py-1.5 font-display text-sm font-extrabold transition-transform duration-150 ease-pop hover:-translate-y-0.5 ${
                    tier.tier === botTier
                      ? 'border-hearth-700 bg-gradient-to-b from-hearth-300 to-hearth-500 text-hearth-900'
                      : 'border-dusk-700/60 bg-dusk-950/70 text-dusk-100'
                  }`}
                >
                  {tier.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <RuleSettings
          schema={getGame('gin').configSchema as never}
          values={values as never}
          onChange={(key, value) => setRule(key, value as never)}
          onReset={resetRules}
          label="House rules"
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
            onClick={() => router.push('/gin/create')}
            disabled={starting}
            className="btn-fat btn-fat--teal w-64 text-lg"
            data-testid="create-gin-room"
          >
            Create friend room
          </button>
          <Link href="/join" className="btn-fat btn-fat--ghost w-64 text-center text-lg">
            Join with a code
          </Link>
        </div>

        <p className="text-center text-xs text-dusk-200/80">
          Friend rooms use the same four-character codes and live replay sync as every parlour
          table.
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
  def: GinModeDef;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <div className={gameStyles.tileWrap}>
      <HowToPlayButton
        doc={ginHowToPlay}
        title={def.name}
        subtitle={`Gin · ${def.tagline}`}
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
        <span className={styles.preview}>
          {def.id === 'classic' && (
            <>
              <span className={gameStyles.wildCard}>7♠</span>
              <span className={gameStyles.wildCard}>7♥</span>
              <span className={gameStyles.wildCard}>7♦</span>
            </>
          )}
          {def.id === 'quick' && (
            <>
              <span className={gameStyles.wildCard}>A♠</span>
              <span className={gameStyles.wildCard}>10♥</span>
              <span className={gameStyles.wildCard}>J♦</span>
            </>
          )}
          {def.id === 'purist' && (
            <>
              <span className={gameStyles.wildCard}>Q♠</span>
              <span className={gameStyles.wildCard}>8♣</span>
              <span className={gameStyles.wildCard}>3♥</span>
            </>
          )}
        </span>
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
