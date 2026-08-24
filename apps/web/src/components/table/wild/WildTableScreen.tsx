'use client';

import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { orderedHand, type FxEvent } from '@parlour/engine';
import {
  WILDPILE_COLORS,
  wildpileCatalog,
  wildpileHowToPlay,
  type WildpileColor,
} from '@parlour/game-wildpile';
import { AnimatePresence, motion } from 'motion/react';
import { getAvatar } from '@/lib/avatars';
import { WILDPILE_SFX_PACK } from '@/lib/audio/sfx';
import { useMatchTension } from '@/lib/audio/tension';
import { useMusicMood } from '@/stores/audio';
import { ArrivalProvider, useAdmittedHand } from '@/lib/table/arrival-presentation';
import { type DealPresentation, useDealPresentation } from '@/lib/table/deal-presentation';
import { type FxCue } from '@/lib/table/fx-motion';
import {
  wildAnnouncements,
  type WildAnnouncement,
  type WildSeatView,
  type WildTableView,
} from '@/lib/wild/view';
import { useWildPickupCount, wildPickup, type WildPickup } from '@/lib/wild/pickup';
import { WILD_DROP_EFFECTS } from '@/lib/wild/drop-effects';
import { CardDropFx } from '../CardDropFx';
import { discardRotation, useTableAudio } from '../fx-animation';
import { HandRail, HandRailCard } from '../HandRail';
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
import { WildCard } from './WildCard';
import { AvatarBadge } from '@/components/AvatarBadge';
import tableStyles from '@/styles/table.module.css';
import wildStyles from '@/styles/wild.module.css';

const COLOR_SWATCH: Record<WildpileColor, string> = {
  red: '#c94b40',
  yellow: '#e5ad3a',
  green: '#54a06e',
  blue: '#4595b1',
};

export type WildTableScreenProps = {
  view: WildTableView | null;
  fx: readonly FxEvent[];
  fxKey: string | number;
  busy?: boolean;
  error?: string | null;
  onPlay?: (card: string) => void;
  onDraw?: () => void;
  onChooseColor?: (color: WildpileColor) => void;
  onDeclineJump?: () => void;
  onCallLastCard?: () => void;
  onChooseTarget?: (seat: number) => void;
  onPass?: () => void;
  onChallengeDrawFour?: () => void;
  /** Authority deadline for the configurable match clock. */
  matchEndsAt?: number;
  /** Duration and replay-derived key for the current seat's visible decision clock. */
  turnDurationMs?: number;
  turnClockKey?: string | number;
  /** Fired only after the player confirms quitting from the shared table menu. */
  onQuit?: () => void;
};

