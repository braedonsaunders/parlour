'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useCenteredCarousel } from '@/hooks/useCenteredCarousel';
import { EUCHRE_MODES, type EuchreModeDef } from '@/lib/euchre/modes';
import { useEuchreSetupStore } from '@/stores/euchreSetup';
import styles from '@/styles/modes.module.css';

export default function EuchreSetupPage() {
  const router = useRouter();
  const mode = useEuchreSetupStore((s) => s.mode);
  const setMode = useEuchreSetupStore((s) => s.setMode);
  const [starting, setStarting] = useState(false);
  const carouselRef = useCenteredCarousel(mode);

  const startSolo = () => {
    if (starting) return;
    setStarting(true);
    router.push('/euchre/table');
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
          Euchre <span className="text-dusk-100/80">· pick your table</span>
        </h1>
        <span className="w-16" aria-hidden="true" />
      </header>

      <div
        ref={carouselRef}
        className={`${styles.carousel} ${styles.centeredCarousel}`}
        role="radiogroup"
        aria-label="House rules"
      >
        {EUCHRE_MODES.map((modeDef) => (
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
          <span className="pill-soft font-display text-sm font-extrabold" aria-hidden="true">
            ♠♥ · ♦♣
          </span>
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
            onClick={() => router.push('/euchre/create')}
            disabled={starting}
            className="btn-fat btn-fat--teal w-64 text-lg"
            data-testid="create-euchre-room"
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
  def: EuchreModeDef;
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
        <span className="font-display text-2xl font-black">J♠</span>
        <span className="font-display text-2xl font-black opacity-80">J♣</span>
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
