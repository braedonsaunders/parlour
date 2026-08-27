'use client';

import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { orderedHand, type FxEvent } from '@parlour/engine';
import { orderOf, palaceCatalog } from '@parlour/game-palace';
import { type FxCue } from '@/lib/table/fx-motion';
import { getAvatar } from '@/lib/avatars';
import { PALACE_SFX_PACK } from '@/lib/audio/sfx';
import { useMatchTension } from '@/lib/audio/tension';
import { PALACE_MATCH_PACE_MS } from '@/lib/palace/modes';
import { palaceAnnouncements, type PalaceTableView } from '@/lib/palace/view';
import { useMusicMood } from '@/stores/audio';
import { ArrivalProvider, useAdmittedHand } from '@/lib/table/arrival-presentation';
import { type DealPresentation, useDealPresentation } from '@/lib/table/deal-presentation';
import { useTableAudio } from '../fx-animation';
import { HandRail, HandRailCard } from '../HandRail';
import { PlayingCard } from '../PlayingCard';
import {
  dealStateAttr,
  SeatNameplate,
  TableActionRail,
  TableCardFlight,
  TableErrorScreen,
  TableFxLayer,
  TableLoadingScreen,
  TablePlayfield,
  TableScreenFrame,
  TableTitlePill,
  TableTurnPop,
  useGameTextSurface,
  useTableMenu,
} from '../shell';
import { AvatarBadge } from '@/components/AvatarBadge';
import tableStyles from '@/styles/table.module.css';
import styles from '@/styles/palace.module.css';

const EMPTY_SELECTION: readonly string[] = [];

export interface SwapPair {
  hand: string;
  up: string;
}

export type PalaceTableScreenProps = {
  view: PalaceTableView | null;
  fx: readonly FxEvent[];
  fxKey: string | number;
  busy?: boolean;
  error?: string | null;
  onSwap?: (pairs: readonly SwapPair[]) => void;
  onReady?: () => void;
  onPlay?: (cards: readonly string[]) => void;
  onPickup?: () => void;
  onPlayDown?: (slot: number) => void;
  /** Fired only after the player confirms quitting from the shared table menu. */
  onQuit?: () => void;
};

function isSameRank(cards: readonly string[]): boolean {
  if (cards.length === 0) return false;
  const rank = orderOf(cards[0]!);
  return cards.every((card) => orderOf(card) === rank);
}

