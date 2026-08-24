'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { MAX_SEATS, MIN_SEATS } from '@parlour/game-ohhell';
import { GameArt } from '@/components/GameArt';
import { BotDifficultyPicker } from '@/components/setup/BotDifficultyPicker';
import { useCenteredCarousel } from '@/hooks/useCenteredCarousel';
import { OHHELL_MODES, type OhHellModeDef } from '@/lib/ohhell/modes';
import { getGameMode } from '@/lib/games';
import { useOhHellSetupStore } from '@/stores/ohhellSetup';
import styles from '@/styles/modes.module.css';

const SEAT_CHOICES = Array.from(
  { length: MAX_SEATS - MIN_SEATS + 1 },
  (_, index) => MIN_SEATS + index,
);

export default function OhHellSetupPage() {
  const router = useRouter();
  const mode = useOhHellSetupStore((s) => s.mode);
  const seats = useOhHellSetupStore((s) => s.seats);
  const botTier = useOhHellSetupStore((s) => s.botTier);
  const setMode = useOhHellSetupStore((s) => s.setMode);
  const setSeats = useOhHellSetupStore((s) => s.setSeats);
  const setBotTier = useOhHellSetupStore((s) => s.setBotTier);
  const [starting, setStarting] = useState(false);
  const carouselRef = useCenteredCarousel(mode);

  const startSolo = () => {
    if (starting) return;
    setStarting(true);
    router.push('/ohhell/table');
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
          Oh Hell! <span className="text-dusk-100/80">· pick your table</span>
        </h1>
        <span className="w-16" aria-hidden="true" />
      </header>

      <div
        ref={carouselRef}
        className={`${styles.carousel} ${styles.centeredCarousel}`}
        role="radiogroup"
        aria-label="House rules"
      >
        {OHHELL_MODES.map((modeDef) => (
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
            <div
              className="mt-1.5 flex flex-wrap gap-1.5"
              role="radiogroup"
              aria-label="Number of players"
            >
              {SEAT_CHOICES.map((count) => (
                <button
                  key={count}
                  type="button"
                  role="radio"
                  aria-checked={count === seats}
                  data-selected={count === seats}
                  data-testid={`ohhell-seats-${count}`}
                  onClick={() => setSeats(count)}
                  className="pill-soft min-h-11 min-w-11 px-3 font-display text-sm font-extrabold text-hearth-100 aria-checked:bg-hearth-200/25"
                >
                  {count}
                </button>
              ))}
            </div>
            <p className="mt-1 text-xs text-dusk-200/80">
              {/* The deal ceiling is what makes the seat count a real choice: more
                  seats means shorter hands and a shorter arc. */}
              more seats, smaller hands — the arc peaks at {Math.floor(51 / seats)} card
              {Math.floor(51 / seats) === 1 ? '' : 's'}
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
            onClick={() => router.push('/ohhell/create')}
            disabled={starting}
            className="btn-fat btn-fat--teal w-64 text-lg"
            data-testid="create-ohhell-room"
          >
            Create friend room
          </button>
          <Link href="/join" className="btn-fat btn-fat--ghost w-64 text-center text-lg">
            Join with a code
          </Link>
        </div>

        <p className="text-center text-xs text-dusk-200/80">
          A friend room deals one round. The full up-and-down arc — and the dealer rotating with it
          — is a solo match for now.
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
  def: OhHellModeDef;
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
      <GameArt cards={getGameMode('ohhell', def.id).art} />
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
