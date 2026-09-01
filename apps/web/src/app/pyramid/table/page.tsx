'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { leftoverOf } from '@parlour/game-pyramid';
import { PyramidTableScreen } from '@/components/table/pyramid/PyramidTableScreen';
import {
  makePyramidRun,
  rulesForPyramidMode,
  utcDailyKey,
  type PyramidRun,
} from '@/lib/pyramid/modes';
import { pyramidTableView } from '@/lib/pyramid/view';
import { PyramidTransport, type PyramidSnapshot } from '@/lib/solo/PyramidTransport';
import { useSoloTable } from '@/lib/table/useSoloTable';
import { dailyResultFor, dailyStreak, usePyramidStatsStore } from '@/stores/pyramidStats';
import { usePyramidSetupStore } from '@/stores/pyramidSetup';
import { useProfileStore } from '@/stores/profile';

export default function PyramidTablePage() {
  const router = useRouter();
  const storedRun = usePyramidSetupStore((state) => state.run);
  const replaceRun = usePyramidSetupStore((state) => state.replaceRun);
  const [run, setRun] = useState<PyramidRun>(() => storedRun ?? makePyramidRun('daily'));

  useEffect(() => {
    if (!storedRun) replaceRun(run);
  }, [replaceRun, run, storedRun]);

  return (
    <ActivePyramidTable
      key={run.id}
      run={run}
      onRun={(next) => {
        replaceRun(next);
        setRun(next);
      }}
      onQuit={() => router.push('/pyramid')}
    />
  );
}

function ActivePyramidTable({
  run,
  onRun,
  onQuit,
}: {
  run: PyramidRun;
  onRun: (run: PyramidRun) => void;
  onQuit: () => void;
}) {
  const [transport] = useState(
    () =>
      new PyramidTransport({
        mode: run.mode,
        dailyKey: run.dailyKey,
        seed: run.seed,
        rules: rulesForPyramidMode(run.mode),
      }),
  );
  const { snapshot, fx, fxKey, error, dispatch, accept } = useSoloTable(transport, {
    round: (current: PyramidSnapshot) => current.session,
    pacing: 'automatic',
  });
  const recordStart = usePyramidStatsStore((state) => state.recordStart);
  const recordHole = usePyramidStatsStore((state) => state.recordHole);
  const dailyResults = usePyramidStatsStore((state) => state.dailyResults);
  const recordProfileResult = useProfileStore((state) => state.recordResult);
  const [elapsedMs, setElapsedMs] = useState(0);
  const finished = snapshot.session.status === 'ended';
  const reported = useRef(false);
  const startedAt = useRef(0);
  const view = useMemo(
    () => pyramidTableView(snapshot, transport.legalMoves()),
    [snapshot, transport],
  );

  useEffect(() => {
    recordStart(run.id);
  }, [recordStart, run.id]);

  useEffect(() => {
    startedAt.current = performance.now();
  }, [run.id]);

  useEffect(() => {
    if (finished) return;
    const update = () => setElapsedMs(Math.max(0, performance.now() - startedAt.current));
    const timer = window.setInterval(update, 250);
    update();
    return () => window.clearInterval(timer);
  }, [finished]);

  useEffect(() => {
    if (!finished || reported.current) return;
    reported.current = true;
    const leftover = leftoverOf(snapshot.session.state);
    recordHole({
      runId: run.id,
      dailyKey: run.dailyKey,
      leftover,
      moves: snapshot.session.state.moves,
      elapsedMs,
      completedAtMs: Date.now(),
    });
    recordProfileResult({ won: leftover === 0, blitzes: 0, knocks: 0, knockWins: 0 });
  }, [
    elapsedMs,
    finished,
    recordHole,
    recordProfileResult,
    run.dailyKey,
    run.id,
    snapshot.session.state,
  ]);

  const restart = useCallback(() => {
    onRun({ ...run, id: crypto.randomUUID() });
  }, [onRun, run]);

  const newDeal = useCallback(() => {
    if (run.mode === 'daily') return;
    onRun(makePyramidRun(run.mode));
  }, [onRun, run.mode]);

  const todayKey = utcDailyKey(new Date());
  return (
    <PyramidTableScreen
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
