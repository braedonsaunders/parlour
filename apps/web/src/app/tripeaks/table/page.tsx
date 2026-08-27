'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { leftoverOf } from '@parlour/game-tripeaks';
import { TripeaksTableScreen } from '@/components/table/tripeaks/TripeaksTableScreen';
import {
  makeTripeaksRun,
  rulesForTripeaksMode,
  utcDailyKey,
  type TripeaksRun,
} from '@/lib/tripeaks/modes';
import { tripeaksTableView } from '@/lib/tripeaks/view';
import { TripeaksTransport, type TripeaksSnapshot } from '@/lib/solo/TripeaksTransport';
import { useSoloTable } from '@/lib/table/useSoloTable';
import { dailyResultFor, dailyStreak, useTripeaksStatsStore } from '@/stores/tripeaksStats';
import { useTripeaksSetupStore } from '@/stores/tripeaksSetup';
import { useProfileStore } from '@/stores/profile';

export default function TripeaksTablePage() {
  const router = useRouter();
  const storedRun = useTripeaksSetupStore((state) => state.run);
  const replaceRun = useTripeaksSetupStore((state) => state.replaceRun);
  const [run, setRun] = useState<TripeaksRun>(() => storedRun ?? makeTripeaksRun('daily'));

  useEffect(() => {
    if (!storedRun) replaceRun(run);
  }, [replaceRun, run, storedRun]);

  return (
    <ActiveTripeaksTable
      key={run.id}
      run={run}
      onRun={(next) => {
        replaceRun(next);
        setRun(next);
      }}
      onQuit={() => router.push('/tripeaks')}
    />
  );
}

function ActiveTripeaksTable({
  run,
  onRun,
  onQuit,
}: {
  run: TripeaksRun;
  onRun: (run: TripeaksRun) => void;
  onQuit: () => void;
}) {
  const [transport] = useState(
    () =>
      new TripeaksTransport({
        mode: run.mode,
        dailyKey: run.dailyKey,
        seed: run.seed,
        rules: rulesForTripeaksMode(run.mode),
      }),
  );
  const { snapshot, fx, fxKey, error, dispatch, accept } = useSoloTable(transport, {
    round: (current: TripeaksSnapshot) => current.session,
    botPaceMs: () => 0,
  });
  const recordStart = useTripeaksStatsStore((state) => state.recordStart);
  const recordHole = useTripeaksStatsStore((state) => state.recordHole);
  const dailyResults = useTripeaksStatsStore((state) => state.dailyResults);
  const recordProfileResult = useProfileStore((state) => state.recordResult);
  const [elapsedMs, setElapsedMs] = useState(0);
  const finished = snapshot.session.status === 'ended';
  const reported = useRef(false);
  const startedAt = useRef(0);
  const view = useMemo(
    () => tripeaksTableView(snapshot, transport.legalMoves()),
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
    onRun(makeTripeaksRun(run.mode));
  }, [onRun, run.mode]);

  const todayKey = utcDailyKey(new Date());
  return (
    <TripeaksTableScreen
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
