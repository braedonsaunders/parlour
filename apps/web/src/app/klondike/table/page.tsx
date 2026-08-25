'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { KlondikeTableScreen } from '@/components/table/klondike/KlondikeTableScreen';
import {
  dealKlondikeRun,
  makeKlondikeRun,
  rulesForKlondikeMode,
  utcDailyKey,
  type KlondikeRun,
} from '@/lib/klondike/modes';
import { klondikeTableView } from '@/lib/klondike/view';
import { KlondikeTransport, type KlondikeSnapshot } from '@/lib/solo/KlondikeTransport';
import { useSoloTable } from '@/lib/table/useSoloTable';
import { dailyResultFor, dailyStreak, useKlondikeStatsStore } from '@/stores/klondikeStats';
import { useKlondikeSetupStore } from '@/stores/klondikeSetup';
import { useProfileStore } from '@/stores/profile';

export default function KlondikeTablePage() {
  const router = useRouter();
  const storedRun = useKlondikeSetupStore((state) => state.run);
  const replaceRun = useKlondikeSetupStore((state) => state.replaceRun);
  const [run, setRun] = useState<KlondikeRun>(() => storedRun ?? makeKlondikeRun('daily'));

  useEffect(() => {
    if (!storedRun) replaceRun(run);
  }, [replaceRun, run, storedRun]);

  return (
    <ActiveKlondikeTable
      key={run.id}
      run={run}
      onRun={(next) => {
        replaceRun(next);
        setRun(next);
      }}
      onQuit={() => router.push('/klondike')}
    />
  );
}

function ActiveKlondikeTable({
  run,
  onRun,
  onQuit,
}: {
  run: KlondikeRun;
  onRun: (run: KlondikeRun) => void;
  onQuit: () => void;
}) {
  const [transport] = useState(
    () =>
      new KlondikeTransport({
        mode: run.mode,
        dailyKey: run.dailyKey,
        seed: run.seed,
        rules: rulesForKlondikeMode(run.mode),
        line: run.line,
      }),
  );
  const { snapshot, fx, fxKey, error, dispatch, accept } = useSoloTable(transport, {
    round: (current: KlondikeSnapshot) => current.session,
    botPaceMs: () => 0,
  });
  const recordStart = useKlondikeStatsStore((state) => state.recordStart);
  const recordWin = useKlondikeStatsStore((state) => state.recordWin);
  const dailyResults = useKlondikeStatsStore((state) => state.dailyResults);
  const recordProfileResult = useProfileStore((state) => state.recordResult);
  const winnableOnly = useKlondikeSetupStore((state) => state.winnableOnly);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [finishing, setFinishing] = useState(false);
  /** A winnable-deal search runs off-thread, so the table waits for the next deal. */
  const [dealing, setDealing] = useState(false);
  const won = snapshot.session.status === 'ended';
  const reported = useRef(false);
  const startedAt = useRef(0);
  const view = useMemo(
    () => klondikeTableView(snapshot, transport.legalMoves()),
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
      legal.find((move) => move.id === 'waste.toFoundation');
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
    if (run.mode === 'daily' || dealing) return;
    setDealing(true);
    void dealKlondikeRun(run.mode, { winnableOnly })
      .then(onRun)
      .catch(() => onRun(makeKlondikeRun(run.mode)))
      .finally(() => setDealing(false));
  }, [dealing, onRun, run.mode, winnableOnly]);

  const todayKey = utcDailyKey(new Date());
  return (
    <KlondikeTableScreen
      view={view}
      fx={fx}
      fxKey={fxKey}
      elapsedMs={elapsedMs}
      dailyResult={run.dailyKey ? dailyResultFor(dailyResults, run.dailyKey) : null}
      streak={dailyStreak(dailyResults, todayKey)}
      busy={finishing || dealing}
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