export function WildTableScreen(props: WildTableScreenProps) {
  const { view, error } = props;
  const rootRef = useRef<HTMLElement>(null);
  const menu = useTableMenu(props.onQuit);
  const deal = useDealPresentation(props.fx, props.fxKey);
  useTableAudio(props.fx, props.fxKey, WILDPILE_SFX_PACK.id);

  // Pickups are counted out card by card so a stacked penalty reads as it
  // arrives instead of appearing in the hand all at once.
  const pickup = useMemo(
    () => (deal.dealing ? null : wildPickup(props.fx)),
    [deal.dealing, props.fx],
  );
  const pickupCount = useWildPickupCount(pickup, props.fxKey);

  // Real Wild tables use the authority deadline. The fallback keeps isolated
  // story/tests musical even when they render the screen without a transport.
  const fallbackTense = useMatchTension({
    expectedMs: 300_000,
    running: Boolean(view) && view?.activeSeat !== null,
  });
  // The clock used to tick a state field on this component once a second,
  // which re-rendered the entire table — every seat, the whole fan and every
  // motion subtree — purely to redraw two digits. Only the boolean the table
  // itself reacts to lives up here now, and it flips once; the digits are
  // owned by the leaves that show them.
  const finalMinute = useFinalMinute(props.matchEndsAt);
  const tense =
    props.matchEndsAt === undefined
      ? fallbackTense
      : Boolean(view?.activeSeat !== null && finalMinute);
  useMusicMood(tense ? 'tense' : null);

  const calls = useMemo(
    () => (!view || deal.dealing ? [] : wildAnnouncements(props.fx, view.players)),
    [deal.dealing, props.fx, view],
  );

  useGameTextSurface(() => ({
    game: 'wild',
    status: error ? 'error' : view ? (deal.dealing ? 'dealing' : 'ready') : 'loading',
    error,
    localSeat: view?.localSeat ?? null,
    activeSeat: view?.activeSeat ?? null,
    decision: view?.decision ?? null,
    // Read when the surface is asked for, not kept in state.
    matchRemainingSeconds:
      props.matchEndsAt === undefined
        ? null
        : Math.ceil(Math.max(0, props.matchEndsAt - Date.now()) / 1_000),
    turnDurationSeconds: props.turnDurationMs === undefined ? null : props.turnDurationMs / 1_000,
    stockCount: view ? view.stockCount + deal.pendingStockCards : null,
    discardTop: view && deal.discardReady ? view.discard.at(-1) : null,
    hand: view
      ? orderedHand(deal.visibleCards(view.hand, view.localSeat), wildpileCatalog.handOrder)
      : [],
    playableCards: deal.dealing ? [] : (view?.legal.playCards ?? []),
  }));

  if (error) {
    return <TableErrorScreen headline="The table lost the thread." message={error} />;
  }

  if (!view) {
    return <TableLoadingScreen copy="Shuffling the pile…" />;
  }

  const localBusy = (props.busy ?? false) || deal.dealing;

  return (
    <ArrivalProvider fx={props.fx} fxKey={props.fxKey} localSeat={view.localSeat}>
      <TableShell rootRef={rootRef} dealState={dealStateAttr(deal)}>
        <TableHud onOpenMenu={menu.open}>
          <TableTitlePill eyebrow="Wild" status={view.phaseLabel} />
          {props.matchEndsAt !== undefined && <MatchClock endsAt={props.matchEndsAt} />}
        </TableHud>

        <TablePlayfield label="Wild table" feltMark="W">
          {view.players.map((player) => (
            <Seat
              key={player.seat}
              player={player}
              position={tablePosition(player.seat, view.localSeat, view.players.length)}
              active={view.activeSeat === player.seat}
              displayCount={deal.visibleCount(player.seat, player.handCount)}
              stamp={seatStamp(calls, player.seat)}
            />
          ))}
          <TableBadges view={view} />
          {finalMinute && props.matchEndsAt !== undefined && (
            <LiveStandings players={view.players} endsAt={props.matchEndsAt} />
          )}
          <Piles view={view} busy={localBusy} onDraw={props.onDraw} deal={deal} />
          {props.turnDurationMs !== undefined && view.activeSeat !== null && (
            <TurnClock
              key={props.turnClockKey}
              durationMs={props.turnDurationMs}
              mine={view.activeSeat === view.localSeat}
            />
          )}
          <LocalHand view={view} busy={localBusy} onPlay={props.onPlay} deal={deal} />
          <TableFxLayer
            fx={props.fx}
            fxKey={props.fxKey}
            rootRef={rootRef}
            renderCue={(cue) => <Cue cue={cue} localSeat={view.localSeat} />}
          />
          <CardDropFx fx={props.fx} fxKey={props.fxKey} packId={WILD_DROP_EFFECTS.id} />
          <PickupCounter pickup={pickup} count={pickupCount} players={view.players} />
          <Announcer calls={calls} fxKey={props.fxKey} />
          {view.decision === 'jump-in' && !localBusy && (
            <div className={`${wildStyles.jumpBanner} panel-soft`} role="alertdialog">
              <strong>Exact match — jump in?</strong>
              <button
                type="button"
                className="btn-fat btn-fat--ghost"
                onClick={props.onDeclineJump}
              >
                Pass
              </button>
            </div>
          )}
          {view.decision === 'choose-color' && !localBusy && (
            <ColorChooser onChooseColor={props.onChooseColor} />
          )}
          {view.decision === 'choose-target' && !localBusy && (
            <SwapChooser view={view} onChooseTarget={props.onChooseTarget} />
          )}
          {view.challenge && view.legal.challengeDrawFour && !localBusy && (
            <ChallengePrompt
              challenge={view.challenge}
              onChallenge={props.onChallengeDrawFour}
              onAccept={props.onDraw}
            />
          )}
        </TablePlayfield>

        {/* No draw button: the stock pile is the draw, and forced pickups resolve
          themselves. The only rail action left is protecting your last card. */}
        <TableActionRail className={wildStyles.actionRail}>
          <AnimatePresence initial={false}>
            {view.legal.pass && !localBusy && (
              <motion.button
                key="pass"
                type="button"
                data-testid="pass-drawn-card"
                className="btn-fat btn-fat--ghost"
                initial={{ opacity: 0, scale: 0.7, y: 12 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.7, y: 12 }}
                transition={{ duration: 0.2 }}
                onClick={props.onPass}
              >
                Keep it
              </motion.button>
            )}
            {view.legal.callLastCard && !localBusy && (
              <motion.button
                key="call-last-card"
                type="button"
                data-testid="call-last-card"
                className={`btn-fat ${wildStyles.lastCardButton}`}
                initial={{ opacity: 0, scale: 0.7, y: 12 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.7, y: 12 }}
                transition={{ duration: 0.22, ease: [0.34, 1.56, 0.64, 1] }}
                onClick={props.onCallLastCard}
              >
                Last card!
              </motion.button>
            )}
            {view.lastCardArmed && (
              <motion.span
                key="last-card-armed"
                className={wildStyles.lastCardArmed}
                data-testid="last-card-armed"
                initial={{ opacity: 0, scale: 0.7 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.7 }}
              >
                Protected
              </motion.span>
            )}
          </AnimatePresence>
        </TableActionRail>

        <TableMenu
          open={menu.isOpen}
          onClose={menu.close}
          howToPlay={{ doc: wildpileHowToPlay, title: 'Wild', subtitle: view.phaseLabel }}
          onQuit={menu.quit}
        />
      </TableShell>
    </ArrivalProvider>
  );
}

