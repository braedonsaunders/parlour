'use client';

import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import type { FxEvent } from '@parlour/engine';
import { PlayingCard } from '@/components/table/PlayingCard';
import {
  TableActionRail,
  TableErrorScreen,
  TableLoadingScreen,
  TablePlayfield,
  TableScreenFrame,
  TableTitlePill,
  SolitaireUndoButton,
  useGameTextSurface,
  useTableMenu,
} from '@/components/table/shell';
import { useProfileStore } from '@/stores/profile';
import { tripeaksCatalog } from '@parlour/game-tripeaks';
import {
  useTripeaksDealPresentation,
  type TripeaksDealPresentation,
} from '@/lib/tripeaks/deal-presentation';
import {
  describeHint,
  playableIndices,
  sourceOfMove,
  targetOfMove,
  zoneOfIndex,
  type TripeaksTableView,
} from '@/lib/tripeaks/view';
import type { TripeaksDailyResult } from '@/stores/tripeaksStats';
import { TripeaksFxLayer } from './fx-layer';
import styles from '@/styles/tripeaks.module.css';

/** Locked layout: row/col in half-card grid units. See packages/game-tripeaks cards.ts. */
const PEAK_LAYOUT: readonly { row: number; col: number }[] = [
  { row: 0, col: 1 },
  { row: 0, col: 4 },
  { row: 0, col: 7 },
  { row: 1, col: 0.5 },
  { row: 1, col: 1.5 },
  { row: 1, col: 3.5 },
  { row: 1, col: 4.5 },
  { row: 1, col: 6.5 },
  { row: 1, col: 7.5 },
  { row: 2, col: 0 },
  { row: 2, col: 1 },
  { row: 2, col: 2 },
  { row: 2, col: 3 },
  { row: 2, col: 4 },
  { row: 2, col: 5 },
  { row: 2, col: 6 },
  { row: 2, col: 7 },
  { row: 2, col: 8 },
];

export interface TripeaksTableScreenProps {
  view: TripeaksTableView | null;
  fx: readonly FxEvent[];
  fxKey: string | number;
  elapsedMs?: number;
  dailyResult?: TripeaksDailyResult | null;
  streak?: number;
  busy?: boolean;
  error?: string | null;
  onDispatch?: (move: string, payload?: unknown) => void;
  onUndo?: () => void;
  onRestart?: () => void;
  onNewDeal?: () => void;
  onQuit?: () => void;
}

export function TripeaksTableScreen(props: TripeaksTableScreenProps) {
  const profileReduced = useProfileStore((state) => state.settings.reducedMotion);
  const reducedMotion = useCalmMotion(profileReduced);
  const deal = useTripeaksDealPresentation(props.fx, props.fxKey, reducedMotion);
  const view = props.view;
  const moveNo = view?.moves ?? -1;
  const holeTop = view?.hole.at(-1) ?? null;
  const [flipped, setFlipped] = useState<{ move: number; card: string | null }>({
    move: moveNo,
    card: null,
  });
  const previousHole = useRef<{ move: number; card: string | null }>({
    move: moveNo,
    card: holeTop,
  });
  useEffect(() => {
    const before = previousHole.current;
    previousHole.current = { move: moveNo, card: holeTop };
    if (moveNo === before.move || holeTop === null || holeTop === before.card) return;
    setFlipped({ move: moveNo, card: holeTop });
  }, [moveNo, holeTop]);
  const justFlipped = flipped.move === moveNo ? flipped.card : null;

  const [hintMove, setHintMove] = useState<number | null>(null);
  const showHint = hintMove === moveNo;
  const setShowHint = (visible: boolean) => setHintMove(visible ? moveNo : null);
  const hintText = view && showHint ? describeHint(view.hint, view) : null;

  useEffect(() => {
    const cancel = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setHintMove(null);
    };
    window.addEventListener('keydown', cancel);
    return () => window.removeEventListener('keydown', cancel);
  }, []);

  useGameTextSurface(() => {
    if (props.error) return { game: 'tripeaks', status: 'error', error: props.error };
    if (!view) return { game: 'tripeaks', status: 'loading', error: null };
    return textSurfaceFor({
      view,
      deal,
      hintText,
      elapsedMs: props.elapsedMs ?? 0,
      dailyResult: props.dailyResult ?? null,
      streak: props.streak ?? 0,
      busy: props.busy ?? false,
    });
  });

  if (props.error) {
    return <TableErrorScreen headline="The peaks lost the thread." message={props.error} />;
  }
  if (!view) return <TableLoadingScreen copy="Laying out the three peaks…" />;
  return (
    <ReadyTripeaksTable
      {...props}
      view={view}
      deal={deal}
      reducedMotion={reducedMotion}
      justFlipped={justFlipped}
      showHint={showHint}
      setShowHint={setShowHint}
    />
  );
}

