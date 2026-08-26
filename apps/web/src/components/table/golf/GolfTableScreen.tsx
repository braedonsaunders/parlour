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
  useGameTextSurface,
  useTableMenu,
} from '@/components/table/shell';
import { useProfileStore } from '@/stores/profile';
import { golfCatalog } from '@parlour/game-golf';
import { useGolfDealPresentation, type GolfDealPresentation } from '@/lib/golf/deal-presentation';
import {
  describeHint,
  playableColumns,
  sourceOfMove,
  targetOfMove,
  type GolfTableView,
} from '@/lib/golf/view';
import type { GolfDailyResult } from '@/stores/golfStats';
import { GolfFxLayer } from './fx-layer';
import styles from '@/styles/golf.module.css';

export interface GolfTableScreenProps {
  view: GolfTableView | null;
  fx: readonly FxEvent[];
  fxKey: string | number;
  elapsedMs?: number;
  dailyResult?: GolfDailyResult | null;
  streak?: number;
  busy?: boolean;
  error?: string | null;
  onDispatch?: (move: string, payload?: unknown) => void;
  onUndo?: () => void;
  onRestart?: () => void;
  onNewDeal?: () => void;
  onQuit?: () => void;
}

export function GolfTableScreen(props: GolfTableScreenProps) {
  const profileReduced = useProfileStore((state) => state.settings.reducedMotion);
  const reducedMotion = useCalmMotion(profileReduced);
  const deal = useGolfDealPresentation(props.fx, props.fxKey, reducedMotion);
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
    if (props.error) return { game: 'golf', status: 'error', error: props.error };
    if (!view) return { game: 'golf', status: 'loading', error: null };
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
    return <TableErrorScreen headline="The golf table lost the thread." message={props.error} />;
  }
  if (!view) return <TableLoadingScreen copy="Laying out seven columns…" />;
  return (
    <ReadyGolfTable
      {...props}
      view={view}
      deal={deal}
      reducedMotion={reducedMotion}
      justDrawn={justDrawn}
      showHint={showHint}
      setShowHint={setShowHint}
    />
  );
}

