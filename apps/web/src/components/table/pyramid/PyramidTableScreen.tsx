'use client';

import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import type { FxEvent } from '@parlour/engine';
import { isFree, pyramidCatalog } from '@parlour/game-pyramid';
import { PlayingCard } from '@/components/table/PlayingCard';
import { TableMenu } from '@/components/table/TableMenu';
import {
  TableActionRail,
  TableErrorScreen,
  TableHud,
  TableLoadingScreen,
  TablePlayfield,
  TableShell,
  TableTitlePill,
  useGameTextSurface,
  useTableMenu,
} from '@/components/table/shell';
import { useProfileStore } from '@/stores/profile';
import {
  usePyramidDealPresentation,
  type PyramidDealPresentation,
} from '@/lib/pyramid/deal-presentation';
import {
  clickSource,
  describeHint,
  freeSources,
  partnersOf,
  sameSelection,
  sourceOfMove,
  targetOfMove,
  zoneOfSource,
  type PyramidSelection,
  type PyramidTableView,
} from '@/lib/pyramid/view';
import type { PyramidDailyResult } from '@/stores/pyramidStats';
import { PyramidFxLayer } from './fx-layer';
import styles from '@/styles/pyramid.module.css';

export interface PyramidTableScreenProps {
  view: PyramidTableView | null;
  fx: readonly FxEvent[];
  fxKey: string | number;
  elapsedMs?: number;
  dailyResult?: PyramidDailyResult | null;
  streak?: number;
  busy?: boolean;
  error?: string | null;
  onDispatch?: (move: string, payload?: unknown) => void;
  onUndo?: () => void;
  onRestart?: () => void;
  onNewDeal?: () => void;
  onQuit?: () => void;
}

export function PyramidTableScreen(props: PyramidTableScreenProps) {
  const profileReduced = useProfileStore((state) => state.settings.reducedMotion);
  const reducedMotion = useCalmMotion(profileReduced);
  const deal = usePyramidDealPresentation(props.fx, props.fxKey, reducedMotion);
  const view = props.view;
  const moveNo = view?.moves ?? -1;
  const wasteTop = view?.waste.at(-1) ?? null;
  const [drawn, setDrawn] = useState<{ move: number; card: string | null }>({
    move: moveNo,
    card: null,
  });
  const previousWaste = useRef<{ move: number; card: string | null }>({
    move: moveNo,
    card: wasteTop,
  });
  useEffect(() => {
    const before = previousWaste.current;
    previousWaste.current = { move: moveNo, card: wasteTop };
    if (moveNo === before.move || wasteTop === null || wasteTop === before.card) return;
    setDrawn({ move: moveNo, card: wasteTop });
  }, [moveNo, wasteTop]);
  const justDrawn = drawn.move === moveNo ? drawn.card : null;

  const [selectionState, setSelectionState] = useState<{
    move: number;
    value: PyramidSelection | null;
  }>({ move: moveNo, value: null });
  const selection = selectionState.move === moveNo ? selectionState.value : null;
  const setSelection = (value: PyramidSelection | null) => {
    setSelectionState({ move: moveNo, value });
  };
  const [hintMove, setHintMove] = useState<number | null>(null);
  const showHint = hintMove === moveNo;
  const setShowHint = (visible: boolean) => setHintMove(visible ? moveNo : null);
  const hintText = view && showHint ? describeHint(view.hint) : null;

  useEffect(() => {
    const cancel = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setSelectionState({ move: moveNo, value: null });
        setHintMove(null);
      }
    };
    window.addEventListener('keydown', cancel);
    return () => window.removeEventListener('keydown', cancel);
  }, [moveNo]);

  useGameTextSurface(() => {
    if (props.error) return { game: 'pyramid', status: 'error', error: props.error };
    if (!view) return { game: 'pyramid', status: 'loading', error: null };
    return textSurfaceFor({
      view,
      deal,
      selection,
      hintText,
      elapsedMs: props.elapsedMs ?? 0,
      dailyResult: props.dailyResult ?? null,
      streak: props.streak ?? 0,
      busy: props.busy ?? false,
    });
  });

  if (props.error) {
    return <TableErrorScreen headline="The pyramid table lost the thread." message={props.error} />;
  }
  if (!view) return <TableLoadingScreen copy="Laying out the pyramid…" />;
  return (
    <ReadyPyramidTable
      {...props}
      view={view}
      deal={deal}
      reducedMotion={reducedMotion}
      justDrawn={justDrawn}
      selection={selection}
      setSelection={setSelection}
      showHint={showHint}
      setShowHint={setShowHint}
    />
  );
}

