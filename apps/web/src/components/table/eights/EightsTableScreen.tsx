'use client';

import { useMemo, useRef, type CSSProperties } from 'react';
import { orderedHand, type FxEvent } from '@parlour/engine';
import {
  EIGHTS_SUITS,
  eightsCatalog,
  eightsHowToPlay,
  type EightsSuit,
} from '@parlour/game-eights';
import { AnimatePresence, motion } from 'motion/react';
import { getAvatar } from '@/lib/avatars';
import { EIGHTS_SFX_PACK } from '@/lib/audio/sfx';
import { useMatchTension } from '@/lib/audio/tension';
import { useMusicMood } from '@/stores/audio';
import { ArrivalProvider, useAdmittedHand } from '@/lib/table/arrival-presentation';
import { type DealPresentation, useDealPresentation } from '@/lib/table/deal-presentation';
import { type FxCue } from '@/lib/table/fx-motion';
import { EIGHTS_MATCH_PACE_MS } from '@/lib/eights/modes';
import {
  SUIT_GLYPH,
  SUIT_NAME,
  eightsAnnouncements,
  type EightsAnnouncement,
  type EightsSeatView,
  type EightsTableView,
} from '@/lib/eights/view';
import { discardRotation, useTableAudio } from '../fx-animation';
import { HandRail, HandRailCard } from '../HandRail';
import { PlayingCard } from '../PlayingCard';
import { StockStack } from '../StockStack';
import { TableMenu } from '../TableMenu';
import {
  dealStateAttr,
  OpponentFan,
  SeatNameplate,
  StockPile,
  TableActionRail,
  TableCardFlight,
  TableErrorScreen,
  TableFxLayer,
  TableHud,
  TableLoadingScreen,
  TablePiles,
  TablePlayfield,
  TableShell,
  TableTitlePill,
  TableTurnIndicator,
  TableTurnPop,
  useGameTextSurface,
  useTableMenu,
} from '../shell';
import { AvatarBadge } from '@/components/AvatarBadge';
import tableStyles from '@/styles/table.module.css';
import styles from '@/styles/eights.module.css';

/** Red suits take the deck's red; black suits take the felt's ink. */
const SUIT_INK: Record<EightsSuit, string> = {
  S: '#22303a',
  H: '#c14134',
  D: '#c14134',
  C: '#22303a',
};

export type EightsTableScreenProps = {
  view: EightsTableView | null;
  fx: readonly FxEvent[];
  fxKey: string | number;
  busy?: boolean;
  error?: string | null;
  onPlay?: (card: string) => void;
  onDraw?: () => void;
  onPass?: () => void;
  onChooseSuit?: (suit: EightsSuit) => void;
  /** Asks the table for the next deal from the round-end sheet. */
  onReady?: () => void;
  /** Fired only after the player confirms quitting from the shared table menu. */
  onQuit?: () => void;
};