/**
 * One second of the match clock, without a re-render of anything above it.
 * Returns whole seconds, so it settles on the value it will actually show.
 */
function useSecondsLeft(endsAt: number | undefined): number {
  const [seconds, setSeconds] = useState(() =>
    endsAt === undefined ? 0 : Math.ceil(Math.max(0, endsAt - Date.now()) / 1_000),
  );

  useEffect(() => {
    if (endsAt === undefined) return;
    const sync = () => setSeconds(Math.ceil(Math.max(0, endsAt - Date.now()) / 1_000));
    sync();
    const timer = window.setInterval(sync, 1_000);
    return () => window.clearInterval(timer);
  }, [endsAt]);

  return seconds;
}

/**
 * The final-minute flip. A boolean that changes once does not need polling, so
 * it is scheduled for the moment it becomes true instead.
 */
function useFinalMinute(endsAt: number | undefined): boolean {
  const [reached, setReached] = useState(
    () => endsAt !== undefined && endsAt - Date.now() <= 60_000,
  );

  useEffect(() => {
    if (endsAt === undefined) {
      setReached(false);
      return;
    }
    const untilFinalMinute = endsAt - 60_000 - Date.now();
    if (untilFinalMinute <= 0) {
      setReached(true);
      return;
    }
    setReached(false);
    const timer = window.setTimeout(() => setReached(true), untilFinalMinute);
    return () => window.clearTimeout(timer);
  }, [endsAt]);

  return reached;
}

function LiveStandings({ players, endsAt }: { players: readonly WildSeatView[]; endsAt: number }) {
  const ordered = [...players].sort(
    (left, right) => left.handCount - right.handCount || left.seat - right.seat,
  );
  const seconds = useSecondsLeft(endsAt);
  return (
    <aside className={`${wildStyles.liveStandings} panel-soft`} aria-label="Live standings">
      <strong>{seconds}s left</strong>
      <ol>
        {ordered.map((player, index) => (
          <li key={player.seat} data-local={player.isLocal || undefined}>
            <span>{ordinal(index + 1)}</span>
            <b>{player.isLocal ? 'You' : player.name}</b>
            <small>{player.handCount} cards</small>
          </li>
        ))}
      </ol>
    </aside>
  );
}

function MatchClock({ endsAt }: { endsAt: number }) {
  const totalSeconds = useSecondsLeft(endsAt);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return (
    <div className={`${wildStyles.matchClock} pill-soft`} aria-label="Game clock">
      <span>Game</span>
      <strong>
        {minutes}:{String(seconds).padStart(2, '0')}
      </strong>
    </div>
  );
}

/**
 * The turn clock ran a 100ms interval and re-rendered ten times a second for
 * the whole of every turn — the single largest source of render churn on an
 * otherwise idle table. The ring is a linear sweep over a known duration, so
 * CSS animates it with no JavaScript at all, and the digit only changes once a
 * second, so that is how often it now ticks.
 */
