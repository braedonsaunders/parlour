'use client';

import { useWipeRouter } from '@/hooks/useWipeRouter';
import { useState } from 'react';
import { GameArt } from '@/components/GameArt';
import { GameSetupScreen, SetupActions } from '@/components/setup';
import { getGameMode } from '@/lib/games';
import { useT } from '@/lib/i18n';
import { useLocalizedGame, useLocalizedModes } from '@/lib/i18n/gameContent';
import { FREECELL_MODES, utcDailyKey, type FreecellModeId } from '@/lib/freecell/modes';
import { dailyResultFor, dailyStreak, useFreecellStatsStore } from '@/stores/freecellStats';
import { useFreecellSetupStore } from '@/stores/freecellSetup';

export default function FreecellSetupPage() {
  const router = useWipeRouter();
  const storedMode = useFreecellSetupStore((state) => state.mode);
  const startRun = useFreecellSetupStore((state) => state.start);
  const [mode, setMode] = useState<FreecellModeId>(storedMode);
  const todayKey = utcDailyKey(new Date());
  const stats = useFreecellStatsStore();
  const today = dailyResultFor(stats.dailyResults, todayKey);
  const streak = dailyStreak(stats.dailyResults, todayKey);
  const t = useT();
  const shelfEntry = useLocalizedGame('freecell');
  const modes = useLocalizedModes('freecell', FREECELL_MODES);
  const selectedMode = modes.find((candidate) => candidate.id === mode);

  const start = () => {
    startRun(mode, { now: new Date() });
    router.push('/freecell/table');
  };

  return (
    <GameSetupScreen
      title={shelfEntry.name}
      eyebrow="setup.eyebrow.clearTable"
      modes={modes}
      modesLabel="setup.modes.freecellDeal"
      selected={mode}
      onSelect={(id) => setMode(id as FreecellModeId)}
      modeTestId={(def) => `freecell-${def.id}`}
      renderArt={(def) => {
        const art = getGameMode('freecell', def.id).art;
        return art ? (
          <GameArt cards={art} />
        ) : (
          <span
            className="grid min-h-28 place-items-center font-display text-7xl text-hearth-100"
            aria-hidden="true"
          >
            ◷
          </span>
        );
      }}
    >
      <div className="panel-soft p-3.5" data-testid="freecell-daily-status">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-hearth-200">
          {t('setup.todayDate', { date: todayKey })}{' '}
          <span className="text-dusk-200">· {t.count('setup.dayStreak', streak)}</span>
        </p>
        <h2 className="mt-1 font-display text-lg font-extrabold text-hearth-50">
          {today ? t('setup.freecell.cleared') : t('setup.freecell.waiting')}
        </h2>
        <p className="mt-1 text-xs text-dusk-100/85">
          {today
            ? t('setup.freecell.best', {
                moves: today.bestMoves,
                time: formatTime(today.bestTimeMs),
              })
            : t('setup.freecell.waitingHint')}
        </p>
        <div className="mt-2.5 grid grid-cols-4 gap-2 border-t border-dusk-700/40 pt-2.5 text-center">
          <Stat label={t('setup.freecell.deals')} value={stats.dealsStarted} />
          <Stat label={t('stats.wins')} value={stats.wins} />
          <Stat label={t('setup.freecell.bestMoves')} value={stats.bestMoves ?? '—'} />
          <Stat
            label={t('setup.freecell.bestTime')}
            value={stats.bestTimeMs === null ? '—' : formatTime(stats.bestTimeMs)}
          />
        </div>
      </div>

      <SetupActions
        actions={[
          {
            label:
              mode === 'daily'
                ? t('setup.playTodayDeal')
                : t('setup.playMode', { mode: selectedMode?.name ?? mode }),
            onClick: start,
            testId: 'start-freecell',
          },
        ]}
        note={t('setup.freecell.note')}
      />
    </GameSetupScreen>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div>
      <strong className="block font-display text-lg text-hearth-50">{value}</strong>
      <span className="text-[0.6rem] font-bold uppercase tracking-[0.12em] text-dusk-200">
        {label}
      </span>
    </div>
  );
}

function formatTime(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
}