export function EightsTableScreen(props: EightsTableScreenProps) {
  const { view, error } = props;
  const rootRef = useRef<HTMLElement>(null);
  const menu = useTableMenu(props.onQuit);
  const deal = useDealPresentation(props.fx, props.fxKey);
  useTableAudio(props.fx, props.fxKey, EIGHTS_SFX_PACK.id);

  const tense = useMatchTension({
    expectedMs: EIGHTS_MATCH_PACE_MS,
    running: Boolean(view) && view?.activeSeat !== null && !view?.roundEnd,
  });
  useMusicMood(tense ? 'tense' : null);

  const calls = useMemo(
    () => (!view || deal.dealing ? [] : eightsAnnouncements(props.fx, view.players)),
    [deal.dealing, props.fx, view],
  );

  useGameTextSurface(() => ({
    game: 'eights',
    status: error ? 'error' : view ? (deal.dealing ? 'dealing' : 'ready') : 'loading',
    error,
    localSeat: view?.localSeat ?? null,
    activeSeat: view?.activeSeat ?? null,
    roundNumber: view?.roundNumber ?? null,
    targetScore: view?.targetScore ?? null,
    activeSuit: view?.activeSuit ?? null,
    pendingDraw: view?.pendingDraw ?? null,
    decision: view?.decision ?? null,
    stockCount: view ? view.stockCount + deal.pendingStockCards : null,
    discardTop: view && deal.discardReady ? view.discard[0] : null,
    scores: view ? Object.fromEntries(view.players.map((p) => [p.seat, p.score])) : {},
    hand: view
      ? orderedHand(deal.visibleCards(view.hand, view.localSeat), eightsCatalog.handOrder)
      : [],
    playableCards: deal.dealing ? [] : (view?.legal.playCards ?? []),
    roundEnd: view?.roundEnd
      ? { reason: view.roundEnd.reason, winner: view.roundEnd.winner, points: view.roundEnd.points }
      : null,
  }));

  if (error) {
    return <TableErrorScreen headline="The table lost the thread." message={error} />;
  }

  if (!view) {
    return <TableLoadingScreen copy="Shuffling the pack…" />;
  }

  const localBusy = (props.busy ?? false) || deal.dealing;
  const compactRing = view.players.length > 4;

  return (
    <ArrivalProvider fx={props.fx} fxKey={props.fxKey} localSeat={view.localSeat}>
      <TableShell rootRef={rootRef} dealState={dealStateAttr(deal)}>
        <TableHud onOpenMenu={menu.open}>
          {/* Every opponent wears their score on their own plate; the local
              plate is hidden by the shared ring, so yours lives here. */}
          <TableTitlePill eyebrow="Crazy Eights" status={view.phaseLabel}>
            <span className={styles.scoreLine} data-testid="eights-score">
              You <b>{localScore(view)}</b>
              <small>→ {view.targetScore}</small>
            </span>
          </TableTitlePill>
        </TableHud>

        <TablePlayfield
          label="Crazy Eights table"
          feltMark="8"
          className={compactRing ? tableStyles.compactRing : undefined}
          seatCount={view.players.length}
        >
          {view.players.map((player) => (
            <Seat
              key={player.seat}
              player={player}
              position={tablePosition(player.seat, view.localSeat, view.players.length)}
              active={view.activeSeat === player.seat}
              displayCount={deal.visibleCount(player.seat, player.handCount)}
              stamp={calls.find((call) => call.seat === player.seat) ?? null}
            />
          ))}
          <TableBadges view={view} />
          <Piles view={view} busy={localBusy} onDraw={props.onDraw} deal={deal} />
          <LocalHand view={view} busy={localBusy} onPlay={props.onPlay} deal={deal} />
          <TableFxLayer
            fx={props.fx}
            fxKey={props.fxKey}
            rootRef={rootRef}
            renderCue={(cue) => <Cue cue={cue} localSeat={view.localSeat} />}
          />
          <Announcer calls={calls} fxKey={props.fxKey} />
          {view.decision === 'choose-suit' && !localBusy && (
            <SuitChooser onChooseSuit={props.onChooseSuit} />
          )}
          {view.roundEnd && !view.matchOver && (
            <RoundEndSheet
              view={view}
              readySent={!view.roundEnd.waitingFor.includes(view.localSeat)}
              onReady={props.onReady}
            />
          )}
        </TablePlayfield>

        <TableActionRail className={styles.actionRail}>
          <AnimatePresence initial={false}>
            {view.legal.pass && !localBusy && (
              <motion.button
                key="pass"
                type="button"
                data-testid="eights-pass"
                className="btn-fat btn-fat--ghost"
                initial={{ opacity: 0, scale: 0.7, y: 12 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.7, y: 12 }}
                transition={{ duration: 0.2 }}
                onClick={props.onPass}
              >
                {view.drawnCard ? 'Keep it' : 'Nothing to play'}
              </motion.button>
            )}
          </AnimatePresence>
        </TableActionRail>

        <TableMenu
          open={menu.isOpen}
          onClose={menu.close}
          howToPlay={{ doc: eightsHowToPlay, title: 'Crazy Eights', subtitle: view.phaseLabel }}
          onQuit={menu.quit}
        />
      </TableShell>
    </ArrivalProvider>
  );
}