function ReadyPyramidTable({
  view,
  fx,
  fxKey,
  elapsedMs = 0,
  busy = false,
  onDispatch,
  onUndo,
  onRestart,
  onNewDeal,
  onQuit,
  deal,
  reducedMotion,
  justDrawn,
  selection,
  setSelection,
  showHint,
  setShowHint,
}: PyramidTableScreenProps & {
  view: PyramidTableView;
  deal: PyramidDealPresentation;
  reducedMotion: boolean;
  justDrawn: string | null;
  selection: PyramidSelection | null;
  setSelection: (value: PyramidSelection | null) => void;
  showHint: boolean;
  setShowHint: (visible: boolean) => void;
}) {
  const rootRef = useRef<HTMLElement>(null);
  const menu = useTableMenu(onQuit ?? (() => undefined));
  const hintText = showHint ? describeHint(view.hint) : null;
  const hintSource = showHint && view.hint ? sourceOfMove(view.hint.move) : null;
  const hintTarget = showHint && view.hint ? targetOfMove(view.hint.move) : null;
  const armed = useMemo(
    () => (selection ? partnersOf(view, selection) : freeSources(view)),
    [selection, view],
  );
  const ready = !busy && !deal.dealing && view.stage === 'playing';
  const stockMove =
    view.legal.find((move) => move.id === 'stock.draw') ??
    view.legal.find((move) => move.id === 'stock.recycle');
  const finished = view.stage === 'won' || view.stage === 'holed';

  const choose = (source: PyramidSelection) => {
    if (!ready) return;
    const result = clickSource(view, selection, source);
    setSelection(result.selection);
    if (result.move) onDispatch?.(result.move.id, result.move.payload);
  };

  return (
    <TableShell
      rootRef={rootRef}
      className={styles.screen}
      dealState={deal.sequence ? (deal.dealing ? 'dealing' : 'complete') : undefined}
    >
      <TableHud onOpenMenu={menu.open}>
        <TableTitlePill
          eyebrow="Pyramid"
          status={
            view.mode === 'daily'
              ? `Daily · ${view.dailyKey}`
              : view.recyclesLimit === -1
                ? 'Relaxed · unlimited passes'
                : 'Classic · two recycles'
          }
          className={styles.titlePill}
        >
          <span className={styles.metrics}>
            <b>{view.leftover}</b> left · <b>{view.moves}</b> moves · <b>{formatTime(elapsedMs)}</b>
          </span>
        </TableTitlePill>
      </TableHud>

      <TablePlayfield label="Pyramid table" feltMark="P" className={styles.playfield}>
        <div className={styles.board} data-testid="pyramid-board" aria-busy={deal.dealing}>
          <div className={styles.topRow}>
            <PileLabel label={`Stock · ${view.stockCount}`}>
              <button
                type="button"
                className={styles.pileButton}
                data-zone="stock"
                data-zone-face
                data-hint={hintSource === 'stock' || undefined}
                data-playable={!selection && armed.length === 0 && stockMove ? 'true' : undefined}
                data-testid="pyramid-stock"
                onClick={() => stockMove && onDispatch?.(stockMove.id, stockMove.payload)}
                disabled={!ready || !stockMove}
                aria-label={
                  stockMove?.id === 'stock.recycle'
                    ? 'Recycle the waste'
                    : 'Turn the next waste card'
                }
              >
                {view.stockCount > 0 ? (
                  <PlayingCard faceDown compact />
                ) : (
                  <span className={styles.emptyPile}>·</span>
                )}
                <span className={styles.pileCount}>{view.stockCount}</span>
              </button>
            </PileLabel>
            <PileLabel label="Waste">
              <button
                type="button"
                className={styles.pileButton}
                data-zone="waste"
                data-zone-face
                data-hint={hintSource === 'waste' || hintTarget === 'waste' || undefined}
                data-selected={selection === 'waste' || undefined}
                data-playable={armed.some((source) => source === 'waste') ? 'true' : undefined}
                data-testid="pyramid-waste"
                onClick={() => choose('waste')}
                disabled={!ready || view.waste.length === 0}
                aria-label="Waste card"
              >
                {view.waste.at(-1) ? (
                  <div
                    data-card={view.waste.at(-1)}
                    data-just-drawn={
                      justDrawn !== null && justDrawn === view.waste.at(-1) ? '' : undefined
                    }
                  >
                    <PlayingCard card={view.waste.at(-1)} compact disabled />
                  </div>
                ) : (
                  <span className={styles.emptyPile} aria-label="Empty waste">
                    ·
                  </span>
                )}
                <span className={styles.pileCount}>{view.waste.length}</span>
              </button>
            </PileLabel>
          </div>

          <div className={styles.pyramid} aria-label="Pyramid">
            {view.pyramid.map((row, rowIndex) => (
              <div
                key={rowIndex}
                className={styles.row}
                style={{ zIndex: rowIndex }}
                data-testid={`pyramid-row-${rowIndex}`}
              >
                {row.map((card, col) => {
                  const visible = col < (deal.visibleByRow[rowIndex] ?? row.length);
                  if (!visible) {
                    return <span key={`${rowIndex}:${col}`} className={styles.cardSlot} />;
                  }
                  if (!card) {
                    return (
                      <span
                        key={`${rowIndex}:${col}`}
                        className={styles.emptySlot}
                        data-zone={`pyramid:${rowIndex}:${col}`}
                      />
                    );
                  }
                  const source = { row: rowIndex, col };
                  const free = isFree(view.pyramid, rowIndex, col);
                  const live = free && armed.some((candidate) => sameSelection(candidate, source));
                  const selected = sameSelection(selection, source);
                  const zone = zoneOfSource(source);
                  return (
                    <div
                      key={`${card}:${rowIndex}:${col}`}
                      className={styles.pyramidCard}
                      data-zone={zone}
                      data-zone-face={free || undefined}
                      data-card={card}
                      data-free={free || undefined}
                      data-playable={live ? 'true' : undefined}
                      data-selected={selected || undefined}
                      data-hint={hintSource === zone || hintTarget === zone || undefined}
                      data-testid={`pyramid-card-${rowIndex}-${col}`}
                    >
                      <PlayingCard
                        card={card}
                        compact
                        onClick={ready && free ? () => choose(source) : undefined}
                        disabled={!ready || !free}
                        actionLabel="Pair"
                      />
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>

        {hintText ? (
          <p className={styles.hintBanner} role="status">
            {hintText}
          </p>
        ) : null}

        {finished ? (
          <section
            className={`${styles.winPanel} panel-soft`}
            data-testid="pyramid-result"
            role="status"
          >
            <span aria-hidden="true">♠ ♥ ♦ ♣</span>
            <h2>{view.stage === 'won' ? 'Pyramid cleared' : 'Pyramid complete'}</h2>
            <p>
              {view.leftover} left · {view.moves} moves · {formatTime(elapsedMs)}
            </p>
            {view.mode === 'daily' ? <strong>Daily complete · {view.dailyKey}</strong> : null}
            <button type="button" className="btn-fat" onClick={onRestart}>
              Play this pyramid again
            </button>
            {view.mode !== 'daily' ? (
              <button type="button" className="btn-fat btn-fat--teal" onClick={onNewDeal}>
                New pyramid
              </button>
            ) : null}
          </section>
        ) : null}

        <PyramidFxLayer fx={fx} fxKey={fxKey} rootRef={rootRef} reduced={reducedMotion} />
      </TablePlayfield>

      <TableActionRail className={styles.actions}>
        <button
          type="button"
          className="btn-fat btn-fat--ghost"
          data-testid="pyramid-undo"
          onClick={onUndo}
          disabled={!view.canUndo || deal.dealing || busy}
        >
          Undo
        </button>
        <button
          type="button"
          className="btn-fat btn-fat--ghost"
          data-testid="pyramid-hint"
          onClick={() => setShowHint(true)}
          disabled={!view.hint || deal.dealing}
        >
          Hint
        </button>
        <button
          type="button"
          className="btn-fat btn-fat--ghost"
          data-testid="pyramid-restart"
          onClick={onRestart}
        >
          Restart
        </button>
        {view.mode !== 'daily' ? (
          <button
            type="button"
            className="btn-fat btn-fat--ghost"
            data-testid="pyramid-new-deal"
            onClick={onNewDeal}
          >
            New pyramid
          </button>
        ) : (
          <span className={styles.dailyChip} data-testid="pyramid-daily">
            Daily
          </span>
        )}
      </TableActionRail>

      <TableMenu
        open={menu.isOpen}
        onClose={menu.close}
        onQuit={menu.quit}
        howToPlay={{
          doc: pyramidCatalog.howToPlay,
          title: 'Pyramid',
          subtitle: 'pair to thirteen',
        }}
      />
    </TableShell>
  );
}

function PileLabel({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className={styles.pileWrap}>
      {children}
      <span className={styles.pileLabel}>{label}</span>
    </div>
  );
}

function formatTime(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}

function textSurfaceFor({
  view,
  deal,
  selection,
  hintText,
  elapsedMs,
  dailyResult,
  streak,
  busy,
}: {
  view: PyramidTableView;
  deal: PyramidDealPresentation;
  selection: PyramidSelection | null;
  hintText: string | null;
  elapsedMs: number;
  dailyResult: PyramidDailyResult | null;
  streak: number;
  busy: boolean;
}) {
  const ready = !busy && !deal.dealing && view.stage === 'playing';
  return {
    game: 'pyramid',
    status: view.stage === 'playing' ? (deal.dealing ? 'dealing' : 'ready') : view.stage,
    error: null,
    mode: view.mode,
    dailyKey: view.dailyKey,
    moves: view.moves,
    leftover: view.leftover,
    elapsedMs,
    layout: 'stock and waste top-center; pyramid rows 0..6 top-to-bottom',
    stock: {
      count: view.stockCount,
      canDraw: ready && view.legal.some((move) => move.id === 'stock.draw'),
      canRecycle: ready && view.legal.some((move) => move.id === 'stock.recycle'),
    },
    waste: { count: view.waste.length, top: view.waste.at(-1) ?? null },
    pyramid: view.pyramid.map((row, rowIndex) =>
      row.map((card, col) => ({
        row: rowIndex,
        col,
        card,
        free: card ? isFree(view.pyramid, rowIndex, col) : false,
      })),
    ),
    selection:
      selection === null
        ? null
        : selection === 'waste'
          ? 'waste'
          : `pyramid:${selection.row}:${selection.col}`,
    legal: {
      canDraw: ready && view.legal.some((move) => move.id === 'stock.draw'),
      canUndo: view.canUndo,
    },
    hint: hintText,
    daily: {
      completed: dailyResult !== null,
      bestScore: dailyResult?.bestScore ?? null,
      bestTimeMs: dailyResult?.bestTimeMs ?? null,
      streak,
    },
    won: view.stage === 'won',
  };
}

const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';

function useCalmMotion(profileReduced: boolean): boolean {
  const osReduced = useSyncExternalStore(subscribeReducedMotion, readReducedMotion, () => false);
  return profileReduced || osReduced;
}

function readReducedMotion(): boolean {
  return window.matchMedia?.(REDUCED_MOTION_QUERY).matches ?? false;
}

function subscribeReducedMotion(notify: () => void): () => void {
  const query = window.matchMedia?.(REDUCED_MOTION_QUERY);
  if (!query) return () => undefined;
  if (query.addEventListener) {
    query.addEventListener('change', notify);
    return () => query.removeEventListener('change', notify);
  }
  query.addListener?.(notify);
  return () => query.removeListener?.(notify);
}