function TurnClock({ durationMs, mine }: { durationMs: number; mine: boolean }) {
  const [remainingSeconds, setRemainingSeconds] = useState(() =>
    Math.max(0, Math.ceil(durationMs / 1_000)),
  );

  useEffect(() => {
    const endsAt = Date.now() + durationMs;
    const sync = () => setRemainingSeconds(Math.max(0, Math.ceil((endsAt - Date.now()) / 1_000)));
    sync();
    const timer = window.setInterval(sync, 1_000);
    return () => window.clearInterval(timer);
  }, [durationMs]);

  return (
    <div
      className={wildStyles.turnClock}
      aria-label="Turn clock"
      data-testid="turn-clock"
      data-mine={mine || undefined}
      data-warning={remainingSeconds <= 5 || undefined}
      style={{ '--turn-duration': `${durationMs}ms` } as CSSProperties}
    >
      <svg viewBox="0 0 48 48" aria-hidden="true">
        <circle className={wildStyles.turnClockTrack} cx="24" cy="24" r="20" pathLength="1" />
        <circle
          className={wildStyles.turnClockProgress}
          data-testid="turn-clock-progress"
          cx="24"
          cy="24"
          r="20"
          pathLength="1"
        />
      </svg>
      <span>{mine ? 'You' : 'Turn'}</span>
      <strong>{remainingSeconds}</strong>
    </div>
  );
}

function ordinal(place: number): string {
  if (place === 1) return '1st';
  if (place === 2) return '2nd';
  if (place === 3) return '3rd';
  return `${place}th`;
}

/** The loudest call landing on a seat, for the stamp pinned over their avatar. */
function seatStamp(calls: readonly WildAnnouncement[], seat: number): WildAnnouncement | null {
  return calls.find((call) => call.seat === seat) ?? null;
}

