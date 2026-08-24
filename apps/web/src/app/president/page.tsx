'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useCenteredCarousel } from '@/hooks/useCenteredCarousel';
import {
  PRESIDENT_MODES,
  type PresidentModeDef,
} from '@/lib/president/modes';
import {
  PRESIDENT_SEAT_OPTIONS,
  usePresidentSetupStore,
} from '@/stores/presidentSetup';
import styles from '@/styles/modes.module.css';
import gameStyles from '@/styles/games.module.css';

export default function PresidentSetupPage() {
  const router = useRouter();
  const mode = usePresidentSetupStore((s) => s.mode);
  const seats = usePresidentSetupStore((s) => s.seats);
  const setMode = usePresidentSetupStore((s) => s.setMode);
  const setSeats = usePresidentSetupStore((s) => s.setSeats);
  const [starting, setStarting] = useState(false);
  const carouselRef = useCenteredCarousel(mode);

  const startSolo = () => {
    if (starting) return;
    setStarting(true);
    router.push('/president/table');
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
          President <span className="text-dusk-100/80">· claim the crown</span>
        </h1>
        <span className="w-16" aria-hidden="true" />
      </header>

      <div
        ref={carouselRef}
        className={`${styles.carousel} ${styles.centeredCarousel}`}
        role="radiogroup"
        aria-label="Match format"
      >
        {PRESIDENT_MODES.map((modeDef) => (
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
            <div className="mt-1.5 flex items-center gap-2" role="group" aria-label="Seats">
              {PRESIDENT_SEAT_OPTIONS.map((option) => (
                <button
                  key={option}
                  type="button"
                  aria-pressed={option === seats}
                  onClick={() => setSeats(option)}
                  className={`rounded-fat border-2 px-3.5 py-1.5 font-display text-sm font-extrabold transition-transform duration-150 ease-pop hover:-translate-y-0.5 ${
                    option === seats
                      ? 'border-hearth-700 bg-gradient-to-b from-hearth-300 to-hearth-500 text-hearth-900'
                      : 'border-dusk-700/60 bg-dusk-950/70 text-dusk-100'
                  }`}
                >
                  {option}
                </button>
              ))}
            </div>
            <p className="mt-1 text-xs text-dusk-200/80">
              you + {seats - 1} bot{seats > 2 ? 's' : ''} — the full ladder, crowns included
            </p>
          </div>
        </div>

        <div className="mx-auto flex w-full max-w-xl flex-wrap justify-center gap-3">
          <button
            type="button"
            onClick={startSolo}
            disabled={starting}
            className="btn-fat w-64 text-lg"
            data-testid="deal-me-in"
          >
            {starting ? 'Cutting the deck…' : 'Play solo'}
          </button>
          <button
            type="button"
            onClick={() => router.push('/president/create')}
            disabled={starting}
            className="btn-fat btn-fat--teal w-64 text-lg"
            data-testid="create-president-room"
          >
            Create friend room
          </button>
          <Link href="/join" className="btn-fat btn-fat--ghost w-64 text-center text-lg">
            Join with a code
          </Link>
        </div>

        <p className="text-center text-xs text-dusk-200/80">
          Friend rooms use the same four-character codes, live replay sync, and reconnect flow as
          every parlour table — with room for up to eight chairs.
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
  def: PresidentModeDef;
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
      <span className={styles.preview}>
        <span className={gameStyles.presCard}>3</span>
        <span className={gameStyles.presCard}>{def.id === 'rapid' ? '⚡' : def.id === 'marathon' ? '∞' : '♛'}</span>
        <span className={gameStyles.presCard}>2</span>
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
  );
}
