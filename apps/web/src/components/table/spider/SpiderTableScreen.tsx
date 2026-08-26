'use client';

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type Dispatch,
  type SetStateAction,
} from 'react';
import type { FxEvent } from '@parlour/engine';
import { FOUNDATION_SLOTS, spiderCatalog } from '@parlour/game-spider';
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
import {
  useSpiderDealPresentation,
  type SpiderDealPresentation,
} from '@/lib/spider/deal-presentation';
import {
  cardOfMove,
  describeHint,
  moveForTarget,
  selectionForCard,
  sourceOfMove,
  targetOfMove,
  targetsForSelection,
  type SpiderSelection,
  type SpiderTableView,
  type SpiderZone,
} from '@/lib/spider/view';
import type { SpiderDailyResult } from '@/stores/spiderStats';
import { SpiderFxLayer } from './fx-layer';
import styles from '@/styles/spider.module.css';

export interface SpiderTableScreenProps {
  view: SpiderTableView | null;
  fx: readonly FxEvent[];
  fxKey: string | number;
  elapsedMs?: number;
  dailyResult?: SpiderDailyResult | null;
  streak?: number;
  busy?: boolean;
  error?: string | null;
  onDispatch?: (move: string, payload?: unknown) => void;
  onUndo?: () => void;
  onRestart?: () => void;
  onNewDeal?: () => void;
  onQuit?: () => void;
}

export function SpiderTableScreen(props: SpiderTableScreenProps) {
  const profileReduced = useProfileStore((state) => state.settings.reducedMotion);
  const reducedMotion = useCalmMotion(profileReduced);
  const deal = useSpiderDealPresentation(props.fx, props.fxKey, reducedMotion);
  const view = props.view;
  const moveNo = view?.moves ?? -1;
  const [selectionState, setSelectionState] = useState<{
    move: number;
    value: SpiderSelection | null;
  }>({ move: moveNo, value: null });
  const selection = selectionState.move === moveNo ? selectionState.value : null;
  const setSelection: Dispatch<SetStateAction<SpiderSelection | null>> = (update) => {
    setSelectionState((current) => {
      const valueAtMove = current.move === moveNo ? current.value : null;
      return {
        move: moveNo,
        value: typeof update === 'function' ? update(valueAtMove) : update,
      };
    });
  };

  const [hintMove, setHintMove] = useState<number | null>(null);
  const showHint = hintMove === moveNo;
  const setShowHint = (visible: boolean) => setHintMove(visible ? moveNo : null);
  const targets = useMemo(
    () => (view ? targetsForSelection(view, selection) : []),
    [selection, view],
  );
  const hintText = view && showHint ? describeHint(view.hint, view) : null;

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
    if (props.error) return { game: 'spider', status: 'error', error: props.error };
    if (!view) return { game: 'spider', status: 'loading', error: null };
    return textSurfaceFor({
      view,
      deal,
      selection,
      targets,
      hintText,
      elapsedMs: props.elapsedMs ?? 0,
      dailyResult: props.dailyResult ?? null,
      streak: props.streak ?? 0,
      busy: props.busy ?? false,
    });
  });

  if (props.error) {
    return (
      <TableErrorScreen headline="The solitaire table lost the thread." message={props.error} />
    );
  }
  if (!view) return <TableLoadingScreen copy="Laying out ten columns…" />;
  return (
    <ReadySpiderTable
      {...props}
      view={view}
      deal={deal}
      reducedMotion={reducedMotion}
      selection={selection}
      setSelection={setSelection}
      showHint={showHint}
      setShowHint={setShowHint}
    />
  );
}

