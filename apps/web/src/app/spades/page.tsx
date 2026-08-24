'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { GameArt } from '@/components/GameArt';
import { BotDifficultyPicker } from '@/components/setup/BotDifficultyPicker';
import { useCenteredCarousel } from '@/hooks/useCenteredCarousel';
import { SPADES_MODES, type SpadesModeDef } from '@/lib/spades/modes';
import { getGameMode } from '@/lib/games';
import { useSpadesSetupStore } from '@/stores/spadesSetup';
import styles from '@/styles/modes.module.css';

export default function SpadesSetupPage() {
  const router = useRouter();
  const mode = useSpadesSetupStore((s) => s.mode);
  const botTier = useSpadesSetupStore((s) => s.botTier);
  const setMode = useSpadesSetupStore((s) => s.setMode);
  const setBotTier = useSpadesSetupStore((s) => s.setBotTier);
  const [starting, setStarting] = useState(false);
  const carouselRef = useCenteredCarousel(mode);

  const startSolo = () => {
    if (starting) return;
    setStarting(true);
    router.push('/spades/table');
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
          Spades <span className="text-dusk-100/80">· pick your table</span>
        </h1>
        <span className="w-16" aria-hidden="true" />
      </header>

      <div
        ref={carouselRef}
        className={`${styles.carousel} ${styles.centeredCarousel}`}
        role="radiogroup"
        aria-label="House rules"
      >
        {SPADES_MODES.map((modeDef) => (
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
            <p className="mt-1.5 font-display text-sm font-extrabold text-hearth-100">
              4 players · two partnerships
            </p>
            <p className="mt-1 text-xs text-dusk-200/80">
              you + a bot partner across from you, two bot opponents flanking — or bring three
              friends
            </p>
          </div>
          <BotDifficultyPicker value={botTier} onChange={setBotTier} />
        </div>

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
            onClick={() => router.push('/spades/create')}
            disabled={starting}
            className="btn-fat btn-fat--teal w-64 text-lg"
            data-testid="create-spades-room"
          >
            Create friend room
          </button>
          <Link href="/join" className="btn-fat btn-fat--ghost w-64 text-center text-lg">
            Join with a code
          </Link>
        </div>

        <p className="text-center text-xs text-dusk-200/80">
          Friend rooms use the same four-character codes, live replay sync, and reconnect flow as
          every parlour table.
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
  def: SpadesModeDef;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
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
      <GameArt cards={getGameMode('spades', def.id).art} />
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
  );
}
