'use client';

import Link from 'next/link';
import { useWipeRouter } from '@/hooks/useWipeRouter';
import { useState } from 'react';
import { cribbageConfigSchema, cribbageHowToPlay } from '@parlour/game-cribbage';
import { GameArt } from '@/components/GameArt';
import { HowToPlayButton } from '@/components/HowToPlay';
import { RuleSettings } from '@/components/settings/RuleSettings';
import { BotDifficultyPicker } from '@/components/setup/BotDifficultyPicker';
import { useCenteredCarousel } from '@/hooks/useCenteredCarousel';
import { CRIBBAGE_MODES, type CribbageModeDef } from '@/lib/cribbage/modes';
import { cribbageRulesFor, useCribbageSetupStore } from '@/stores/cribbageSetup';
import modeStyles from '@/styles/modes.module.css';
import gameStyles from '@/styles/games.module.css';

export default function CribbageSetupPage() {
  const router = useWipeRouter();
  const mode = useCribbageSetupStore((state) => state.mode);
  const botTier = useCribbageSetupStore((state) => state.botTier);
  const overrides = useCribbageSetupStore((state) => state.overrides);
  const setMode = useCribbageSetupStore((state) => state.setMode);
  const setBotTier = useCribbageSetupStore((state) => state.setBotTier);
  const setRule = useCribbageSetupStore((state) => state.setRule);
  const resetRules = useCribbageSetupStore((state) => state.resetRules);
  const [starting, setStarting] = useState(false);
  const carouselRef = useCenteredCarousel(mode);
  const rules = cribbageRulesFor(mode, overrides);
  const matchPlay = rules.gamesToWin > 1;

  const startSolo = () => {
    if (starting) return;
    setStarting(true);
    router.push('/cribbage/table');
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
          Cribbage <span className="text-dusk-100/80">· choose your board</span>
        </h1>
        <HowToPlayButton doc={cribbageHowToPlay} title="Cribbage" subtitle="the pegging race" />
      </header>

      <div
        ref={carouselRef}
        className={`${modeStyles.carousel} ${modeStyles.centeredCarousel}`}
        role="radiogroup"
        aria-label="Cribbage format"
      >
        {CRIBBAGE_MODES.map((modeDef) => (
          <ModeTile
            key={modeDef.id}
            def={modeDef}
            selected={modeDef.id === mode}
            onSelect={() => setMode(modeDef.id)}
          />
        ))}
      </div>

      <section
        className="mx-auto mb-auto flex w-full max-w-3xl flex-col gap-4 px-6 pb-8"
        aria-label="Table setup"
      >
        <div className="panel-soft flex flex-wrap items-center justify-between gap-4 p-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-dusk-200">Table</p>
            <p className="mt-1 font-display font-extrabold text-hearth-50">
              Two seats · you deal first
            </p>
            <p className="text-xs text-dusk-200/80">dealer alternates every hand</p>
          </div>
          <BotDifficultyPicker value={botTier} onChange={setBotTier} />
        </div>

        <RuleSettings
          schema={cribbageConfigSchema}
          values={rules}
          onChange={setRule}
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
            {starting ? 'Setting the pegs…' : matchPlay ? 'Start solo match' : 'Play solo'}
          </button>
          <button
            type="button"
            onClick={() => router.push('/cribbage/create')}
            disabled={starting || matchPlay}
            className="btn-fat btn-fat--teal w-64 text-lg"
            data-testid="create-cribbage-room"
            title={matchPlay ? 'Friend rooms currently play one complete race to 121' : undefined}
          >
            Create friend room
          </button>
          <Link href="/join" className="btn-fat btn-fat--ghost w-64 text-center text-lg">
            Join with a code
          </Link>
        </div>
        <p className="text-center text-xs text-dusk-200/80">
          {matchPlay
            ? 'Match Play is available solo; friend rooms play one complete 121-point game.'
            : 'Friend rooms share the same host-authoritative replay log and reconnect flow as the rest of Parlour.'}
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
  def: CribbageModeDef;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <div className={gameStyles.tileWrap}>
      <HowToPlayButton
        doc={cribbageHowToPlay}
        title={def.name}
        subtitle={`Cribbage · ${def.tagline}`}
        variant="chip"
        className={gameStyles.tileHelp}
      />
      <button
        type="button"
        role="radio"
        aria-checked={selected}
        data-selected={selected}
        onClick={onSelect}
        className={modeStyles.tile}
        style={{
          ['--tile-accent' as string]: def.accent,
          ['--tile-accent-soft' as string]: `${def.accent}44`,
        }}
      >
        <span className={modeStyles.tileGlow} />
        <GameArt cards={def.art} motif={def.motif} />
        <span className={modeStyles.tagline}>{def.tagline}</span>
        <h2 className={modeStyles.modeName}>{def.name}</h2>
        <span className={modeStyles.facts}>
          {def.facts.map((fact) => (
            <span key={fact} className={modeStyles.fact}>
              {fact}
            </span>
          ))}
        </span>
        <p className={modeStyles.description}>{def.description}</p>
      </button>
    </div>
  );
}
