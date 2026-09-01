'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { FreecellTableScreen } from '@/components/table/freecell/FreecellTableScreen';
import {
  makeFreecellRun,
  rulesForFreecellMode,
  utcDailyKey,
  type FreecellRun,
} from '@/lib/freecell/modes';
import { freecellTableView } from '@/lib/freecell/view';
import { FreecellTransport, type FreecellSnapshot } from '@/lib/solo/FreecellTransport';
import { useSoloTable } from '@/lib/table/useSoloTable';
import { dailyResultFor, dailyStreak, useFreecellStatsStore } from '@/stores/freecellStats';
import { useFreecellSetupStore } from '@/stores/freecellSetup';
import { useProfileStore } from '@/stores/profile';

export default function FreecellTablePage() {
  const router = useRouter();
  const storedRun = useFreecellSetupStore((state) => state.run);
  const replaceRun = useFreecellSetupStore((state) => state.replaceRun);
  const [run, setRun] = useState<FreecellRun>(() => storedRun ?? makeFreecellRun('daily'));

  useEffect(() => {
    if (!storedRun) replaceRun(run);
  }, [replaceRun, run, storedRun]);

  return (
    <ActiveFreecellTable
      key={run.id}
      run={run}
      onRun={(next) => {
        replaceRun(next);
        setRun(next);
      }}
      onQuit={() => router.push('/freecell')}
    />
  );
}

function ActiveFreecellTable({
  run,
  onRun,
  onQuit,
}: {
  run: FreecellRun;
  onRun: (run: FreecellRun) => void;
  onQuit: () => void;
}) {
  const [transport] = useState(
    () =>
      new FreecellTransport({
        mode: run.mode,
        dailyKey: run.dailyKey,
        seed: run.seed,
        rules: rulesForFreecellMode(run.mode),
      }),
  );
  const { snapshot, fx, fxKey, error, dispatch, accept } = useSoloTable(transport, {
    round: (current: FreecellSnapshot) => current.session,
    pacing: 'automatic',
  });
  const recordStart = useFreecellStatsStore((state) => state.recordStart);
  const recordWin = useFreecellStatsStore((state) => state.recordWin);
  const dailyResults = useFreecellStatsStore((state) => state.dailyResults);
  const recordProfileResult = useProfileStore((state) => state.recordResult);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [finishing, setFinishing] = useState(false);
  const won = snapshot.session.status === 'ended';
  const reported = useRef(false);
  const startedAt = useRef(0);
  const view = useMemo(
    () => freecellTableView(snapshot, transport.legalMoves()),
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

  useEffect(() => {
    if (!finishing) return;
    if (snapshot.session.status !== 'playing') {
      const timer = window.setTimeout(() => setFinishing(false), 0);
      return () => window.clearTimeout(timer);
    }
    const legal = transport.legalMoves();
    const next =
      legal.find((move) => move.id === 'tableau.toFoundation') ??
      legal.find((move) => move.id === 'cell.toFoundation');
    if (!next) {
      const timer = window.setTimeout(() => setFinishing(false), 0);
      return () => window.clearTimeout(timer);
    }
    const timer = window.setTimeout(() => dispatch(next.id, next.payload), 250);
    return () => window.clearTimeout(timer);
  }, [dispatch, finishing, snapshot, transport]);

  const restart = useCallback(() => {
    onRun({ ...run, id: crypto.randomUUID() });
  }, [onRun, run]);

  const newDeal = useCallback(() => {
    if (run.mode === 'daily') return;
    onRun(makeFreecellRun(run.mode));
  }, [onRun, run.mode]);

  const todayKey = utcDailyKey(new Date());
  return (
    <FreecellTableScreen
      view={view}
      fx={fx}
      fxKey={fxKey}
      elapsedMs={elapsedMs}
      dailyResult={run.dailyKey ? dailyResultFor(dailyResults, run.dailyKey) : null}
      streak={dailyStreak(dailyResults, todayKey)}
      busy={finishing}
      error={error}
      onDispatch={dispatch}
      onUndo={() => accept(transport.undo())}
      onRestart={restart}
      onNewDeal={newDeal}
      onFinish={() => setFinishing(true)}
      onQuit={onQuit}
    />
  );
}
