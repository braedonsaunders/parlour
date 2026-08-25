'use client';

import { useWipeRouter } from '@/hooks/useWipeRouter';
import { useState } from 'react';
import { GameArt } from '@/components/GameArt';
import { GameSetupScreen, SetupActions } from '@/components/setup';
import { getGameMode } from '@/lib/games';
import { useT } from '@/lib/i18n';
import { useLocalizedGame, useLocalizedModes } from '@/lib/i18n/gameContent';
import { KLONDIKE_MODES, utcDailyKey, type KlondikeModeId } from '@/lib/klondike/modes';
import { dailyResultFor, dailyStreak, useKlondikeStatsStore } from '@/stores/klondikeStats';
import { useKlondikeSetupStore } from '@/stores/klondikeSetup';

export default function KlondikeSetupPage() {
  const router = useWipeRouter();
  const storedMode = useKlondikeSetupStore((state) => state.mode);
  const startRun = useKlondikeSetupStore((state) => state.start);
  const winnableOnly = useKlondikeSetupStore((state) => state.winnableOnly);
  const setWinnableOnly = useKlondikeSetupStore((state) => state.setWinnableOnly);
  const [mode, setMode] = useState<KlondikeModeId>(storedMode);
  const [starting, setStarting] = useState(false);
  const todayKey = utcDailyKey(new Date());
  const stats = useKlondikeStatsStore();
  const today = dailyResultFor(stats.dailyResults, todayKey);
  const streak = dailyStreak(stats.dailyResults, todayKey);
  const t = useT();
  const shelfEntry = useLocalizedGame('klondike');
  const modes = useLocalizedModes('klondike', KLONDIKE_MODES);
  const selectedMode = modes.find((candidate) => candidate.id === mode);

  const start = () => {
    if (starting) return;
    setStarting(true);
    // Searching for a winnable deal is asynchronous; a failed search still deals,
    // so the table is reached either way.
    void startRun(mode, { now: new Date() })
      .catch(() => undefined)
      .finally(() => router.push('/klondike/table'));
  };

  return (
    <GameSetupScreen
      title={shelfEntry.name}
      eyebrow="setup.eyebrow.clearTable"
      modes={modes}
      modesLabel="setup.modes.klondikeDeal"
      selected={mode}
      onSelect={(id) => setMode(id as KlondikeModeId)}
      modeTestId={(def) => `klondike-${def.id}`}
      renderArt={(def) => {
        const art = getGameMode('klondike', def.id).art;
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
      {/* One panel rather than two stacked ones: on a phone the dashboard is
          what stands between the deal picker and the button that deals. */}
      <div className="panel-soft p-3.5" data-testid="klondike-daily-status">
        <p className="text-xs font-bold uppercase tracking-[0.2em] text-hearth-200">
          {t('setup.todayDate', { date: todayKey })}{' '}
          <span className="text-dusk-200">· {t.count('setup.dayStreak', streak)}</span>
        </p>
        <h2 className="mt-1 font-display text-lg font-extrabold text-hearth-50">
          {today ? t('setup.klondike.cleared') : t('setup.klondike.waiting')}
        </h2>
        <p className="mt-1 text-xs text-dusk-100/85">
          {today
            ? t('setup.klondike.best', {
                moves: today.bestMoves,
                time: formatTime(today.bestTimeMs),
              })
            : winnableOnly
              ? t('setup.klondike.waitingWinnable')
              : t('setup.klondike.waitingShuffle')}
        </p>
        <div className="mt-2.5 grid grid-cols-4 gap-2 border-t border-dusk-700/40 pt-2.5 text-center">
          <Stat label={t('setup.klondike.deals')} value={stats.dealsStarted} />
          <Stat label={t('stats.wins')} value={stats.wins} />
          <Stat label={t('setup.klondike.bestMoves')} value={stats.bestMoves ?? '—'} />
          <Stat
            label={t('setup.klondike.bestTime')}
            value={stats.bestTimeMs === null ? '—' : formatTime(stats.bestTimeMs)}
          />
        </div>
      </div>

      <WinnableToggle checked={winnableOnly} onChange={setWinnableOnly} disabled={starting} />

      <SetupActions
        busy={starting}
        actions={[
          {
            label:
              mode === 'daily'
                ? t('setup.playTodayDeal')
                : t('setup.playMode', { mode: selectedMode?.name ?? mode }),
            busyLabel: winnableOnly ? t('setup.busy.findingWinnable') : t('setup.busy.layingCards'),
            onClick: start,
            testId: 'start-klondike',
          },
        ]}
        note={t('setup.klondike.note')}
      />
    </GameSetupScreen>
  );
}

function WinnableToggle({
  checked,
  onChange,
  disabled,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled: boolean;
}) {
  const t = useT();
  return (
    <div className="mx-auto flex max-w-xl flex-col items-center gap-1">
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        data-testid="klondike-winnable-only"
        onClick={() => onChange(!checked)}
        className="pill-soft flex items-center gap-2.5 py-1.5 pl-2 pr-4 text-sm font-bold text-dusk-100 transition-transform duration-150 ease-pop hover:-translate-y-0.5 hover:text-hearth-200 disabled:pointer-events-none disabled:opacity-60"
      >
        <span
          aria-hidden="true"
          className={`relative block h-5 w-9 shrink-0 rounded-full transition-colors duration-150 ${
            checked ? 'bg-hearth-400/70' : 'bg-dusk-200/25'
          }`}
        >
          <span
            className={`absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-hearth-50 transition-transform duration-150 ease-pop ${
              checked ? 'translate-x-4' : 'translate-x-0'
            }`}
          />
        </span>
        {t('setup.klondike.winnableOnly')}
      </button>
      <p className="px-4 text-center text-xs text-dusk-200/80">
        {checked ? t('setup.klondike.winnableOn') : t('setup.klondike.winnableOff')}
      </p>
    </div>
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
