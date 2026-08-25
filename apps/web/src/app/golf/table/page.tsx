'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { leftoverOf } from '@parlour/game-golf';
import { GolfTableScreen } from '@/components/table/golf/GolfTableScreen';
import { makeGolfRun, rulesForGolfMode, utcDailyKey, type GolfRun } from '@/lib/golf/modes';
import { golfTableView } from '@/lib/golf/view';
import { GolfTransport, type GolfSnapshot } from '@/lib/solo/GolfTransport';
import { useSoloTable } from '@/lib/table/useSoloTable';
import { dailyResultFor, dailyStreak, useGolfStatsStore } from '@/stores/golfStats';
import { useGolfSetupStore } from '@/stores/golfSetup';
import { useProfileStore } from '@/stores/profile';

export default function GolfTablePage() {
  const router = useRouter();
  const storedRun = useGolfSetupStore((state) => state.run);
  const replaceRun = useGolfSetupStore((state) => state.replaceRun);
  const [run, setRun] = useState<GolfRun>(() => storedRun ?? makeGolfRun('daily'));

  useEffect(() => {
    if (!storedRun) replaceRun(run);
  }, [replaceRun, run, storedRun]);

  return (
    <ActiveGolfTable
      key={run.id}
      run={run}
      onRun={(next) => {
        replaceRun(next);
        setRun(next);
      }}
      onQuit={() => router.push('/golf')}
    />
  );
}

function ActiveGolfTable({
  run,
  onRun,
  onQuit,
}: {
  run: GolfRun;
  onRun: (run: GolfRun) => void;
  onQuit: () => void;
}) {
  const [transport] = useState(
    () =>
      new GolfTransport({
        mode: run.mode,
        dailyKey: run.dailyKey,
        seed: run.seed,
        rules: rulesForGolfMode(run.mode),
      }),
  );
  const { snapshot, fx, fxKey, error, dispatch, accept } = useSoloTable(transport, {
    round: (current: GolfSnapshot) => current.session,
    botPaceMs: () => 0,
  });
  const recordStart = useGolfStatsStore((state) => state.recordStart);
  const recordHole = useGolfStatsStore((state) => state.recordHole);
  const dailyResults = useGolfStatsStore((state) => state.dailyResults);
  const recordProfileResult = useProfileStore((state) => state.recordResult);
  const [elapsedMs, setElapsedMs] = useState(0);
  const finished = snapshot.session.status === 'ended';
  const reported = useRef(false);
  const startedAt = useRef(0);
  const view = useMemo(
    () => golfTableView(snapshot, transport.legalMoves()),
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
    onRun(makeGolfRun(run.mode));
  }, [onRun, run.mode]);

  const todayKey = utcDailyKey(new Date());
  return (
    <GolfTableScreen
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
