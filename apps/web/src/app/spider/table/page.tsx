'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { SpiderTableScreen } from '@/components/table/spider/SpiderTableScreen';
import { makeSpiderRun, rulesForSpiderMode, utcDailyKey, type SpiderRun } from '@/lib/spider/modes';
import { spiderTableView } from '@/lib/spider/view';
import { SpiderTransport, type SpiderSnapshot } from '@/lib/solo/SpiderTransport';
import { useSoloTable } from '@/lib/table/useSoloTable';
import { dailyResultFor, dailyStreak, useSpiderStatsStore } from '@/stores/spiderStats';
import { useSpiderSetupStore } from '@/stores/spiderSetup';
import { useProfileStore } from '@/stores/profile';

export default function SpiderTablePage() {
  const router = useRouter();
  const storedRun = useSpiderSetupStore((state) => state.run);
  const replaceRun = useSpiderSetupStore((state) => state.replaceRun);
  const [run, setRun] = useState<SpiderRun>(() => storedRun ?? makeSpiderRun('daily'));

  useEffect(() => {
    if (!storedRun) replaceRun(run);
  }, [replaceRun, run, storedRun]);

  return (
    <ActiveSpiderTable
      key={run.id}
      run={run}
      onRun={(next) => {
        replaceRun(next);
        setRun(next);
      }}
      onQuit={() => router.push('/spider')}
    />
  );
}

function ActiveSpiderTable({
  run,
  onRun,
  onQuit,
}: {
  run: SpiderRun;
  onRun: (run: SpiderRun) => void;
  onQuit: () => void;
}) {
  const [transport] = useState(
    () =>
      new SpiderTransport({
        mode: run.mode,
        dailyKey: run.dailyKey,
        seed: run.seed,
        rules: rulesForSpiderMode(run.mode),
      }),
  );
  const { snapshot, fx, fxKey, error, dispatch, accept } = useSoloTable(transport, {
    round: (current: SpiderSnapshot) => current.session,
    pacing: 'automatic',
  });
  const recordStart = useSpiderStatsStore((state) => state.recordStart);
  const recordWin = useSpiderStatsStore((state) => state.recordWin);
  const dailyResults = useSpiderStatsStore((state) => state.dailyResults);
  const recordProfileResult = useProfileStore((state) => state.recordResult);
  const [elapsedMs, setElapsedMs] = useState(0);
  const won = snapshot.session.status === 'ended';
  const reported = useRef(false);
  const startedAt = useRef(0);
  const view = useMemo(
    () => spiderTableView(snapshot, transport.legalMoves()),
    [snapshot, transport],
  );

  useEffect(() => {
    recordStart(run.id);
  }, [recordStart, run.id]);

  useEffect(() => {
    startedAt.current = performance.now();
  }, [run.id]);

  useEffect(() => {
    if (won) return;
    const update = () => setElapsedMs(Math.max(0, performance.now() - startedAt.current));
    const timer = window.setInterval(update, 250);
    update();
    return () => window.clearInterval(timer);
  }, [won]);

  useEffect(() => {
    if (!won || reported.current) return;
    reported.current = true;
    recordWin({
      runId: run.id,
      dailyKey: run.dailyKey,
      moves: snapshot.session.state.moves,
      elapsedMs,
      completedAtMs: Date.now(),
    });
    recordProfileResult({ won: true, blitzes: 0, knocks: 0, knockWins: 0 });
  }, [
    elapsedMs,
    recordProfileResult,
    recordWin,
    run.dailyKey,
    run.id,
    snapshot.session.state.moves,
    won,
  ]);

  const restart = useCallback(() => {
    onRun({ ...run, id: crypto.randomUUID() });
  }, [onRun, run]);

  const newDeal = useCallback(() => {
    if (run.mode === 'daily') return;
    onRun(makeSpiderRun(run.mode));
  }, [onRun, run.mode]);

  const todayKey = utcDailyKey(new Date());
  return (
    <SpiderTableScreen
      view={view}
      fx={fx}
      fxKey={fxKey}
      elapsedMs={elapsedMs}
      dailyResult={run.dailyKey ? dailyResultFor(dailyResults, run.dailyKey) : null}
      streak={dailyStreak(dailyResults, todayKey)}
      error={error}
      onDispatch={dispatch}
      onUndo={() => accept(transport.undo())}
      onRestart={restart}
      onNewDeal={newDeal}
      onQuit={onQuit}
    />
  );
}