export function PalaceTableScreen(props: PalaceTableScreenProps) {
  const { view, error } = props;
  const rootRef = useRef<HTMLElement>(null);
  const menu = useTableMenu(props.onQuit);

  // Selection rides with the fx batch it was made in: a new batch voids it
  // without an effect-driven reset.
  const [selection, setSelection] = useState<{ key: string | number; cards: readonly string[] }>({
    key: props.fxKey,
    cards: [],
  });
  const selected = selection.key === props.fxKey ? selection.cards : EMPTY_SELECTION;

  // The swap phase is a client-only plan until Ready sends it: which hand
  // cards trade places with which face-up cards. Purely local state — the
  // engine only ever sees the one `swap` call this produces.
  const [armedHand, setArmedHand] = useState<string | null>(null);
  const [pendingSwaps, setPendingSwaps] = useState<readonly SwapPair[]>([]);

  const deal = useDealPresentation(props.fx, props.fxKey);
  useTableAudio(props.fx, props.fxKey, PALACE_SFX_PACK.id);

  const tense = useMatchTension({
    expectedMs: PALACE_MATCH_PACE_MS,
    running: Boolean(view) && view?.activeSeat !== null,
  });
  useMusicMood(tense ? 'tense' : null);

  const banner = useTableBanner(props.fx, props.fxKey, view?.players ?? []);

  const selectionValid =
    view !== null &&
    selected.length > 0 &&
    isSameRank(selected) &&
    view.legal.playableCards.includes(selected[0]!);

  useGameTextSurface(() => ({
    game: 'palace',
    status: error ? 'error' : view ? (deal.dealing ? 'dealing' : 'ready') : 'loading',
    error,
    localSeat: view?.localSeat ?? null,
    activeSeat: view?.activeSeat ?? null,
    dealNumber: view?.roundNumber ?? null,
    phaseLabel: view?.phaseLabel ?? null,
    decision: view?.decision ?? null,
    floor: view?.floor ?? null,
    layer: view?.layer ?? null,
    hand: view
      ? orderedHand(deal.visibleCards(view.hand, view.localSeat), palaceCatalog.handOrder)
      : [],
    roundsWon: view ? Object.fromEntries(view.players.map((p) => [p.seat, p.roundsWon])) : {},
  }));

  const toggleCard = (card: string) => {
    setSelection((current) => {
      const cards = current.key === props.fxKey ? current.cards : EMPTY_SELECTION;
      if (cards.includes(card)) {
        return { key: props.fxKey, cards: cards.filter((entry) => entry !== card) };
      }
      if (cards.length > 0 && !isSameRank([cards[0]!, card])) {
        return { key: props.fxKey, cards: [card] };
      }
      return { key: props.fxKey, cards: [...cards, card] };
    });
  };

  const armOrCompleteSwap = (zone: 'hand' | 'up', card: string) => {
    if (zone === 'hand') {
      setArmedHand((current) => (current === card ? null : card));
      return;
    }
    if (!armedHand) return;
    setPendingSwaps((current) => [
      ...current.filter((pair) => pair.hand !== armedHand && pair.up !== card),
      { hand: armedHand, up: card },
    ]);
    setArmedHand(null);
  };

  const confirmReady = () => {
    if (pendingSwaps.length > 0) props.onSwap?.(pendingSwaps);
    props.onReady?.();
    setPendingSwaps([]);
    setArmedHand(null);
  };

  if (error) {
    return <TableErrorScreen headline="The table lost the thread." message={error} />;
  }

  if (!view) {
    return <TableLoadingScreen copy="Dealing the layers…" />;
  }

  const compactRing = view.players.length > 4;
  const localBusy = (props.busy ?? false) || deal.dealing;
  const swapping = view.decision === 'swap';
  const playingHandOrUp =
    view.decision === 'play' && (view.layer === 'hand' || view.layer === 'up');
  const playingDown = view.decision === 'play' && view.layer === 'down';

  return (
    <ArrivalProvider fx={props.fx} fxKey={props.fxKey} localSeat={view.localSeat}>
      <TableScreenFrame
        rootRef={rootRef}
        dealState={dealStateAttr(deal)}
        menu={menu}
        hud={<TableTitlePill eyebrow="Palace" status={view.phaseLabel} />}
      >
        <TablePlayfield
          label="Palace table"
          feltMark="♜"
          className={compactRing ? tableStyles.compactRing : undefined}
          seatCount={view.players.length}
        >
          {view.players
            .filter((player) => !player.isLocal)
            .map((player) => (
              <Seat key={player.seat} player={player} active={view.activeSeat === player.seat} />
            ))}

          <CenterPile view={view} deal={deal} />
          <PersonalFurniture
            view={view}
            swapping={swapping}
            playingHandOrUp={playingHandOrUp}
            playingDown={playingDown}
            selected={selected}
            armedHand={armedHand}
            pendingSwaps={pendingSwaps}
            busy={localBusy}
            onToggleUp={(card) => (swapping ? armOrCompleteSwap('up', card) : toggleCard(card))}
            onFlipDown={(slot) => props.onPlayDown?.(slot)}
          />
          <LocalHand
            view={view}
            busy={localBusy}
            swapping={swapping}
            selected={selected}
            armedHand={armedHand}
            pendingSwaps={pendingSwaps}
            onToggle={(card) => (swapping ? armOrCompleteSwap('hand', card) : toggleCard(card))}
            deal={deal}
          />

          <TableFxLayer
            fx={props.fx}
            fxKey={props.fxKey}
            rootRef={rootRef}
            renderCue={(cue) => <Cue cue={cue} localSeat={view.localSeat} />}
          />

          {swapping && !localBusy && (
            <div className={`${styles.swapBanner} panel-soft`} data-testid="swap-banner">
              <strong>Swap &amp; ready</strong>
              <span className={styles.swapHint}>
                {pendingSwaps.length > 0
                  ? `${pendingSwaps.length} swap${pendingSwaps.length === 1 ? '' : 's'} planned`
                  : 'Tap a hand card, then a face-up card to trade them.'}
              </span>
            </div>
          )}

          {banner && (
            <div className={styles.celebration} aria-live="polite" data-testid="palace-banner">
              <motion.div
                initial={{ scale: 0.5, opacity: 0 }}
                animate={{ scale: [0.5, 1.15, 1], opacity: 1 }}
                transition={{ duration: 0.45, ease: [0.34, 1.56, 0.64, 1] }}
                style={{ textAlign: 'center' }}
              >
                <div className={styles.celebrationBurst} aria-hidden="true">
                  {banner.kind === 'out' ? '👑' : banner.kind === 'burn' ? '🔥' : '🫳'}
                </div>
                <div className={styles.celebrationLabel}>
                  {banner.text}
                  {banner.detail ? <> — {banner.detail}</> : null}
                </div>
              </motion.div>
            </div>
          )}
        </TablePlayfield>

        <TableActionRail>
          {playingHandOrUp && (
            <>
              <button
                type="button"
                className="btn-fat"
                disabled={!selectionValid || localBusy}
                onClick={() => {
                  if (selectionValid) {
                    props.onPlay?.(selected);
                    setSelection({ key: props.fxKey, cards: [] });
                  }
                }}
              >
                Play{selected.length > 0 ? ` (${selected.length})` : ''}
              </button>
              <button
                type="button"
                className="btn-fat btn-fat--ghost"
                disabled={!view.legal.pickup || localBusy}
                onClick={props.onPickup}
              >
                Pick up
              </button>
            </>
          )}
          {playingDown && (
            <>
              <span className={styles.swapHint}>Flip a face-down card to play blind.</span>
              <button
                type="button"
                className="btn-fat btn-fat--ghost"
                disabled={!view.legal.pickup || localBusy}
                onClick={props.onPickup}
              >
                Pick up instead
              </button>
            </>
          )}
          {swapping && (
            <button type="button" className="btn-fat" disabled={localBusy} onClick={confirmReady}>
              Ready
            </button>
          )}
        </TableActionRail>
      </TableScreenFrame>
    </ArrivalProvider>
  );
}