/** Viewer-relative table geometry; engine seat ids stay untouched for moves and fx. */
const RING: Readonly<Record<number, readonly number[]>> = {
  2: [2],
  3: [1, 3],
  4: [1, 2, 3],
  5: [1, 5, 6, 3],
  6: [1, 4, 5, 6, 3],
};

export function tablePosition(seat: number, localSeat: number, playerCount: number): number {
  const offset = (seat - localSeat + playerCount) % playerCount;
  if (offset === 0) return 0;
  return RING[playerCount]?.[offset - 1] ?? offset;
}

function localScore(view: EightsTableView): number {
  return view.players.find((player) => player.isLocal)?.score ?? 0;
}

function Seat({
  player,
  position,
  active,
  displayCount,
  stamp,
}: {
  player: EightsSeatView;
  position: number;
  active: boolean;
  displayCount: number;
  stamp: EightsAnnouncement | null;
}) {
  const avatar = getAvatar(player.avatarId);
  const style = { '--seat-accent': avatar.accent, '--seat-shade': avatar.shade } as CSSProperties;

  return (
    <motion.div
      layout
      data-seat={player.seat}
      data-table-position={position}
      className={`${tableStyles.seat} ${tableStyles[`seat${position}`] ?? ''} ${
        active ? tableStyles.seatActive : ''
      }`}
      style={style}
      animate={active ? { scale: [1, 1.06, 1.02] } : { scale: 1 }}
      transition={{ duration: 0.24, ease: [0.34, 1.56, 0.64, 1] }}
    >
      {!player.isLocal && (
        <OpponentFan
          count={displayCount}
          max={5}
          spread={22}
          renderCard={({ rotation }) => <PlayingCard compact faceDown rotation={rotation} />}
        />
      )}
      <AvatarBadge
        avatarId={player.avatarId}
        size="clamp(3rem, 5.4vw, 4.6rem)"
        className={tableStyles.avatar}
      />
      <SeatNameplate name={player.name} isBot={player.isBot} />
      <span className={styles.cardCount} data-low={displayCount <= 2}>
        {displayCount} card{displayCount === 1 ? '' : 's'} · <b>{player.score}</b>
        {player.dealer && <i className={styles.dealerPip}>deal</i>}
      </span>
      <AnimatePresence>
        {stamp && (
          <motion.span
            key={stamp.id}
            className={styles.seatStamp}
            data-stamp={stamp.kind}
            initial={{ opacity: 0, scale: 1.5, rotate: -12 }}
            animate={{ opacity: 1, scale: 1, rotate: -7 }}
            exit={{ opacity: 0, scale: 0.8 }}
            transition={{ duration: 0.26, ease: [0.34, 1.56, 0.64, 1], delay: stamp.atMs / 1000 }}
          >
            {stamp.text}
          </motion.span>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

/**
 * What the pile is asking for. The top card is not the answer after an eight,
 * so the suit is stated rather than left to be read off the face.
 */
function TableBadges({ view }: { view: EightsTableView }) {
  return (
    <div className={styles.tableBadges} data-table-badges>
      <motion.span
        key={view.direction}
        className={styles.directionChip}
        data-direction={view.direction}
        aria-label={view.direction === 1 ? 'Play moves left' : 'Play moves right'}
        initial={{ rotate: -180, scale: 0.6 }}
        animate={{ rotate: 0, scale: 1 }}
        transition={{ duration: 0.36, ease: [0.34, 1.56, 0.64, 1] }}
      >
        <i aria-hidden="true">{view.direction === 1 ? '↻' : '↺'}</i>
        {view.direction === 1 ? 'left' : 'right'}
      </motion.span>
      <span
        className={styles.suitChip}
        data-testid="active-suit"
        style={{ '--eights-suit': SUIT_INK[view.activeSuit] } as CSSProperties}
      >
        <i aria-hidden="true">{SUIT_GLYPH[view.activeSuit]}</i>
        {SUIT_NAME[view.activeSuit]}
      </span>
      {view.pendingDraw > 0 && <span className={styles.drawChip}>+{view.pendingDraw}</span>}
    </div>
  );
}

function Piles({
  view,
  busy,
  onDraw,
  deal,
}: {
  view: EightsTableView;
  busy: boolean;
  onDraw?: () => void;
  deal: DealPresentation;
}) {
  const visibleDiscard = [...(deal.discardReady ? view.discard : [])].reverse();
  const stockCount = view.stockCount + deal.pendingStockCards;
  return (
    <TablePiles localTurn={!busy} centerPiles>
      {!busy && <TableTurnIndicator />}
      <StockPile
        count={stockCount}
        className={styles.stockPile}
        canDraw={view.legal.draw && !busy}
        disabled={!view.legal.draw || busy}
        onClick={onDraw}
        card={
          <StockStack count={stockCount}>
            <PlayingCard faceDown />
          </StockStack>
        }
      >
        {view.legal.draw && !busy && (
          <span className={styles.drawHint} aria-hidden="true">
            Tap to draw
          </span>
        )}
      </StockPile>
      <div
        data-zone="discard"
        className={`${tableStyles.pileButton} ${tableStyles.discardPile}`}
        aria-label="Discard pile"
      >
        {visibleDiscard.map((card, index) => (
          <PlayingCard
            key={`${card}:${index}`}
            card={card}
            rotation={discardRotation(card, index)}
          />
        ))}
      </div>
    </TablePiles>
  );
}

function LocalHand({
  view,
  busy,
  onPlay,
  deal,
}: {
  view: EightsTableView;
  busy: boolean;
  onPlay?: (card: string) => void;
  deal: DealPresentation;
}) {
  const plannedHand = orderedHand(
    deal.visibleCards(view.hand, view.localSeat),
    eightsCatalog.handOrder,
  );
  const visibleHand = useAdmittedHand(plannedHand);
  const canChoose = view.legal.playCards.length > 0 && !busy;
  const showLegality = !busy && view.decision === 'play';
  return (
    <HandRail
      count={visibleHand.length}
      zone={`hand:${view.localSeat}`}
      label="Your hand"
      dealState={dealStateAttr(deal)}
      fanPlan={plannedHand}
      liftCard={view.drawnCard}
    >
      <AnimatePresence initial={false} mode="popLayout">
        {visibleHand.map((card, index) => {
          const playable = view.legal.playCards.includes(card);
          return (
            <HandRailCard
              key={card}
              cardId={card}
              index={index}
              count={visibleHand.length}
              playable={showLegality ? playable : undefined}
              justDrawn={card === view.drawnCard}
            >
              <PlayingCard
                card={card}
                actionLabel="Play"
                disabled={!canChoose || !playable}
                onClick={() => onPlay?.(card)}
              />
            </HandRailCard>
          );
        })}
      </AnimatePresence>
    </HandRail>
  );
}

/** The eight is down; the table waits on the suit it is asking for. */
function SuitChooser({ onChooseSuit }: { onChooseSuit?: (suit: EightsSuit) => void }) {
  return (
    <div className={styles.chooser} role="dialog" aria-label="Name a suit">
      <motion.div
        className={`${styles.chooserPanel} panel-soft`}
        data-testid="suit-chooser"
        initial={{ opacity: 0, scale: 0.8, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.28, ease: [0.34, 1.56, 0.64, 1] }}
      >
        <strong className="font-display text-lg font-extrabold text-hearth-50">
          Your eight — name a suit
        </strong>
        <div className={styles.suitRow}>
          {EIGHTS_SUITS.map((suit) => (
            <button
              key={suit}
              type="button"
              className={styles.suitButton}
              data-suit={suit}
              style={{ '--eights-suit': SUIT_INK[suit] } as CSSProperties}
              aria-label={`Call ${SUIT_NAME[suit]}`}
              onClick={() => onChooseSuit?.(suit)}
            >
              <span aria-hidden="true">{SUIT_GLYPH[suit]}</span>
            </button>
          ))}
        </div>
      </motion.div>
    </div>
  );
}

/**
 * The beat between deals. Everyone's hand is priced out here — this is the only
 * place the cost of sitting on an eight is ever visible.
 */
function RoundEndSheet({
  view,
  readySent,
  onReady,
}: {
  view: EightsTableView;
  readySent: boolean;
  onReady?: () => void;
}) {
  const end = view.roundEnd!;
  return (
    <div className={styles.roundEnd} data-testid="round-end-sheet">
      <motion.div
        className={`${styles.sheet} panel-soft`}
        initial={{ opacity: 0, y: 18, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.3, ease: [0.34, 1.56, 0.64, 1] }}
      >
        <div className={styles.stampRow}>
          <span className={styles.stamp} data-reason={end.reason}>
            {end.reason === 'shed' ? `${end.winnerName} went out` : 'Table blocked'}
          </span>
          <span className={styles.points}>+{end.points}</span>
        </div>

        <div className={styles.scoreTable}>
          {view.players.map((player) => (
            <div
              key={player.seat}
              className={styles.scoreRow}
              data-winner={player.seat === end.winner}
            >
              <span>{player.isLocal ? 'You' : player.name}</span>
              <small>
                {end.handCounts[player.seat] ?? 0} left · {end.handValues[player.seat] ?? 0} pts
                held
              </small>
              <b>{player.score}</b>
            </div>
          ))}
        </div>

        <div className={styles.readyRow}>
          <span className={styles.waiting}>
            {readySent
              ? end.waitingFor.length > 0
                ? `Waiting for ${end.waitingFor.length}`
                : 'Dealing…'
              : `First to ${view.targetScore}`}
          </span>
          <button
            type="button"
            className="btn-fat"
            data-testid="eights-next-round"
            disabled={readySent || !view.legal.ready}
            onClick={onReady}
          >
            {readySent ? 'Ready ✓' : 'Deal the next round'}
          </button>
        </div>
      </motion.div>
    </div>
  );
}

function Announcer({
  calls,
  fxKey,
}: {
  calls: readonly EightsAnnouncement[];
  fxKey: string | number;
}) {
  return (
    <div className={styles.announcer} aria-live="polite" data-testid="eights-announcer">
      <AnimatePresence mode="popLayout">
        {calls.map((call, index) => (
          <motion.div
            key={`${fxKey}:${call.id}`}
            className={styles.announcement}
            data-announcement={call.kind}
            initial={{ opacity: 0, scale: 1.35, y: -8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 10 }}
            transition={{
              duration: 0.3,
              ease: [0.34, 1.56, 0.64, 1],
              delay: call.atMs / 1000 + index * 0.12,
            }}
          >
            <strong>{call.text}</strong>
            {call.detail && <small>{call.detail}</small>}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  );
}

function Cue({ cue, localSeat }: { cue: FxCue; localSeat: number }) {
  if (cue.type === 'deal' || cue.type === 'flip' || cue.type === 'draw' || cue.type === 'discard') {
    const faceDown =
      (cue.type === 'deal' && cue.to !== `hand:${localSeat}` && cue.to !== 'discard') ||
      (cue.type === 'draw' && cue.to !== `hand:${localSeat}`);
    return (
      <TableCardFlight cueId={cue.id}>
        <PlayingCard card={cue.card} faceDown={faceDown} />
      </TableCardFlight>
    );
  }
  if (cue.type === 'turn') {
    return <TableTurnPop cueId={cue.id} seat={cue.seat} />;
  }
  return null;
}
