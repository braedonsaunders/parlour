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
import { SUITS, type KlondikeSuit } from '@parlour/game-klondike';
import { PlayingCard } from '@/components/table/PlayingCard';
import {
  TableActionRail,
  TableErrorScreen,
  TableLoadingScreen,
  TablePlayfield,
  TableScreenFrame,
  TableTitlePill,
  canOfferSolitaireHint,
  SolitaireUndoButton,
  useGameTextSurface,
  useTableMenu,
} from '@/components/table/shell';
import { useProfileStore } from '@/stores/profile';
import { klondikeCatalog } from '@parlour/game-klondike';
import {
  useKlondikeDealPresentation,
  type KlondikeDealPresentation,
} from '@/lib/klondike/deal-presentation';
import {
  cardOfMove,
  describeHint,
  moveForTarget,
  selectionForCard,
  sourceOfMove,
  targetOfMove,
  targetsForSelection,
  type KlondikeSelection,
  type KlondikeTableView,
  type KlondikeZone,
} from '@/lib/klondike/view';
import type { KlondikeDailyResult } from '@/stores/klondikeStats';
import { KlondikeFxLayer } from './fx-layer';
import styles from '@/styles/klondike.module.css';

const SUIT_GLYPHS: Record<KlondikeSuit, string> = {
  spades: '♠',
  hearts: '♥',
  diamonds: '♦',
  clubs: '♣',
};

export interface KlondikeTableScreenProps {
  view: KlondikeTableView | null;
  fx: readonly FxEvent[];
  fxKey: string | number;
  elapsedMs?: number;
  dailyResult?: KlondikeDailyResult | null;
  streak?: number;
  busy?: boolean;
  error?: string | null;
  onDispatch?: (move: string, payload?: unknown) => void;
  onUndo?: () => void;
  onRestart?: () => void;
  onNewDeal?: () => void;
  onFinish?: () => void;
  onQuit?: () => void;
}

export function KlondikeTableScreen(props: KlondikeTableScreenProps) {
  const profileReduced = useProfileStore((state) => state.settings.reducedMotion);
  const reducedMotion = useCalmMotion(profileReduced);
  const deal = useKlondikeDealPresentation(props.fx, props.fxKey, reducedMotion);
  const view = props.view;
  const moveNo = view?.moves ?? -1;
  const [selectionState, setSelectionState] = useState<{
    move: number;
    value: KlondikeSelection | null;
  }>({ move: moveNo, value: null });
  const selection = selectionState.move === moveNo ? selectionState.value : null;
  const setSelection: Dispatch<SetStateAction<KlondikeSelection | null>> = (update) => {
    setSelectionState((current) => {
      const valueAtMove = current.move === moveNo ? current.value : null;
      return {
        move: moveNo,
        value: typeof update === 'function' ? update(valueAtMove) : update,
      };
    });
  };
  /*
   * The card the stock just turned up.
   *
   * Keyed by move number so it clears itself the moment anything else happens:
   * a fresh card is only "fresh" until the player does the next thing, and the
   * flag must never survive an undo or a restart.
   */
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
    if (props.error) return { game: 'klondike', status: 'error', error: props.error };
    if (!view) return { game: 'klondike', status: 'loading', error: null };
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
  if (!view) return <TableLoadingScreen copy="Laying out seven columns…" />;
  return (
    <ReadyKlondikeTable
      {...props}
      view={view}
      deal={deal}
      reducedMotion={reducedMotion}
      selection={selection}
      setSelection={setSelection}
      justDrawn={justDrawn}
      showHint={showHint}
      setShowHint={setShowHint}
    />
  );
}

