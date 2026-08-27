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
import { SUITS, type FreecellSuit } from '@parlour/game-freecell';
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
import { freecellCatalog } from '@parlour/game-freecell';
import {
  useFreecellDealPresentation,
  type FreecellDealPresentation,
} from '@/lib/freecell/deal-presentation';
import {
  cardOfMove,
  describeHint,
  moveForTarget,
  selectionForCard,
  sourceOfMove,
  targetOfMove,
  targetsForSelection,
  type FreecellSelection,
  type FreecellTableView,
  type FreecellZone,
} from '@/lib/freecell/view';
import type { FreecellDailyResult } from '@/stores/freecellStats';
import { FreecellFxLayer } from './fx-layer';
import styles from '@/styles/freecell.module.css';

const SUIT_GLYPHS: Record<FreecellSuit, string> = {
  spades: '♠',
  hearts: '♥',
  diamonds: '♦',
  clubs: '♣',
};

export interface FreecellTableScreenProps {
  view: FreecellTableView | null;
  fx: readonly FxEvent[];
  fxKey: string | number;
  elapsedMs?: number;
  dailyResult?: FreecellDailyResult | null;
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

export function FreecellTableScreen(props: FreecellTableScreenProps) {
  const profileReduced = useProfileStore((state) => state.settings.reducedMotion);
  const reducedMotion = useCalmMotion(profileReduced);
  const deal = useFreecellDealPresentation(props.fx, props.fxKey, reducedMotion);
  const view = props.view;
  const moveNo = view?.moves ?? -1;
  const [selectionState, setSelectionState] = useState<{
    move: number;
    value: FreecellSelection | null;
  }>({ move: moveNo, value: null });
  const selection = selectionState.move === moveNo ? selectionState.value : null;
  const setSelection: Dispatch<SetStateAction<FreecellSelection | null>> = (update) => {
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
    if (props.error) return { game: 'freecell', status: 'error', error: props.error };
    if (!view) return { game: 'freecell', status: 'loading', error: null };
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
  if (!view) return <TableLoadingScreen copy="Laying out eight columns…" />;
  return (
    <ReadyFreecellTable
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

function ReadyFreecellTable({
  view,
  fx,
  fxKey,
  elapsedMs = 0,
  streak = 0,
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
  showHint,
  setShowHint,
}: FreecellTableScreenProps & {
  view: FreecellTableView;
  deal: FreecellDealPresentation;
  reducedMotion: boolean;
  selection: FreecellSelection | null;
  setSelection: Dispatch<SetStateAction<FreecellSelection | null>>;
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

  const actOnTarget = (target: FreecellZone): boolean => {
    if (!selection || !ready) return false;
    const move = moveForTarget(view, selection, target);
    if (!move) return false;
    onDispatch?.(move.id, move.payload);
    return true;
  };

  const selectCard = (from: FreecellSelection['from'], card: string) => {
    if (!ready) return;
    if (actOnTarget(from)) return;
    const next = selectionForCard(view, from, card);
    setSelection((current) =>
      current && next && current.from === next.from && current.card === next.card ? null : next,
    );
    setShowHint(false);
  };

  return (
    <TableScreenFrame
      rootRef={rootRef}
      className={styles.screen}
      dealState={deal.sequence ? (deal.dealing ? 'dealing' : 'complete') : undefined}
      menu={menu}
      hud={
        <TableTitlePill
          eyebrow="FreeCell"
          status={
            view.mode === 'daily'
              ? `Daily · ${view.dailyKey}`
              : `${view.mode} · ${view.freeCells} cells`
          }
          className={styles.titlePill}
        >
          <span className={styles.metrics}>
            <b>{view.moves}</b> moves · <b>{formatTime(elapsedMs)}</b>
            {view.mode === 'daily' ? (
              <>
                {' '}
                · <b>{streak}</b> streak
              </>
            ) : null}
          </span>
        </TableTitlePill>
      }
      howToPlay={{
        doc: freecellCatalog.howToPlay,
        title: 'FreeCell',
        subtitle: 'the open solitaire',
      }}
    >
      <TablePlayfield label="FreeCell table" feltMark="F" className={styles.playfield}>
        <div
          className={styles.board}
          data-testid="freecell-board"
          data-holding={selection ? '' : undefined}
          aria-busy={deal.dealing}
        >
          <div className={styles.topRow}>
            <div className={styles.cells} aria-label="Free cells">
              {view.cells.map((card, index) => {
                const zone = `cell:${index}` as const;
                const legalTarget = targets.includes(zone);
                return (
                  <PileLabel key={zone} label={`Cell ${index + 1}`}>
                    <div
                      className={styles.pileButton}
                      data-zone={zone}
                      data-zone-face
                      data-legal-target={legalTarget || undefined}
                      data-holds-selection={selection?.from === zone || undefined}
                      data-hint={hintSource === zone || hintTarget === zone || undefined}
                      data-testid={`freecell-cell-${index}`}
                    >
                      {card ? (
                        <div data-card={card} data-selected={selection?.from === zone || undefined}>
                          <PlayingCard
                            card={card}
                            onClick={() => {
                              if (!actOnTarget(zone)) selectCard(zone, card);
                            }}
                            disabled={!ready}
                            actionLabel={legalTarget ? 'Move to' : 'Select'}
                          />
                        </div>
                      ) : (
                        <button
                          type="button"
                          className={styles.emptyPile}
                          onClick={() => actOnTarget(zone)}
                          disabled={!ready || !legalTarget}
                          aria-label={`Empty free cell ${index + 1}${legalTarget ? ', move selected card here' : ''}`}
                        >
                          ·
                        </button>
                      )}
                    </div>
                  </PileLabel>
                );
              })}
            </div>

            {runHeads.length > 0 ? (
              <div
                className={styles.runPicker}
                data-testid="freecell-run-picker"
                role="toolbar"
                aria-label="Movable tableau runs"
              >
                {runHeads.map((run) => (
                  <button
                    key={`${run.from}:${run.card}`}
                    type="button"
                    data-testid="freecell-run-head"
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
                cards={column}
                visible={deal.visibleByColumn[columnIndex] ?? column.length}
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
            data-testid="freecell-win"
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

        <FreecellFxLayer fx={fx} fxKey={fxKey} rootRef={rootRef} reduced={reducedMotion} />
      </TablePlayfield>

      <TableActionRail className={styles.actions}>
        <SolitaireUndoButton
          depth={view.undoDepth}
          testId="freecell-undo"
          onUndo={onUndo}
          disabled={!view.canUndo || deal.dealing || busy}
        />
        <button
          type="button"
          className="btn-fat btn-fat--ghost"
          data-testid="freecell-hint"
          onClick={() => setShowHint(true)}
          disabled={!canOfferSolitaireHint(deal.dealing, view)}
        >
          Hint
        </button>
        <button
          type="button"
          className="btn-fat btn-fat--ghost"
          data-testid="freecell-restart"
          onClick={onRestart}
        >
          Restart
        </button>
        {view.mode !== 'daily' ? (
          <button
            type="button"
            className="btn-fat btn-fat--ghost"
            data-testid="freecell-new-deal"
            onClick={onNewDeal}
          >
            New deal
          </button>
        ) : (
          <span className={styles.dailyChip} data-testid="freecell-daily">
            Daily
          </span>
        )}
        {view.canFinish ? (
          <button
            type="button"
            className="btn-fat"
            data-testid="freecell-finish"
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
  cards,
  visible,
  ready,
  selection,
  legalTarget,
  hinted,
  onCard,
  onTarget,
}: {
  index: number;
  cards: readonly string[];
  visible: number;
  ready: boolean;
  selection: FreecellSelection | null;
  legalTarget: boolean;
  hinted: boolean;
  onCard: (card: string) => void;
  onTarget: () => void;
}) {
  const shown = cards.slice(0, visible);
  const zone = `tableau:${index}` as const;
  return (
    <div
      className={styles.tableauColumn}
      data-zone={zone}
      data-legal-target={legalTarget || undefined}
      data-hint={hinted || undefined}
    >
      <button
        type="button"
        className={styles.columnTarget}
        onClick={onTarget}
        disabled={!ready || !legalTarget}
        aria-label={`Tableau column ${index + 1}${legalTarget ? ', move selected cards here' : ''}`}
      />
      {shown.map((card, cardIndex) => (
        <div
          key={card}
          className={styles.tableauCard}
          data-card={card}
          data-zone-face={cardIndex === shown.length - 1 || undefined}
          data-selected={(selection?.from === zone && selection.card === card) || undefined}
          data-in-selected-run={
            selection?.from === zone && cards.indexOf(selection.card) <= cardIndex ? '' : undefined
          }
          style={{ ['--card-row' as string]: 0, ['--face-row' as string]: cardIndex }}
        >
          <PlayingCard
            card={card}
            onClick={() => onCard(card)}
            disabled={!ready}
            actionLabel="Select"
          />
        </div>
      ))}
      {cards.length === 0 ? (
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
  view: FreecellTableView;
  deal: FreecellDealPresentation;
  selection: FreecellSelection | null;
  targets: readonly FreecellZone[];
  hintText: string | null;
  elapsedMs: number;
  dailyResult: FreecellDailyResult | null;
  streak: number;
  busy: boolean;
}) {
  return {
    game: 'freecell',
    status: view.stage === 'won' ? 'won' : deal.dealing ? 'dealing' : 'ready',
    error: null,
    mode: view.mode,
    dailyKey: view.dailyKey,
    moves: view.moves,
    elapsedMs,
    layout: 'free cells top-left; foundations top-right; tableau columns 0..7 left-to-right',
    cells: view.cells,
    foundations: Object.fromEntries(
      SUITS.map((suit) => [
        suit,
        { count: view.foundations[suit].length, top: view.foundations[suit].at(-1) ?? null },
      ]),
    ),
    tableau: view.tableau.map((column, index) => ({
      column: index,
      cards: column,
    })),
    selection,
    legal: {
      targets,
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
    busy,
  };
}

function movableRunHeads(view: FreecellTableView): Array<{
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
    const up = view.tableau[from] ?? [];
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
