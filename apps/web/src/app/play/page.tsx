'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useCenteredCarousel } from '@/hooks/useCenteredCarousel';
import { MODES, type ModeDef, type PreviewKind } from '@/lib/modes';
import { useSetupStore } from '@/stores/setup';
import styles from '@/styles/modes.module.css';

const SEAT_OPTIONS = [2, 3, 4] as const;
const TIERS = [
  { tier: 1, label: 'Easy' },
  { tier: 2, label: 'Medium' },
  { tier: 3, label: 'Hard' },
] as const;

export default function ModeSelectPage() {
  const router = useRouter();
  const mode = useSetupStore((s) => s.mode);
  const seats = useSetupStore((s) => s.seats);
  const botTier = useSetupStore((s) => s.botTier);
  const setMode = useSetupStore((s) => s.setMode);
  const setSeats = useSetupStore((s) => s.setSeats);
  const setBotTier = useSetupStore((s) => s.setBotTier);
  const [starting, setStarting] = useState(false);
  const carouselRef = useCenteredCarousel(mode);

  const start = () => {
    if (starting) return;
    setStarting(true);
    router.push('/table');
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
          Blitz <span className="text-dusk-100/80">· pick your mode</span>
        </h1>
        <span className="w-16" aria-hidden="true" />
      </header>

      <div
        ref={carouselRef}
        className={`${styles.carousel} ${styles.centeredCarousel}`}
        role="radiogroup"
        aria-label="Match format"
      >
        {MODES.map((modeDef) => (
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
          <Stepper
            label="Seats"
            value={`${seats}`}
            options={SEAT_OPTIONS.map(String)}
            onPick={(raw) => setSeats(Number(raw))}
            hint={`you + ${seats - 1} bot${seats > 2 ? 's' : ''}`}
          />
          <Stepper
            label="Bot skill"
            value={TIERS.find((t) => t.tier === botTier)!.label}
            options={TIERS.map((t) => t.label)}
            onPick={(label) => setBotTier(TIERS.find((t) => t.label === label)!.tier)}
          />
        </div>

        <button
          type="button"
          onClick={start}
          disabled={starting}
          className="btn-fat mx-auto w-72 text-lg"
          data-testid="deal-me-in"
        >
          {starting ? 'Setting the table…' : 'Deal me in'}
        </button>

        <div className="flex items-center justify-center gap-3">
          <button
            type="button"
            onClick={() => router.push('/join')}
            className="btn-fat btn-fat--teal w-40"
          >
            Join Room
          </button>
          <button
            type="button"
            onClick={() => router.push('/create')}
            className="btn-fat btn-fat--ghost w-40"
          >
            Create Room
          </button>
        </div>
        <p className="text-center text-xs text-dusk-200/80">
          Rooms play with friends over a share code — solo deals you in with the bots above.
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
  def: ModeDef;
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
      <Preview kind={def.preview} />
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

function Preview({ kind }: { kind: PreviewKind }) {
  return (
    <span className={styles.preview}>
      {kind === 'lives' && (
        <span className={styles.chipRow}>
          <span className={styles.lifeChip} />
          <span className={styles.lifeChip} />
          <span className={styles.lifeChip} />
        </span>
      )}
      {kind === 'snap' && (
        <>
          <span className={styles.snapPile} />
          <span className={styles.snapCard}>31</span>
          <span className={styles.snapCard}>K♠</span>
        </>
      )}
      {kind === 'clock' && (
        <span className={styles.clockFace}>
          <span className={styles.clockHand} />
          <span className={styles.clockTick} />
        </span>
      )}
    </span>
  );
}

function Stepper({
  label,
  value,
  options,
  onPick,
  hint,
}: {
  label: string;
  value: string;
  options: readonly string[];
  onPick: (value: string) => void;
  hint?: string;
}) {
  return (
    <div>
      <p className="text-xs font-bold uppercase tracking-[0.2em] text-dusk-200">{label}</p>
      <div className="mt-1.5 flex items-center gap-2" role="group" aria-label={label}>
        {options.map((option) => (
          <button
            key={option}
            type="button"
            aria-pressed={option === value}
            onClick={() => onPick(option)}
            className={`rounded-fat border-2 px-3.5 py-1.5 font-display text-sm font-extrabold transition-transform duration-150 ease-pop hover:-translate-y-0.5 ${
              option === value
                ? 'border-hearth-700 bg-gradient-to-b from-hearth-300 to-hearth-500 text-hearth-900'
                : 'border-dusk-700/60 bg-dusk-950/70 text-dusk-100'
            }`}
          >
            {option}
          </button>
        ))}
      </div>
      {hint && <p className="mt-1 text-xs text-dusk-200/80">{hint}</p>}
    </div>
  );
}