function ReadyKlondikeTable({
  view,
  fx,
  fxKey,
  elapsedMs = 0,
  busy = false,
  onDispatch,
  onUndo,
  onRestart,
  onNewDeal,
  onFinish,
  onQuit,
  deal,
  reducedMotion,
  selection,
  setSelection,
  justDrawn,
  showHint,
  setShowHint,
}: KlondikeTableScreenProps & {
  view: KlondikeTableView;
  deal: KlondikeDealPresentation;
  reducedMotion: boolean;
  selection: KlondikeSelection | null;
  setSelection: Dispatch<SetStateAction<KlondikeSelection | null>>;
  /** The card the stock just turned up, called out until the next move. */
  justDrawn: string | null;
  showHint: boolean;
  setShowHint: (visible: boolean) => void;
}) {
  const rootRef = useRef<HTMLElement>(null);
  const menu = useTableMenu(onQuit ?? (() => undefined));
  const targets = useMemo(() => targetsForSelection(view, selection), [selection, view]);
  const hintText = showHint ? describeHint(view.hint, view) : null;
  const hintSource = showHint && view.hint ? sourceOfMove(view.hint.move, view) : null;
  const hintTarget = showHint && view.hint ? targetOfMove(view.hint.move, view) : null;
  const runHeads = useMemo(() => movableRunHeads(view), [view]);
  const ready = !busy && !deal.dealing && view.stage === 'playing';

  const actOnTarget = (target: KlondikeZone): boolean => {
    if (!selection || !ready) return false;
    const move = moveForTarget(view, selection, target);
    if (!move) return false;
    onDispatch?.(move.id, move.payload);
    return true;
  };

  const selectCard = (from: KlondikeSelection['from'], card: string) => {
    if (!ready) return;
    if (actOnTarget(from)) return;
    const next = selectionForCard(view, from, card);
    setSelection((current) =>
      current && next && current.from === next.from && current.card === next.card ? null : next,
    );
    setShowHint(false);
  };

  const stockMove = view.legal.find(
    (move) => move.id === 'stock.draw' || move.id === 'stock.recycle',
  );

  return (
    <TableScreenFrame
      rootRef={rootRef}
      className={styles.screen}
      dealState={deal.sequence ? (deal.dealing ? 'dealing' : 'complete') : undefined}
      menu={menu}
      hud={
        <TableTitlePill
          eyebrow="Klondike"
          status={
            view.mode === 'daily'
              ? `Daily · ${view.dailyKey}`
              : `${view.mode} · Draw ${view.drawCount}`
          }
          className={styles.titlePill}
        >
          <span className={styles.metrics}>
            <b>{view.moves}</b> moves · <b>{formatTime(elapsedMs)}</b>
          </span>
        </TableTitlePill>
      }
      howToPlay={{
        doc: klondikeCatalog.howToPlay,
        title: 'Klondike',
        subtitle: 'the solitaire classic',
      }}
    >
      <TablePlayfield label="Klondike table" feltMark="K" className={styles.playfield}>
        <div
          className={styles.board}
          data-testid="klondike-board"
          data-holding={selection ? '' : undefined}
          aria-busy={deal.dealing}
        >
          <div className={styles.topRow}>
            <div className={styles.stockWaste}>
              <PileLabel label={`Stock · ${view.stockCount}`}>
                <button
                  type="button"
                  className={styles.pileButton}
                  data-zone="stock"
                  data-zone-face
                  data-hint={hintSource === 'stock' || hintTarget === 'stock' || undefined}
                  data-testid="klondike-stock"
                  onClick={() => stockMove && onDispatch?.(stockMove.id, stockMove.payload)}
                  disabled={!ready || !stockMove}
                  aria-label={
                    stockMove?.id === 'stock.recycle'
                      ? 'Recycle waste to stock'
                      : `Draw ${view.drawCount} from stock`
                  }
                >
                  {view.stockCount > 0 ? (
                    <PlayingCard faceDown />
                  ) : (
                    <span className={styles.emptyPile}>↻</span>
                  )}
                  <span className={styles.pileCount}>{view.stockCount}</span>
                </button>
              </PileLabel>
              <PileLabel label={`Waste · ${view.waste.length}`}>
                <div
                  className={styles.pileButton}
                  data-zone="waste"
                  data-zone-face
                  data-holds-selection={selection?.from === 'waste' || undefined}
                  data-hint={hintSource === 'waste' || hintTarget === 'waste' || undefined}
                >
                  {view.waste.at(-1) ? (
                    <div
                      data-card={view.waste.at(-1)}
                      data-selected={selection?.from === 'waste' || undefined}
                      data-just-drawn={
                        justDrawn !== null && justDrawn === view.waste.at(-1) ? '' : undefined
                      }
                      data-hint={hintSource === 'waste' || undefined}
                    >
                      <PlayingCard
                        card={view.waste.at(-1)}
                        onClick={() => selectCard('waste', view.waste.at(-1)!)}
                        disabled={!ready}
                        actionLabel="Select"
                      />
                    </div>
                  ) : (
                    <span className={styles.emptyPile} aria-label="Empty waste">
                      ·
                    </span>
                  )}
                  <span className={styles.pileCount}>{view.waste.length}</span>
                </div>
              </PileLabel>
            </div>

            {runHeads.length > 0 ? (
              <div
                className={styles.runPicker}
                data-testid="klondike-run-picker"
                role="toolbar"
                aria-label="Movable tableau runs"
              >
                {runHeads.map((run) => (
                  <button
                    key={`${run.from}:${run.card}`}
                    type="button"
                    data-testid="klondike-run-head"
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
              {SUITS.map((suit) => {
                const zone = `foundation:${suit}` as const;
                const top = view.foundations[suit].at(-1);
                const legalTarget = targets.includes(zone);
                return (
                  <PileLabel key={suit} label={`${suit} · ${view.foundations[suit].length}`}>
                    <div
                      className={styles.pileButton}
                      data-zone={zone}
                      data-zone-face
                      data-legal-target={legalTarget || undefined}
                      data-holds-selection={selection?.from === zone || undefined}
                      data-hint={hintTarget === zone || hintSource === zone || undefined}
                    >
                      {top ? (
                        <div data-card={top} data-selected={selection?.from === zone || undefined}>
                          <PlayingCard
                            card={top}
                            onClick={() => {
                              if (!actOnTarget(zone)) selectCard(zone, top);
                            }}
                            disabled={!ready}
                            actionLabel={legalTarget ? 'Move to' : 'Select'}
                          />
                        </div>
                      ) : (
                        <button
                          type="button"
                          className={styles.emptyFoundation}
                          onClick={() => actOnTarget(zone)}
                          disabled={!ready || !legalTarget}
                          aria-label={`Empty ${suit} foundation${legalTarget ? ', move selected card here' : ''}`}
                        >
                          {SUIT_GLYPHS[suit]}
                        </button>
                      )}
                      <span className={styles.pileCount}>{view.foundations[suit].length}</span>
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
                visible={deal.visibleByColumn[columnIndex] ?? columnIndex + 1}
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
            data-testid="klondike-win"
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

        <KlondikeFxLayer fx={fx} fxKey={fxKey} rootRef={rootRef} reduced={reducedMotion} />
      </TablePlayfield>

      <TableActionRail className={styles.actions}>
        <SolitaireUndoButton
          depth={view.undoDepth}
          testId="klondike-undo"
          onUndo={onUndo}
          disabled={!view.canUndo || deal.dealing || busy}
        />
        <button
          type="button"
          className="btn-fat btn-fat--ghost"
          data-testid="klondike-hint"
          onClick={() => setShowHint(true)}
          disabled={!canOfferSolitaireHint(deal.dealing, view)}
        >
          Hint
        </button>
        <button
          type="button"
          className="btn-fat btn-fat--ghost"
          data-testid="klondike-restart"
          onClick={onRestart}
        >
          Restart
        </button>
        {view.mode !== 'daily' ? (
          <button
            type="button"
            className="btn-fat btn-fat--ghost"
            data-testid="klondike-new-deal"
            onClick={onNewDeal}
          >
            New deal
          </button>
        ) : (
          <span className={styles.dailyChip} data-testid="klondike-daily">
            Daily
          </span>
        )}
        {view.canFinish ? (
          <button
            type="button"
            className="btn-fat"
            data-testid="klondike-finish"
            onClick={onFinish}
          >
            Finish
          </button>
        ) : null}
      </TableActionRail>
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
  selection: KlondikeSelection | null;
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
          K
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
  view: KlondikeTableView;
  deal: KlondikeDealPresentation;
  selection: KlondikeSelection | null;
  targets: readonly KlondikeZone[];
  hintText: string | null;
  elapsedMs: number;
  dailyResult: KlondikeDailyResult | null;
  streak: number;
  busy: boolean;
}) {
  const ready = !busy && !deal.dealing && view.stage === 'playing';
  return {
    game: 'klondike',
    status: view.stage === 'won' ? 'won' : deal.dealing ? 'dealing' : 'ready',
    error: null,
    mode: view.mode,
    dailyKey: view.dailyKey,
    moves: view.moves,
    recycles: view.recycles,
    elapsedMs,
    layout: 'stock and waste top-left; foundations top-right; tableau columns 0..6 left-to-right',
    stock: {
      count: view.stockCount,
      canDraw: ready && view.legal.some((move) => move.id === 'stock.draw'),
      canRecycle: ready && view.legal.some((move) => move.id === 'stock.recycle'),
    },
    waste: { count: view.waste.length, top: view.waste.at(-1) ?? null },
    foundations: Object.fromEntries(
      SUITS.map((suit) => [
        suit,
        { count: view.foundations[suit].length, top: view.foundations[suit].at(-1) ?? null },
      ]),
    ),
    tableau: view.tableau.map((column, index) => ({
      column: index,
      downCount: column.down.length,
      up: column.up,
    })),
    selection,
    legal: {
      targets,
      canDraw: ready && view.legal.some((move) => move.id === 'stock.draw'),
      canRecycle: ready && view.legal.some((move) => move.id === 'stock.recycle'),
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

function movableRunHeads(view: KlondikeTableView): Array<{
  from: number;
  card: string;
  count: number;
}> {
  const seen = new Set<string>();
  return view.legal.flatMap((move) => {
    if (move.id !== 'tableau.move') return [];
    const source = sourceOfMove(move, view);
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
  return `${ranks[Number(card.slice(1))] ?? card.slice(1)}${glyphs[card[0] ?? ''] ?? ''}`;
}

function cardLabel(card: string): string {
  const suits: Record<string, string> = {
    S: 'spades',
    H: 'hearts',
    D: 'diamonds',
    C: 'clubs',
  };
  const ranks = ['', 'Ace', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'Jack', 'Queen', 'King'];
  return `${ranks[Number(card.slice(1))] ?? card.slice(1)} of ${suits[card[0] ?? ''] ?? 'cards'}`;
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