function ReadySpiderTable({
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
  selection,
  setSelection,
  showHint,
  setShowHint,
}: SpiderTableScreenProps & {
  view: SpiderTableView;
  deal: SpiderDealPresentation;
  reducedMotion: boolean;
  selection: SpiderSelection | null;
  setSelection: Dispatch<SetStateAction<SpiderSelection | null>>;
  showHint: boolean;
  setShowHint: (visible: boolean) => void;
}) {
  const rootRef = useRef<HTMLElement>(null);
  const menu = useTableMenu(onQuit ?? (() => undefined));
  const targets = useMemo(() => targetsForSelection(view, selection), [selection, view]);
  const hintText = showHint ? describeHint(view.hint, view) : null;
  const hintSource = showHint && view.hint ? sourceOfMove(view.hint.move) : null;
  const hintTarget = showHint && view.hint ? targetOfMove(view.hint.move) : null;
  const runHeads = useMemo(() => movableRunHeads(view), [view]);
  const ready = !busy && !deal.dealing && view.stage === 'playing';
  const suitLabel =
    view.suitCount === 1 ? 'one suit' : view.suitCount === 4 ? 'four suits' : 'two suits';

  const actOnTarget = (target: SpiderZone): boolean => {
    if (!selection || !ready) return false;
    const move = moveForTarget(view, selection, target);
    if (!move) return false;
    onDispatch?.(move.id, move.payload);
    return true;
  };

  const selectCard = (from: SpiderSelection['from'], card: string) => {
    if (!ready) return;
    if (actOnTarget(from)) return;
    const next = selectionForCard(view, from, card);
    setSelection((current) =>
      current && next && current.from === next.from && current.card === next.card ? null : next,
    );
    setShowHint(false);
  };

  const stockMove = view.legal.find((move) => move.id === 'stock.deal');

  return (
    <TableScreenFrame
      rootRef={rootRef}
      className={styles.screen}
      dealState={deal.sequence ? (deal.dealing ? 'dealing' : 'complete') : undefined}
      menu={menu}
      hud={
        <TableTitlePill
          eyebrow="Spider"
          status={
            view.mode === 'daily' ? `Daily · ${view.dailyKey}` : `${view.mode} · ${suitLabel}`
          }
          className={styles.titlePill}
        >
          <span className={styles.metrics}>
            <b>{view.moves}</b> moves · <b>{formatTime(elapsedMs)}</b>
          </span>
        </TableTitlePill>
      }
      howToPlay={{
        doc: spiderCatalog.howToPlay,
        title: 'Spider',
        subtitle: 'the two-deck solitaire',
      }}
    >
      <TablePlayfield label="Spider table" feltMark="S" className={styles.playfield}>
        <div
          className={styles.board}
          data-testid="spider-board"
          data-holding={selection ? '' : undefined}
          aria-busy={deal.dealing}
        >
          <div className={styles.topRow}>
            <div className={styles.stockRail}>
              <PileLabel label={`Stock · ${view.stockDeals} deals`}>
                <button
                  type="button"
                  className={styles.pileButton}
                  data-zone="stock"
                  data-zone-face
                  data-hint={hintSource === 'stock' || hintTarget === 'stock' || undefined}
                  data-testid="spider-stock"
                  onClick={() => stockMove && onDispatch?.(stockMove.id, stockMove.payload)}
                  disabled={!ready || !stockMove}
                  aria-label={`Deal a row from the stock, ${view.stockDeals} remaining`}
                >
                  {view.stockCount > 0 ? (
                    <PlayingCard faceDown />
                  ) : (
                    <span className={styles.emptyPile}>·</span>
                  )}
                  <span className={styles.pileCount}>{view.stockCount}</span>
                </button>
              </PileLabel>
            </div>

            {runHeads.length > 0 ? (
              <div
                className={styles.runPicker}
                data-testid="spider-run-picker"
                role="toolbar"
                aria-label="Movable tableau runs"
              >
                {runHeads.map((run) => (
                  <button
                    key={`${run.from}:${run.card}`}
                    type="button"
                    data-testid="spider-run-head"
                    data-card={run.card}
                    data-column={run.from}
                    data-run-count={run.count}
                    aria-pressed={
                      selection?.from === `tableau:${run.from}` && selection.card === run.card
                    }
                    aria-label={`Select ${cardLabel(run.card)} from tableau column ${run.from + 1}, ${run.count} card${run.count === 1 ? '' : 's'}`}
                    onClick={() => selectCard(`tableau:${run.from}`, run.card)}
                    disabled={!ready}
                  >
                    <span>{cardShortLabel(run.card)}</span>
                    <small>
                      C{run.from + 1} · {run.count}
                    </small>
                  </button>
                ))}
              </div>
            ) : null}

            <div className={styles.foundations} aria-label="Foundations">
              {Array.from({ length: FOUNDATION_SLOTS }, (_, slot) => {
                const zone = `foundation:${slot}` as const;
                const pile = view.foundations[slot] ?? [];
                const top = pile[0];
                return (
                  <PileLabel
                    key={slot}
                    label={pile.length ? `Suit ${slot + 1}` : `Slot ${slot + 1}`}
                  >
                    <div className={styles.pileButton} data-zone={zone} data-zone-face>
                      {top ? (
                        <div data-card={top}>
                          <PlayingCard card={top} disabled />
                        </div>
                      ) : (
                        <span
                          className={styles.emptyFoundation}
                          aria-label={`Empty foundation ${slot + 1}`}
                        >
                          {slot + 1}
                        </span>
                      )}
                      <span className={styles.pileCount}>{pile.length}</span>
                    </div>
                  </PileLabel>
                );
              })}
            </div>
          </div>

          <div className={styles.tableau} aria-label="Tableau">
            {view.tableau.map((column, columnIndex) => (
              <TableauColumn
                key={columnIndex}
                index={columnIndex}
                down={column.down.length}
                up={column.up}
                visible={deal.visibleByColumn[columnIndex] ?? column.down.length + column.up.length}
                ready={ready}
                selection={selection}
                legalTarget={targets.includes(`tableau:${columnIndex}`)}
                hinted={
                  hintSource === `tableau:${columnIndex}` || hintTarget === `tableau:${columnIndex}`
                }
                onCard={(card) => selectCard(`tableau:${columnIndex}`, card)}
                onTarget={() => actOnTarget(`tableau:${columnIndex}`)}
              />
            ))}
          </div>
        </div>

        {hintText ? (
          <p className={styles.hintBanner} role="status">
            {hintText}
          </p>
        ) : null}

        {view.stage === 'won' ? (
          <section
            className={`${styles.winPanel} panel-soft`}
            data-testid="spider-win"
            role="status"
          >
            <span aria-hidden="true">♠ ♥ ♦ ♣</span>
            <h2>Table cleared</h2>
            <p>
              {view.moves} moves · {formatTime(elapsedMs)}
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

        <SpiderFxLayer fx={fx} fxKey={fxKey} rootRef={rootRef} reduced={reducedMotion} />
      </TablePlayfield>

      <TableActionRail className={styles.actions}>
        <button
          type="button"
          className="btn-fat btn-fat--ghost"
          data-testid="spider-undo"
          onClick={onUndo}
          disabled={!view.canUndo || deal.dealing || busy}
        >
          Undo
        </button>
        <button
          type="button"
          className="btn-fat btn-fat--ghost"
          data-testid="spider-hint"
          onClick={() => setShowHint(true)}
          disabled={!view.hint || deal.dealing}
        >
          Hint
        </button>
        <button
          type="button"
          className="btn-fat btn-fat--ghost"
          data-testid="spider-restart"
          onClick={onRestart}
        >
          Restart
        </button>
        {view.mode !== 'daily' ? (
          <button
            type="button"
            className="btn-fat btn-fat--ghost"
            data-testid="spider-new-deal"
            onClick={onNewDeal}
          >
            New deal
          </button>
        ) : (
          <span className={styles.dailyChip} data-testid="spider-daily">
            Daily
          </span>
        )}
      </TableActionRail>

      <div className={styles.rotateNotice} data-testid="spider-rotate-notice" role="status">
        <span aria-hidden="true">▭</span>
        <strong>Turn the table sideways</strong>
        <p>Ten solitaire columns need a landscape table.</p>
      </div>
    </TableScreenFrame>
  );
}

function TableauColumn({
  index,
  down,
  up,
  visible,
  ready,
  selection,
  legalTarget,
  hinted,
  onCard,
  onTarget,
}: {
  index: number;
  down: number;
  up: readonly string[];
  visible: number;
  ready: boolean;
  selection: SpiderSelection | null;
  legalTarget: boolean;
  hinted: boolean;
  onCard: (card: string) => void;
  onTarget: () => void;
}) {
  const visibleDown = Math.min(down, visible);
  const showUp = visible > down;
  const zone = `tableau:${index}` as const;
  return (
    <div
      className={styles.tableauColumn}
      data-zone={zone}
      data-legal-target={legalTarget || undefined}
      data-hint={hinted || undefined}
      style={{ ['--down-count' as string]: visibleDown }}
    >
      <button
        type="button"
        className={styles.columnTarget}
        onClick={onTarget}
        disabled={!ready || !legalTarget}
        aria-label={`Tableau column ${index + 1}${legalTarget ? ', move selected cards here' : ''}`}
      />
      {Array.from({ length: visibleDown }, (_, cardIndex) => (
        <span
          key={`down:${cardIndex}`}
          className={styles.tableauCard}
          data-face-down
          aria-label="Face-down card"
          style={{ ['--card-row' as string]: cardIndex, ['--face-row' as string]: 0 }}
        >
          <PlayingCard faceDown />
        </span>
      ))}
      {showUp
        ? up.map((card, cardIndex) => (
            <div
              key={card}
              className={styles.tableauCard}
              data-card={card}
              data-zone-face={cardIndex === up.length - 1 || undefined}
              data-selected={(selection?.from === zone && selection.card === card) || undefined}
              data-in-selected-run={
                selection?.from === zone && up.indexOf(selection.card) <= cardIndex ? '' : undefined
              }
              style={{ ['--card-row' as string]: visibleDown, ['--face-row' as string]: cardIndex }}
            >
              <PlayingCard
                card={card}
                onClick={() => onCard(card)}
                disabled={!ready}
                actionLabel="Select"
              />
            </div>
          ))
        : null}
      {down === 0 && up.length === 0 ? (
        <span className={styles.emptyColumn} aria-hidden="true">
          ·
        </span>
      ) : null}
    </div>
  );
}

function PileLabel({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className={styles.pileWrap}>
      {children}
      <span className={styles.pileLabel}>{label}</span>
    </div>
  );
}

function formatTime(ms: number): string {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}

function textSurfaceFor({
  view,
  deal,
  selection,
  targets,
  hintText,
  elapsedMs,
  dailyResult,
  streak,
  busy,
}: {
  view: SpiderTableView;
  deal: SpiderDealPresentation;
  selection: SpiderSelection | null;
  targets: readonly SpiderZone[];
  hintText: string | null;
  elapsedMs: number;
  dailyResult: SpiderDailyResult | null;
  streak: number;
  busy: boolean;
}) {
  const ready = !busy && !deal.dealing && view.stage === 'playing';
  return {
    game: 'spider',
    status: view.stage === 'won' ? 'won' : deal.dealing ? 'dealing' : 'ready',
    error: null,
    mode: view.mode,
    dailyKey: view.dailyKey,
    moves: view.moves,
    elapsedMs,
    layout: 'stock top-left; eight foundation slots top-right; tableau columns 0..9 left-to-right',
    stock: {
      count: view.stockCount,
      deals: view.stockDeals,
      canDeal: ready && view.legal.some((move) => move.id === 'stock.deal'),
    },
    foundations: view.foundations.map((pile, slot) => ({
      slot,
      count: pile.length,
      top: pile[0] ?? null,
    })),
    tableau: view.tableau.map((column, index) => ({
      column: index,
      downCount: column.down.length,
      up: column.up,
    })),
    selection,
    legal: {
      targets,
      canDeal: ready && view.legal.some((move) => move.id === 'stock.deal'),
      canUndo: view.canUndo,
      canFinish: view.canFinish,
    },
    hint: hintText,
    daily: {
      completed: dailyResult !== null,
      bestMoves: dailyResult?.bestMoves ?? null,
      bestTimeMs: dailyResult?.bestTimeMs ?? null,
      streak,
    },
    won: view.stage === 'won',
  };
}

function movableRunHeads(view: SpiderTableView): Array<{
  from: number;
  card: string;
  count: number;
}> {
  const seen = new Set<string>();
  return view.legal.flatMap((move) => {
    if (move.id !== 'tableau.move') return [];
    const source = sourceOfMove(move);
    const card = cardOfMove(move, view);
    if (!source?.startsWith('tableau:') || !card) return [];
    const key = `${source}:${card}`;
    if (seen.has(key)) return [];
    seen.add(key);
    const from = Number(source.slice('tableau:'.length));
    const up = view.tableau[from]?.up ?? [];
    const index = up.indexOf(card);
    return index < 0 ? [] : [{ from, card, count: up.length - index }];
  });
}

function cardShortLabel(card: string): string {
  const ranks = ['', 'A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
  const glyphs: Record<string, string> = { S: '♠', H: '♥', D: '♦', C: '♣' };
  const rank = Number.parseInt(card.slice(1), 10);
  return `${ranks[rank] ?? card.slice(1)}${glyphs[card[0] ?? ''] ?? ''}`;
}

function cardLabel(card: string): string {
  const suits: Record<string, string> = {
    S: 'spades',
    H: 'hearts',
    D: 'diamonds',
    C: 'clubs',
  };
  const ranks = ['', 'Ace', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'Jack', 'Queen', 'King'];
  const rank = Number.parseInt(card.slice(1), 10);
  return `${ranks[rank] ?? card.slice(1)} of ${suits[card[0] ?? ''] ?? 'cards'}`;
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