function ReadyGolfTable({
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
  showHint,
  setShowHint,
}: GolfTableScreenProps & {
  view: GolfTableView;
  deal: GolfDealPresentation;
  reducedMotion: boolean;
  justDrawn: string | null;
  showHint: boolean;
  setShowHint: (visible: boolean) => void;
}) {
  const rootRef = useRef<HTMLElement>(null);
  const menu = useTableMenu(onQuit ?? (() => undefined));
  const hintText = showHint ? describeHint(view.hint, view) : null;
  const hintSource = showHint && view.hint ? sourceOfMove(view.hint.move) : null;
  const hintTarget = showHint && view.hint ? targetOfMove(view.hint.move) : null;
  const playable = useMemo(() => new Set(playableColumns(view)), [view]);
  const ready = !busy && !deal.dealing && view.stage === 'playing';
  const stockMove = view.legal.find((move) => move.id === 'stock.draw');
  const finished = view.stage === 'won' || view.stage === 'holed';

  return (
    <TableScreenFrame
      rootRef={rootRef}
      className={styles.screen}
      dealState={deal.sequence ? (deal.dealing ? 'dealing' : 'complete') : undefined}
      menu={menu}
      hud={
        <TableTitlePill
          eyebrow="Golf"
          status={
            view.mode === 'daily'
              ? `Daily · ${view.dailyKey}`
              : view.wrap
                ? 'Fairway · wraps A–K'
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
        doc: golfCatalog.howToPlay,
        title: 'Golf',
        subtitle: 'the fast solitaire',
      }}
    >
      <TablePlayfield label="Golf table" feltMark="G" className={styles.playfield}>
        <div className={styles.board} data-testid="golf-board" aria-busy={deal.dealing}>
          <div className={styles.topRow}>
            <PileLabel label={`Stock · ${view.stockCount}`}>
              <button
                type="button"
                className={styles.pileButton}
                data-zone="stock"
                data-zone-face
                data-hint={hintSource === 'stock' || undefined}
                data-testid="golf-stock"
                onClick={() => stockMove && onDispatch?.(stockMove.id, stockMove.payload)}
                disabled={!ready || !stockMove}
                aria-label="Turn the next hole card"
              >
                {view.stockCount > 0 ? (
                  <PlayingCard faceDown />
                ) : (
                  <span className={styles.emptyPile}>·</span>
                )}
                <span className={styles.pileCount}>{view.stockCount}</span>
              </button>
            </PileLabel>
            <PileLabel label="The hole">
              <div
                className={styles.pileButton}
                data-zone="waste"
                data-zone-face
                data-hint={hintTarget === 'waste' || undefined}
                data-testid="golf-hole"
              >
                {view.waste.at(-1) ? (
                  <div
                    data-card={view.waste.at(-1)}
                    data-just-drawn={
                      justDrawn !== null && justDrawn === view.waste.at(-1) ? '' : undefined
                    }
                  >
                    <PlayingCard card={view.waste.at(-1)} disabled />
                  </div>
                ) : (
                  <span className={styles.emptyPile} aria-label="Empty hole">
                    ·
                  </span>
                )}
                <span className={styles.pileCount}>{view.waste.length}</span>
              </div>
            </PileLabel>
          </div>

          <div className={styles.tableau} aria-label="Tableau">
            {view.tableau.map((column, columnIndex) => (
              <TableauColumn
                key={columnIndex}
                index={columnIndex}
                cards={column}
                visible={deal.visibleByColumn[columnIndex] ?? column.length}
                ready={ready}
                playable={playable.has(columnIndex)}
                hinted={hintSource === `tableau:${columnIndex}`}
                onPlay={() => onDispatch?.('tableau.play', { from: columnIndex })}
              />
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
            data-testid="golf-result"
            role="status"
          >
            <span aria-hidden="true">♠ ♥ ♦ ♣</span>
            <h2>{view.stage === 'won' ? 'Hole in one' : 'Hole complete'}</h2>
            <p>
              {view.leftover} left · {view.moves} moves · {formatTime(elapsedMs)}
            </p>
            {view.mode === 'daily' ? <strong>Daily complete · {view.dailyKey}</strong> : null}
            <button type="button" className="btn-fat" onClick={onRestart}>
              Play this hole again
            </button>
            {view.mode !== 'daily' ? (
              <button type="button" className="btn-fat btn-fat--teal" onClick={onNewDeal}>
                New hole
              </button>
            ) : null}
          </section>
        ) : null}

        <GolfFxLayer fx={fx} fxKey={fxKey} rootRef={rootRef} reduced={reducedMotion} />
      </TablePlayfield>

      <TableActionRail className={styles.actions}>
        <button
          type="button"
          className="btn-fat btn-fat--ghost"
          data-testid="golf-undo"
          onClick={onUndo}
          disabled={!view.canUndo || deal.dealing || busy}
        >
          Undo
        </button>
        <button
          type="button"
          className="btn-fat btn-fat--ghost"
          data-testid="golf-hint"
          onClick={() => setShowHint(true)}
          disabled={!view.hint || deal.dealing}
        >
          Hint
        </button>
        <button
          type="button"
          className="btn-fat btn-fat--ghost"
          data-testid="golf-restart"
          onClick={onRestart}
        >
          Restart
        </button>
        {view.mode !== 'daily' ? (
          <button
            type="button"
            className="btn-fat btn-fat--ghost"
            data-testid="golf-new-deal"
            onClick={onNewDeal}
          >
            New hole
          </button>
        ) : (
          <span className={styles.dailyChip} data-testid="golf-daily">
            Daily
          </span>
        )}
      </TableActionRail>
    </TableScreenFrame>
  );
}

function TableauColumn({
  index,
  cards,
  visible,
  ready,
  playable,
  hinted,
  onPlay,
}: {
  index: number;
  cards: readonly string[];
  visible: number;
  ready: boolean;
  playable: boolean;
  hinted: boolean;
  onPlay: () => void;
}) {
  const shown = cards.slice(0, visible);
  return (
    <div
      className={styles.tableauColumn}
      data-zone={`tableau:${index}`}
      data-hint={hinted || undefined}
      data-testid={`golf-column-${index}`}
    >
      {shown.length === 0 ? <span className={styles.emptyColumn}>·</span> : null}
      {shown.map((card, row) => {
        const foot = row === shown.length - 1 && visible >= cards.length;
        return (
          <div
            key={`${card}:${row}`}
            className={styles.tableauCard}
            style={{ ['--face-row' as string]: row }}
            data-card={card}
            data-playable={foot && playable ? 'true' : undefined}
            data-zone-face={foot || undefined}
          >
            <PlayingCard
              card={card}
              onClick={foot && playable ? onPlay : undefined}
              disabled={!ready || !foot || !playable}
              actionLabel="Play"
            />
          </div>
        );
      })}
    </div>
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
  view: GolfTableView;
  deal: GolfDealPresentation;
  hintText: string | null;
  elapsedMs: number;
  dailyResult: GolfDailyResult | null;
  streak: number;
  busy: boolean;
}) {
  const ready = !busy && !deal.dealing && view.stage === 'playing';
  return {
    game: 'golf',
    status: view.stage === 'playing' ? (deal.dealing ? 'dealing' : 'ready') : view.stage,
    error: null,
    mode: view.mode,
    dailyKey: view.dailyKey,
    wrap: view.wrap,
    moves: view.moves,
    leftover: view.leftover,
    elapsedMs,
    layout: 'stock and hole top-center; tableau columns 0..6 left-to-right',
    stock: {
      count: view.stockCount,
      canDraw: ready && view.legal.some((move) => move.id === 'stock.draw'),
    },
    hole: { count: view.waste.length, top: view.waste.at(-1) ?? null },
    tableau: view.tableau.map((column, index) => ({
      column: index,
      cards: column,
      playable: playableColumns(view).includes(index),
    })),
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
