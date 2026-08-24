'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { wildpileConfig, wildpileHowToPlay } from '@parlour/game-wildpile';
import { HowToPlayButton } from '@/components/HowToPlay';
import { RuleSettings } from '@/components/settings/RuleSettings';
import { useCenteredCarousel } from '@/hooks/useCenteredCarousel';
import { WILD_MODES, type WildModeDef } from '@/lib/wild/modes';
import { useWildSetupStore, wildRulesFor } from '@/stores/wildSetup';
import styles from '@/styles/modes.module.css';
import gameStyles from '@/styles/games.module.css';

const SEAT_OPTIONS = [2, 3, 4] as const;

/** Two cards that read as the mode at a glance, behind the shared 7. */
const PREVIEW_CARDS: Record<string, readonly [string, string]> = {
  classic: ['↻', '⊘'],
  party: ['+4', '⚡'],
  houseRules: ['⇄', '0'],
};

export default function WildSetupPage() {
  const router = useRouter();
  const mode = useWildSetupStore((s) => s.mode);
  const seats = useWildSetupStore((s) => s.seats);
  const setMode = useWildSetupStore((s) => s.setMode);
  const setSeats = useWildSetupStore((s) => s.setSeats);
  const overrides = useWildSetupStore((s) => s.overrides);
  const setRule = useWildSetupStore((s) => s.setRule);
  const resetRules = useWildSetupStore((s) => s.resetRules);
  const [starting, setStarting] = useState(false);
  const carouselRef = useCenteredCarousel(mode);

  const startSolo = () => {
    if (starting) return;
    setStarting(true);
    router.push('/wild/table');
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
          Wild <span className="text-dusk-100/80">· pick your pile</span>
        </h1>
        <HowToPlayButton doc={wildpileHowToPlay} title="Wild" subtitle="the shedding game" />
      </header>

      <div
        ref={carouselRef}
        className={`${styles.carousel} ${styles.centeredCarousel}`}
        role="radiogroup"
        aria-label="House rules"
      >
        {WILD_MODES.map((modeDef) => (
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
              {SEAT_OPTIONS.map((option) => (
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
              you + {seats - 1} bot{seats > 2 ? 's' : ''}
            </p>
          </div>
        </div>

        <RuleSettings
          schema={wildpileConfig}
          values={wildRulesFor(mode, overrides)}
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
            {starting ? 'Shuffling the pile…' : 'Play solo'}
          </button>
          <button
            type="button"
            onClick={() => router.push('/wild/create')}
            disabled={starting}
            className="btn-fat btn-fat--teal w-64 text-lg"
            data-testid="create-wild-room"
          >
            Create friend room
          </button>
          <Link href="/join" className="btn-fat btn-fat--ghost w-64 text-center text-lg">
            Join with a code
          </Link>
        </div>

        <p className="text-center text-xs text-dusk-200/80">
          Friend rooms use the same four-character codes, live replay sync, and reconnect flow as
          Blitz.
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
  def: WildModeDef;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <div className={gameStyles.tileWrap}>
      <HowToPlayButton
        doc={wildpileHowToPlay}
        title={def.name}
        subtitle={`Wild · ${def.tagline}`}
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
          <span className={gameStyles.wildCard}>7</span>
          {(PREVIEW_CARDS[def.id] ?? PREVIEW_CARDS.classic ?? []).map((pip, index) => (
            <span key={index} className={gameStyles.wildCard}>
              {pip}
            </span>
          ))}
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
