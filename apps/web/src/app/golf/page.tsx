'use client';

import { useWipeRouter } from '@/hooks/useWipeRouter';
import { useState } from 'react';
import { GameArt } from '@/components/GameArt';
import { GameSetupScreen, SetupActions } from '@/components/setup';
import { getGameMode } from '@/lib/games';
import { useT } from '@/lib/i18n';
import { useLocalizedGame, useLocalizedModes } from '@/lib/i18n/gameContent';
import { GOLF_MODES, utcDailyKey, type GolfModeId } from '@/lib/golf/modes';
import { dailyResultFor, dailyStreak, useGolfStatsStore } from '@/stores/golfStats';
import { useGolfSetupStore } from '@/stores/golfSetup';

export default function GolfSetupPage() {
  const router = useWipeRouter();
  const storedMode = useGolfSetupStore((state) => state.mode);
  const startRun = useGolfSetupStore((state) => state.start);
  const [mode, setMode] = useState<GolfModeId>(storedMode);
  const todayKey = utcDailyKey(new Date());
  const stats = useGolfStatsStore();
  const today = dailyResultFor(stats.dailyResults, todayKey);
  const streak = dailyStreak(stats.dailyResults, todayKey);
  const t = useT();
  const shelfEntry = useLocalizedGame('golf');
  const modes = useLocalizedModes('golf', GOLF_MODES);
  const selectedMode = modes.find((candidate) => candidate.id === mode);

  const start = () => {
    startRun(mode, { now: new Date() });
    router.push('/golf/table');
  };

  return (
    <GameSetupScreen
      title={shelfEntry.name}
      eyebrow="setup.eyebrow.playOntoHole"
      modes={modes}
      modesLabel="setup.modes.golfHole"
      selected={mode}
      onSelect={(id) => setMode(id as GolfModeId)}
      modeTestId={(def) => `golf-${def.id}`}
      renderArt={(def) => {
        const art = getGameMode('golf', def.id).art;
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
      <div className="panel-soft p-3.5" data-testid="golf-daily-status">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-hearth-200">
          {t('setup.todayDate', { date: todayKey })}{' '}
          <span className="text-dusk-200">· {t.count('setup.dayStreak', streak)}</span>
        </p>
        <h2 className="mt-1 font-display text-lg font-extrabold text-hearth-50">
          {today ? t('setup.golf.posted') : t('setup.golf.waiting')}
        </h2>
        <p className="mt-1 text-xs text-dusk-100/85">
          {today
            ? t('setup.golf.best', { score: today.bestScore, time: formatTime(today.bestTimeMs) })
            : t('setup.golf.waitingHint')}
        </p>
        <div className="mt-2.5 grid grid-cols-4 gap-2 border-t border-dusk-700/40 pt-2.5 text-center">
          <Stat label={t('setup.golf.holes')} value={stats.holesCompleted} />
          <Stat label={t('setup.golf.clears')} value={stats.clears} />
          <Stat label={t('setup.golf.bestScore')} value={stats.bestScore ?? '—'} />
          <Stat
            label={t('setup.golf.bestClear')}
            value={stats.bestTimeMs === null ? '—' : formatTime(stats.bestTimeMs)}
          />
        </div>
      </div>

      <SetupActions
        actions={[
          {
            label:
              mode === 'daily'
                ? t('setup.playTodayHole')
                : t('setup.playMode', { mode: selectedMode?.name ?? mode }),
            onClick: start,
            testId: 'start-golf',
          },
        ]}
        note={t('setup.golf.note')}
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