function ReadyTripeaksTable({
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
  justFlipped,
  showHint,
  setShowHint,
}: TripeaksTableScreenProps & {
  view: TripeaksTableView;
  deal: TripeaksDealPresentation;
  reducedMotion: boolean;
  justFlipped: string | null;
  showHint: boolean;
  setShowHint: (visible: boolean) => void;
}) {
  const rootRef = useRef<HTMLElement>(null);
  const menu = useTableMenu(onQuit ?? (() => undefined));
  const hintText = showHint ? describeHint(view.hint, view) : null;
  const hintSource = showHint && view.hint ? sourceOfMove(view.hint.move) : null;
  const hintTarget = showHint && view.hint ? targetOfMove(view.hint.move) : null;
  const playable = useMemo(() => new Set(playableIndices(view)), [view]);
  const ready = !busy && !deal.dealing && view.stage === 'playing';
  const flipMove = view.legal.find((move) => move.id === 'stock.flip');
  const recycleMove = view.legal.find((move) => move.id === 'stock.recycle');
  const finished = view.stage === 'won' || view.stage === 'holed';

  return (
    <TableScreenFrame
      rootRef={rootRef}
      className={styles.screen}
      dealState={deal.sequence ? (deal.dealing ? 'dealing' : 'complete') : undefined}
      menu={menu}
      hud={
        <TableTitlePill
          eyebrow="TriPeaks"
          status={
            view.mode === 'daily'
              ? `Daily · ${view.dailyKey}`
              : view.wrap
                ? 'Relaxed · wraps A–K'
                : 'Classic · no wrap'
          }
          className={styles.titlePill}
        >
          <span className={styles.metrics}>
            <b>{view.leftover}</b> left · <b>{view.moves}</b> moves · <b>{formatTime(elapsedMs)}</b>
          </span>
        </TableTitlePill>
      }
      howToPlay={{
        doc: tripeaksCatalog.howToPlay,
        title: 'TriPeaks',
        subtitle: 'clear the three peaks',
      }}
    >
      <TablePlayfield label="TriPeaks table" feltMark="T" className={styles.playfield}>
        <div className={styles.board} data-testid="tripeaks-board" aria-busy={deal.dealing}>
          <div className={styles.topRow}>
            <PileLabel label={`Stock · ${view.stockCount}`}>
              <button
                type="button"
                className={styles.pileButton}
                data-zone="stock"
                data-zone-face
                data-hint={hintSource === 'stock' || undefined}
                data-testid="tripeaks-stock"
                onClick={() => flipMove && onDispatch?.(flipMove.id, flipMove.payload)}
                disabled={!ready || (!flipMove && !recycleMove)}
                aria-label="Turn the next hole card"
              >
                {view.stockCount > 0 ? (
                  <PlayingCard faceDown />
                ) : recycleMove ? (
                  <span className={styles.emptyPile} aria-label="Recycle the hole">
                    ↻
                  </span>
                ) : (
                  <span className={styles.emptyPile}>·</span>
                )}
                <span className={styles.pileCount}>{view.stockCount}</span>
              </button>
            </PileLabel>
            <PileLabel label="The hole">
              <div
                className={styles.pileButton}
                data-zone="hole"
                data-zone-face
                data-hint={hintTarget === 'hole' || undefined}
                data-testid="tripeaks-hole"
              >
                {view.hole.at(-1) ? (
                  <div
                    data-card={view.hole.at(-1)}
                    data-just-flipped={
                      justFlipped !== null && justFlipped === view.hole.at(-1) ? '' : undefined
                    }
                  >
                    <PlayingCard card={view.hole.at(-1)} disabled />
                  </div>
                ) : (
                  <span className={styles.emptyPile} aria-label="Empty hole">
                    ·
                  </span>
                )}
                <span className={styles.pileCount}>{view.hole.length}</span>
              </div>
            </PileLabel>
          </div>

          <div className={styles.peaks} aria-label="Peaks">
            {view.tableau.map((card, index) => {
              if (!card) return null;
              const layout = PEAK_LAYOUT[index]!;
              const visible = deal.visibleTableau[index] ?? true;
              return (
                <div
                  key={index}
                  className={styles.peakCard}
                  style={
                    {
                      '--peak-row': layout.row,
                      '--peak-col': layout.col,
                      opacity: visible ? 1 : 0,
                    } as React.CSSProperties
                  }
                  data-zone={zoneOfIndex(index)}
                  data-zone-face
                  data-hint={hintSource === zoneOfIndex(index) || undefined}
                  data-playable={playable.has(index) ? 'true' : undefined}
                  data-testid={`tripeaks-card-${index}`}
                >
                  <PlayingCard
                    card={card}
                    onClick={
                      playable.has(index)
                        ? () => onDispatch?.('tableau.play', { from: index })
                        : undefined
                    }
                    disabled={!ready || !playable.has(index)}
                    actionLabel="Play"
                  />
                </div>
              );
            })}
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
            data-testid="tripeaks-result"
            role="status"
          >
            <span aria-hidden="true">♠ ♥ ♦ ♣</span>
            <h2>{view.stage === 'won' ? 'Peaks cleared' : 'No more plays'}</h2>
            <p>
              {view.leftover} left · {view.moves} moves · {formatTime(elapsedMs)}
            </p>
            {view.mode === 'daily' ? <strong>Daily complete · {view.dailyKey}</strong> : null}
            <button type="button" className="btn-fat" onClick={onRestart}>
              Play this deal again
            </button>
            {view.mode !== 'daily' ? (
              <button type="button" className="btn-fat btn-fat--teal" onClick={onNewDeal}>
                New deal
              </button>
            ) : null}
          </section>
        ) : null}

        <TripeaksFxLayer fx={fx} fxKey={fxKey} rootRef={rootRef} reduced={reducedMotion} />
      </TablePlayfield>

      <TableActionRail className={styles.actions}>
        <SolitaireUndoButton
          depth={view.undoDepth}
          testId="tripeaks-undo"
          onUndo={onUndo}
          disabled={!view.canUndo || deal.dealing || busy}
        />
        <button
          type="button"
          className="btn-fat btn-fat--ghost"
          data-testid="tripeaks-hint"
          onClick={() => setShowHint(true)}
          disabled={!view.hint || deal.dealing}
        >
          Hint
        </button>
        <button
          type="button"
          className="btn-fat btn-fat--ghost"
          data-testid="tripeaks-restart"
          onClick={onRestart}
        >
          Restart
        </button>
        {view.mode !== 'daily' ? (
          <button
            type="button"
            className="btn-fat btn-fat--ghost"
            data-testid="tripeaks-new-deal"
            onClick={onNewDeal}
          >
            New deal
          </button>
        ) : (
          <span className={styles.dailyChip} data-testid="tripeaks-daily">
            Daily
          </span>
        )}
      </TableActionRail>
    </TableScreenFrame>
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
  hintText,
  elapsedMs,
  dailyResult,
  streak,
  busy,
}: {
  view: TripeaksTableView;
  deal: TripeaksDealPresentation;
  hintText: string | null;
  elapsedMs: number;
  dailyResult: TripeaksDailyResult | null;
  streak: number;
  busy: boolean;
}) {
  const ready = !busy && !deal.dealing && view.stage === 'playing';
  return {
    game: 'tripeaks',
    status: view.stage === 'playing' ? (deal.dealing ? 'dealing' : 'ready') : view.stage,
    error: null,
    mode: view.mode,
    dailyKey: view.dailyKey,
    wrap: view.wrap,
    recycle: view.recycle,
    moves: view.moves,
    leftover: view.leftover,
    elapsedMs,
    layout: 'stock and hole top-center; three peaks below, indices 0..17',
    stock: {
      count: view.stockCount,
      canFlip: ready && view.legal.some((move) => move.id === 'stock.flip'),
      canRecycle: ready && view.legal.some((move) => move.id === 'stock.recycle'),
    },
    hole: { count: view.hole.length, top: view.hole.at(-1) ?? null },
    tableau: view.tableau.map((card, index) => ({
      index,
      card,
      playable: playableIndices(view).includes(index),
    })),
    legal: {
      canFlip: ready && view.legal.some((move) => move.id === 'stock.flip'),
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