function Seat({
  player,
  position,
  active,
  displayCount,
  stamp,
}: {
  player: WildSeatView;
  position: number;
  active: boolean;
  displayCount: number;
  stamp: WildAnnouncement | null;
}) {
  const avatar = getAvatar(player.avatarId);
  const style = { '--seat-accent': avatar.accent, '--seat-shade': avatar.shade } as CSSProperties;

  return (
    <motion.div
      layout
      data-seat={player.seat}
      data-table-position={position}
      className={`${tableStyles.seat} ${tableStyles[`seat${position}`]} ${active ? tableStyles.seatActive : ''}`}
      style={style}
      animate={active ? { scale: [1, 1.06, 1.02] } : { scale: 1 }}
      transition={{ duration: 0.24, ease: [0.34, 1.56, 0.64, 1] }}
    >
      {!player.isLocal && (
        <OpponentFan
          count={displayCount}
          max={5}
          spread={22}
          renderCard={({ rotation }) => <WildCard compact faceDown rotation={rotation} />}
        />
      )}
      <AvatarBadge
        avatarId={player.avatarId}
        size="clamp(3.2rem, 5.6vw, 4.8rem)"
        className={tableStyles.avatar}
      />
      <SeatNameplate name={player.name} isBot={player.isBot} />
      <span className={wildStyles.cardCount} data-armed={player.lastCardArmed || undefined}>
        {displayCount} card{displayCount === 1 ? '' : 's'}
        {player.lastCardArmed && <i aria-hidden="true" />}
      </span>
      <AnimatePresence>
        {stamp && (
          <motion.span
            key={stamp.id}
            className={wildStyles.seatStamp}
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

/** Viewer-relative table geometry; engine seat ids stay untouched for moves and FX. */
function tablePosition(seat: number, localSeat: number, playerCount: number): number {
  const offset = (seat - localSeat + playerCount) % playerCount;
  if (offset === 0) return 0;
  if (playerCount === 2) return 2;
  if (playerCount === 3) return offset === 1 ? 1 : 3;
  return offset;
}

/**
 * Center-table calls. Action cards are the moments a Wild hand turns on, so
 * every one of them gets a readable stamp rather than only a sound cue.
 */
function Announcer({
  calls,
  fxKey,
}: {
  calls: readonly WildAnnouncement[];
  fxKey: string | number;
}) {
  return (
    <div className={wildStyles.announcer} aria-live="polite" data-testid="wild-announcer">
      <AnimatePresence mode="popLayout">
        {calls.map((call, index) => (
          <motion.div
            key={`${fxKey}:${call.id}`}
            className={wildStyles.announcement}
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

function TableBadges({ view }: { view: WildTableView }) {
  return (
    <div className={wildStyles.tableBadges} data-table-badges>
      {/* Keyed on direction so a reverse visibly spins the badge around. */}
      <motion.span
        key={view.direction}
        className={wildStyles.directionChip}
        data-direction={view.direction}
        aria-label={view.direction === 1 ? 'Play moves left' : 'Play moves right'}
        initial={{ rotate: -180, scale: 0.6 }}
        animate={{ rotate: 0, scale: 1 }}
        transition={{ duration: 0.36, ease: [0.34, 1.56, 0.64, 1] }}
      >
        <i aria-hidden="true">{view.direction === 1 ? '↻' : '↺'}</i>
        {view.direction === 1 ? 'left' : 'right'}
      </motion.span>
      {view.activeColor && (
        <span
          className={wildStyles.colorChip}
          style={{ '--wild-color': COLOR_SWATCH[view.activeColor] } as CSSProperties}
        >
          <i aria-hidden="true" />
          {view.activeColor}
        </span>
      )}
      {view.pendingDraw > 0 && <span className={wildStyles.drawChip}>+{view.pendingDraw}</span>}
    </div>
  );
}

function Piles({
  view,
  busy,
  onDraw,
  deal,
}: {
  view: WildTableView;
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
        className={wildStyles.stockPile}
        canDraw={view.legal.draw && !busy}
        disabled={!view.legal.draw || busy}
        onClick={onDraw}
        card={
          <StockStack count={stockCount}>
            <WildCard faceDown />
          </StockStack>
        }
      >
        {view.legal.draw && !busy && (
          <span className={wildStyles.drawHint} aria-hidden="true">
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
          <WildCard key={`${card}:${index}`} card={card} rotation={discardRotation(card, index)} />
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
  view: WildTableView;
  busy: boolean;
  onPlay?: (card: string) => void;
  deal: DealPresentation;
}) {
  const plannedHand = orderedHand(
    deal.visibleCards(view.hand, view.localSeat),
    wildpileCatalog.handOrder,
  );
  const visibleHand = useAdmittedHand(plannedHand);
  const canChoose = view.legal.playCards.length > 0 && !busy;
  const showLegality = !busy && view.decision !== null && view.decision !== 'choose-color';
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
              <WildCard
                card={card}
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

/**
 * A quartered wheel rather than a row of chips: one round target split into
 * four wedges, so the choice reads as the deck's own color ring.
 */
function ColorChooser({ onChooseColor }: { onChooseColor?: (color: WildpileColor) => void }) {
  return (
    <div className={wildStyles.chooser} role="dialog" aria-label="Choose a color">
      <motion.div
        className={wildStyles.wheel}
        data-testid="color-wheel"
        initial={{ opacity: 0, scale: 0.72, rotate: -25 }}
        animate={{ opacity: 1, scale: 1, rotate: 0 }}
        transition={{ duration: 0.32, ease: [0.34, 1.56, 0.64, 1] }}
      >
        {WILDPILE_COLORS.map((color, index) => (
          <button
            key={color}
            type="button"
            className={wildStyles.wedge}
            data-wedge={index}
            data-color={color}
            style={{ '--wild-color': COLOR_SWATCH[color] } as CSSProperties}
            aria-label={`Choose ${color}`}
            onClick={() => onChooseColor?.(color)}
          />
        ))}
        <span className={wildStyles.wheelHub} aria-hidden="true">
          Call it
        </span>
      </motion.div>
    </div>
  );
}

/**
 * Counts a penalty out loud. Big stacked pickups used to arrive as a silent
 * jump in someone's card count; this holds the table on the number while the
 * cards fly, so a +10 is something that happens *to* you rather than to the HUD.
 */
function PickupCounter({
  pickup,
  count,
  players,
}: {
  pickup: WildPickup | null;
  count: { taken: number; left: number } | null;
  players: readonly WildSeatView[];
}) {
  const target = players.find((player) => player.seat === pickup?.seat);
  const mine = target?.isLocal ?? false;

  return (
    <div
      className={wildStyles.pickupLayer}
      aria-live="assertive"
      data-testid="wild-pickup"
      data-active={count ? 'true' : 'false'}
      data-taken={count?.taken}
    >
      <AnimatePresence>
        {pickup && count && (
          <motion.div
            key={`${pickup.seat}:${pickup.amount}`}
            className={wildStyles.pickup}
            data-reason={pickup.reason}
            data-mine={mine || undefined}
            initial={{ opacity: 0, scale: 0.6, y: -10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.8, y: 8 }}
            transition={{ duration: 0.24, ease: [0.34, 1.56, 0.64, 1] }}
          >
            <span className={wildStyles.pickupWho}>
              {mine ? 'You pick up' : `${target?.name ?? 'They'} pick up`}
            </span>
            {/* Keyed on the running total so each card that lands punches the
                number rather than quietly replacing it. */}
            <motion.strong
              key={count.taken}
              className={wildStyles.pickupCount}
              initial={{ scale: 1.6, opacity: 0.4 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ duration: 0.2, ease: [0.34, 1.56, 0.64, 1] }}
            >
              +{pickup.amount}
            </motion.strong>
            <span className={wildStyles.pickupTrack} aria-hidden="true">
              {Array.from({ length: pickup.amount }, (_, index) => (
                <i key={index} data-landed={index < count.taken || undefined} />
              ))}
            </span>
            <small className={wildStyles.pickupProgress}>
              {count.left > 0 ? `${count.taken} of ${pickup.amount}` : PICKUP_DONE[pickup.reason]}
            </small>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

const PICKUP_DONE: Record<WildPickup['reason'], string> = {
  penalty: 'Turn lost',
  caught: 'No call made',
  challenge: 'Challenge settled',
};

/** The Draw Four window: take the pile, or say they had the colour all along. */
function ChallengePrompt({
  challenge,
  onChallenge,
  onAccept,
}: {
  challenge: NonNullable<WildTableView['challenge']>;
  onChallenge?: () => void;
  onAccept?: () => void;
}) {
  return (
    <motion.div
      className={`${wildStyles.challengePrompt} panel-soft`}
      role="alertdialog"
      aria-label="Challenge the Draw Four?"
      data-testid="challenge-prompt"
      initial={{ opacity: 0, y: 16, scale: 0.94 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.26, ease: [0.34, 1.56, 0.64, 1] }}
    >
      <strong>{challenge.accusedName} played a Draw Four</strong>
      <small>
        They can only play it holding nothing in the old colour. Call it and they take{' '}
        {challenge.amount} — be wrong and you take {challenge.penalty}.
      </small>
      <div className={wildStyles.challengeActions}>
        <button
          type="button"
          className={`btn-fat ${wildStyles.challengeButton}`}
          data-testid="challenge-draw-four"
          onClick={onChallenge}
        >
          Call the bluff
        </button>
        <button
          type="button"
          className="btn-fat btn-fat--ghost"
          data-testid="accept-draw-four"
          onClick={onAccept}
        >
          Take +{challenge.amount}
        </button>
      </div>
    </motion.div>
  );
}

/** Wild Swap Hands and the seven under 7-0 both land here. */
function SwapChooser({
  view,
  onChooseTarget,
}: {
  view: WildTableView;
  onChooseTarget?: (seat: number) => void;
}) {
  const targets = view.players.filter((player) => view.legal.swapTargets.includes(player.seat));
  return (
    <div className={wildStyles.chooser} role="dialog" aria-label="Choose a hand to take">
      <div className={`${wildStyles.chooserPanel} panel-soft`} data-testid="swap-chooser">
        <strong className="font-display text-lg font-extrabold text-hearth-50">
          Take whose hand?
        </strong>
        <div className={wildStyles.swapRow}>
          {targets.map((player) => (
            <button
              key={player.seat}
              type="button"
              className={wildStyles.swapTarget}
              aria-label={`Swap hands with ${player.name}, ${player.handCount} cards`}
              onClick={() => onChooseTarget?.(player.seat)}
            >
              <AvatarBadge avatarId={player.avatarId} size="2.8rem" />
              <strong>{player.name}</strong>
              <small>
                {player.handCount} card{player.handCount === 1 ? '' : 's'}
              </small>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function Cue({ cue, localSeat }: { cue: FxCue; localSeat: number }) {
  if (
    cue.type === 'deal' ||
    cue.type === 'flip' ||
    cue.type === 'draw' ||
    cue.type === 'discard' ||
    cue.type === 'transfer'
  ) {
    const faceDown =
      (cue.type === 'deal' && cue.to !== `hand:${localSeat}` && cue.to !== 'discard') ||
      (cue.type === 'draw' && cue.to !== `hand:${localSeat}`) ||
      (cue.type === 'transfer' && cue.from !== `hand:${localSeat}`);
    return (
      <TableCardFlight cueId={cue.id}>
        <WildCard card={cue.card} faceDown={faceDown} />
      </TableCardFlight>
    );
  }
  if (cue.type === 'turn') {
    return <TableTurnPop cueId={cue.id} seat={cue.seat} />;
  }
  return null;
}
