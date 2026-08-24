'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { GameArt } from '@/components/GameArt';
import { getGameMode } from '@/lib/games';
import {
  KLONDIKE_MODES,
  utcDailyKey,
  type KlondikeModeDef,
  type KlondikeModeId,
} from '@/lib/klondike/modes';
import { dailyResultFor, dailyStreak, useKlondikeStatsStore } from '@/stores/klondikeStats';
import { useKlondikeSetupStore } from '@/stores/klondikeSetup';
import modeStyles from '@/styles/modes.module.css';

export default function KlondikeSetupPage() {
  const router = useRouter();
  const storedMode = useKlondikeSetupStore((state) => state.mode);
  const startRun = useKlondikeSetupStore((state) => state.start);
  const [mode, setMode] = useState<KlondikeModeId>(storedMode);
  const [starting, setStarting] = useState(false);
  const todayKey = utcDailyKey(new Date());
  const stats = useKlondikeStatsStore();
  const today = dailyResultFor(stats.dailyResults, todayKey);
  const streak = dailyStreak(stats.dailyResults, todayKey);

  const start = () => {
    if (starting) return;
    setStarting(true);
    startRun(mode, { now: new Date() });
    router.push('/klondike/table');
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
          Klondike <span className="text-dusk-100/80">· clear the table</span>
        </h1>
        <span className="w-16" aria-hidden="true" />
      </header>

      <section
        className="mx-auto mt-7 grid w-[min(66rem,calc(100%-2rem))] grid-cols-1 gap-4 md:grid-cols-3"
        role="radiogroup"
        aria-label="Klondike deal"
      >
        {KLONDIKE_MODES.map((definition) => (
          <ModeTile
            key={definition.id}
            definition={definition}
            selected={mode === definition.id}
            onSelect={() => setMode(definition.id)}
          />
        ))}
      </section>

      <section
        className="mx-auto my-6 grid w-[min(54rem,calc(100%-2rem))] gap-4 md:grid-cols-[1.4fr_1fr]"
        aria-label="Solitaire dashboard"
      >
        <div className="panel-soft p-5" data-testid="klondike-daily-status">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-hearth-200">
            Today · {todayKey}
          </p>
          <h2 className="mt-2 font-display text-2xl font-extrabold text-hearth-50">
            {today ? 'Daily table cleared' : 'Your daily table is waiting'}
          </h2>
          <p className="mt-2 text-sm text-dusk-100/85">
            {today
              ? `Best: ${today.bestMoves} moves · ${formatTime(today.bestTimeMs)}`
              : 'A deterministic Draw Three deal shared by every player. Some shuffled deals may not be solvable.'}
          </p>
          <p className="mt-3 text-xs font-bold uppercase tracking-[0.16em] text-dusk-200">
            {streak} day streak
          </p>
        </div>
        <div className="panel-soft grid grid-cols-2 gap-3 p-5 text-center">
          <Stat label="Deals" value={stats.dealsStarted} />
          <Stat label="Wins" value={stats.wins} />
          <Stat label="Best moves" value={stats.bestMoves ?? '—'} />
          <Stat
            label="Best time"
            value={stats.bestTimeMs === null ? '—' : formatTime(stats.bestTimeMs)}
          />
        </div>
      </section>

      <div className="mx-auto mb-9 flex flex-col items-center gap-3">
        <button
          type="button"
          className="btn-fat w-72 text-lg"
          data-testid="start-klondike"
          onClick={start}
          disabled={starting}
        >
          {starting
            ? 'Laying out the cards…'
            : mode === 'daily'
              ? "Play today's deal"
              : `Play ${mode}`}
        </button>
        <p className="max-w-xl px-4 text-center text-xs text-dusk-200/80">
          Solo and offline. Undo, hints, and safe auto-finish stay on your device; no account or
          room code needed.
        </p>
      </div>
    </main>
  );
}

function ModeTile({
  definition,
  selected,
  onSelect,
}: {
  definition: KlondikeModeDef;
  selected: boolean;
  onSelect: () => void;
}) {
  const catalogMode = getGameMode('klondike', definition.id);
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      data-selected={selected}
      data-testid={`klondike-${definition.id}`}
      onClick={onSelect}
      className={modeStyles.tile}
      style={{
        ['--tile-accent' as string]: definition.accent,
        ['--tile-accent-soft' as string]: `${definition.accent}44`,
      }}
    >
      <span className={modeStyles.tileGlow} />
      {catalogMode.art ? (
        <GameArt cards={catalogMode.art} />
      ) : (
        <span
          className="grid min-h-28 place-items-center font-display text-7xl text-hearth-100"
          aria-hidden="true"
        >
          ◷
        </span>
      )}
      <span className={modeStyles.tagline}>{definition.tagline}</span>
      <h2 className={modeStyles.modeName}>{definition.name}</h2>
      <span className={modeStyles.facts}>
        {definition.facts.map((fact) => (
          <span key={fact} className={modeStyles.fact}>
            {fact}
          </span>
        ))}
      </span>
      <p className={modeStyles.description}>{definition.description}</p>
    </button>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div>
      <strong className="block font-display text-2xl text-hearth-50">{value}</strong>
      <span className="text-[0.65rem] font-bold uppercase tracking-[0.14em] text-dusk-200">
        {label}
      </span>
    </div>
  );
}

function formatTime(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}