function Seat({ player, active }: { player: PalaceTableView['players'][number]; active: boolean }) {
  const avatar = getAvatar(player.avatarId);
  const style = { '--seat-accent': avatar.accent, '--seat-shade': avatar.shade } as CSSProperties;

  return (
    <motion.div
      layout
      data-seat={player.seat}
      className={`${tableStyles.seat} ${tableStyles[`seat${player.seat}`] ?? ''} ${
        active ? tableStyles.seatActive : ''
      }`}
      style={style}
      animate={active ? { scale: [1, 1.06, 1.02] } : { scale: 1 }}
      transition={{ duration: 0.24, ease: [0.34, 1.56, 0.64, 1] }}
    >
      <AvatarBadge
        avatarId={player.avatarId}
        size="clamp(2.6rem, 5vw, 4.4rem)"
        className={tableStyles.avatar}
      />
      <SeatNameplate name={player.name} isBot={player.isBot} />
      {player.up.length > 0 && (
        <div className={styles.seatUpRow} data-zone={`up:${player.seat}`}>
          {player.up.map((card) => (
            <PlayingCard key={card} card={card} compact />
          ))}
        </div>
      )}
      <div className={styles.seatBadges}>
        <span className={styles.scoreChip}>
          {player.handCount} hand · {player.roundsWon} win{player.roundsWon === 1 ? '' : 's'}
        </span>
        <span className={styles.downChip}>{player.downCount} down</span>
      </div>
    </motion.div>
  );
}

function CenterPile({ view, deal }: { view: PalaceTableView; deal: DealPresentation }) {
  const cards = deal.discardReady ? view.pile.slice(-3) : [];
  return (
    <div className={styles.pileArea} data-center-pile>
      <div className={styles.pileStack} data-zone="pile">
        {cards.length === 0 && !deal.dealing && (
          <span className={styles.emptyPileHint}>lead anything</span>
        )}
        {cards.map((card, index) => (
          <div key={`${card}-${index}`} className={styles.pileCard}>
            <PlayingCard card={card} rotation={(index - cards.length / 2) * 6} />
          </div>
        ))}
        {view.floor !== null && (
          <span className={styles.floorChip} data-testid="floor-chip">
            beat rank {view.floor}
          </span>
        )}
      </div>
      {view.burnCount > 0 && (
        <div
          className={styles.burnTray}
          data-testid="burn-tray"
          title="Cards burned out of the game"
        >
          <span>Burned</span>
          <span className={styles.burnTrayCount}>{view.burnCount}</span>
        </div>
      )}
    </div>
  );
}

function PersonalFurniture({
  view,
  swapping,
  playingHandOrUp,
  playingDown,
  selected,
  armedHand,
  pendingSwaps,
  busy,
  onToggleUp,
  onFlipDown,
}: {
  view: PalaceTableView;
  swapping: boolean;
  playingHandOrUp: boolean;
  playingDown: boolean;
  selected: readonly string[];
  armedHand: string | null;
  pendingSwaps: readonly SwapPair[];
  busy: boolean;
  onToggleUp: (card: string) => void;
  onFlipDown: (slot: number) => void;
}) {
  const local = view.players.find((player) => player.isLocal);
  const up = local?.up ?? [];
  const downCount = local?.downCount ?? 0;
  const swappedOutOfUp = new Set(pendingSwaps.map((pair) => pair.up));

  return (
    <div className={styles.personalRow} data-zone="furniture">
      <div className={styles.furnitureGroup}>
        <span className={styles.furnitureLabel}>Face-down</span>
        <div className={styles.furnitureRow} data-zone={`down:${view.localSeat}`}>
          {Array.from({ length: downCount }, (_, slot) => (
            <div
              key={slot}
              className={`${styles.downSlot} ${playingDown ? styles.downSlotActive : ''}`}
            >
              <PlayingCard
                faceDown
                disabled={!playingDown || busy}
                onClick={() => playingDown && !busy && onFlipDown(slot)}
                actionLabel="Flip"
              />
            </div>
          ))}
        </div>
      </div>
      <div className={styles.furnitureGroup}>
        <span className={styles.furnitureLabel}>Face-up</span>
        <div className={styles.furnitureRow} data-zone={`up:${view.localSeat}`}>
          {up.map((card) => {
            const canSelect =
              (swapping && !swappedOutOfUp.has(card)) || (playingHandOrUp && view.layer === 'up');
            const isSelected = view.layer === 'up' && selected.includes(card);
            const isPlannedOut = swappedOutOfUp.has(card);
            return (
              <PlayingCard
                key={card}
                card={card}
                disabled={!canSelect || busy || isPlannedOut}
                rotation={isSelected || armedHand ? -4 : 0}
                onClick={() => canSelect && !busy && onToggleUp(card)}
                actionLabel={swapping ? 'Swap' : 'Play'}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}

function LocalHand({
  view,
  busy,
  swapping,
  selected,
  armedHand,
  pendingSwaps,
  onToggle,
  deal,
}: {
  view: PalaceTableView;
  busy: boolean;
  swapping: boolean;
  selected: readonly string[];
  armedHand: string | null;
  pendingSwaps: readonly SwapPair[];
  onToggle: (card: string) => void;
  deal: DealPresentation;
}) {
  const plannedHand = orderedHand(
    deal.visibleCards(view.hand, view.localSeat),
    palaceCatalog.handOrder,
  );
  const visibleHand = useAdmittedHand(plannedHand);
  const swappedOutOfHand = new Set(pendingSwaps.map((pair) => pair.hand));
  const canPick = !busy && (swapping || view.layer === 'hand');
  const showLegality = !busy && !swapping && view.layer === 'hand';

  return (
    <HandRail
      count={visibleHand.length}
      zone={`hand:${view.localSeat}`}
      label="Your hand"
      dealState={dealStateAttr(deal)}
      fanPlan={plannedHand}
    >
      <AnimatePresence initial={false} mode="popLayout">
        {visibleHand.map((card, index) => {
          const playable = view.legal.playableCards.includes(card);
          const isSelected = swapping ? armedHand === card : selected.includes(card);
          const isPlannedOut = swappedOutOfHand.has(card);
          return (
            <HandRailCard
              key={card}
              cardId={card}
              index={index}
              count={visibleHand.length}
              playable={showLegality ? playable || isSelected : undefined}
            >
              <PlayingCard
                card={card}
                disabled={!canPick || isPlannedOut}
                rotation={isSelected ? -4 : 0}
                onClick={() => canPick && onToggle(card)}
                actionLabel={swapping ? 'Swap' : 'Play'}
              />
            </HandRailCard>
          );
        })}
      </AnimatePresence>
    </HandRail>
  );
}

const BANNER_VISIBLE_MS = 1_600;

/** Brief centre-table calls driven purely by engine fx — burns, pickups, going out. */
function useTableBanner(
  fx: readonly FxEvent[],
  fxKey: string | number,
  players: PalaceTableView['players'],
) {
  const call = palaceAnnouncements(fx, players)[0] ?? null;
  // A batch shows its call the instant it arrives; only the timer that hides
  // it again needs an effect.
  const [hiddenKey, setHiddenKey] = useState<string | number | null>(null);
  useEffect(() => {
    if (!call) return;
    const timer = window.setTimeout(() => setHiddenKey(fxKey), BANNER_VISIBLE_MS);
    return () => window.clearTimeout(timer);
  }, [call, fxKey]);
  return call && hiddenKey !== fxKey ? call : null;
}

function Cue({ cue, localSeat }: { cue: FxCue; localSeat: number }) {
  if (cue.type === 'deal' || cue.type === 'flip' || cue.type === 'draw' || cue.type === 'discard') {
    const faceDown =
      (cue.type === 'deal' && cue.to !== `hand:${localSeat}` && cue.to !== `up:${localSeat}`) ||
      (cue.type === 'flip' && cue.to !== `up:${localSeat}` && cue.to === undefined);
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
