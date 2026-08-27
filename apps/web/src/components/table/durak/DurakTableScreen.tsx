'use client';

import { useMemo, useRef, type CSSProperties } from 'react';
import { orderedHand, type FxEvent } from '@parlour/engine';
import { durakCatalog, durakDeck, durakHowToPlay, DURAK_SUIT_GLYPHS } from '@parlour/game-durak';
import { AnimatePresence, motion } from 'motion/react';
import { getAvatar } from '@/lib/avatars';
import { DURAK_SFX_PACK } from '@/lib/audio/sfx';
import { useMatchTension } from '@/lib/audio/tension';
import { useMusicMood } from '@/stores/audio';
import { ArrivalProvider, useAdmittedHand } from '@/lib/table/arrival-presentation';
import { useDealPresentation, type DealPresentation } from '@/lib/table/deal-presentation';
import { type FxCue } from '@/lib/table/fx-motion';
import { DURAK_MATCH_PACE_MS } from '@/lib/durak/modes';
import {
  durakAnnouncements,
  type DurakAnnouncement,
  type DurakSeatView,
  type DurakTableView,
} from '@/lib/durak/view';
import { useTableAudio } from '../fx-animation';
import { HandRail, HandRailCard } from '../HandRail';
import { PlayingCard, type CardFaceHint } from '../PlayingCard';
import { StockStack } from '../StockStack';
import {
  dealStateAttr,
  OpponentFan,
  SeatNameplate,
  StockPile,
  TableActionRail,
  TableCardFlight,
  TableErrorScreen,
  TableFxLayer,
  TableLoadingScreen,
  TablePiles,
  TablePlayfield,
  TableScreenFrame,
  TableTitlePill,
  TableTurnPop,
  useGameTextSurface,
  useTableMenu,
} from '../shell';
import { AvatarBadge } from '@/components/AvatarBadge';
import tableStyles from '@/styles/table.module.css';
import styles from '@/styles/durak.module.css';

function cardFace(card: string): CardFaceHint | undefined {
  return durakDeck.faces[card];
}

export type DurakTableScreenProps = {
  view: DurakTableView | null;
  fx: readonly FxEvent[];
  fxKey: string | number;
  busy?: boolean;
  error?: string | null;
  onAttack?: (card: string) => void;
  onDefend?: (attack: string, card: string) => void;
  onTransfer?: (card: string) => void;
  onTakeCards?: () => void;
  onPass?: () => void;
  /** Fired only after the player confirms quitting from the shared table menu. */
  onQuit?: () => void;
};

export function DurakTableScreen(props: DurakTableScreenProps) {
  const { view, error } = props;
  const rootRef = useRef<HTMLElement>(null);
  const menu = useTableMenu(props.onQuit);
  const deal = useDealPresentation(props.fx, props.fxKey);
  useTableAudio(props.fx, props.fxKey, DURAK_SFX_PACK.id);

  const tense = useMatchTension({
    expectedMs: DURAK_MATCH_PACE_MS,
    running: Boolean(view) && !view?.matchOver,
  });
  useMusicMood(tense ? 'tense' : null);

  const calls = useMemo(
    () => (!view || deal.dealing ? [] : durakAnnouncements(props.fx, view.players)),
    [deal.dealing, props.fx, view],
  );

  useGameTextSurface(() => ({
    game: 'durak',
    status: error ? 'error' : view ? (deal.dealing ? 'dealing' : 'ready') : 'loading',
    error,
    localSeat: view?.localSeat ?? null,
    activeSeat: view?.actingSeats[0] ?? null,
    trumpSuit: view?.trumpSuit ?? null,
    stockCount: view ? view.stockCount + deal.pendingStockCards : null,
    decision: view?.decision ?? null,
    hand: view
      ? orderedHand(deal.visibleCards(view.hand, view.localSeat), durakCatalog.handOrder, {
          trump: view.trumpSuit,
        })
      : [],
    attackCards: deal.dealing ? [] : (view?.legal.attackCards ?? []),
    matchOver: view?.matchOver ?? null,
  }));

  if (error) {
    return <TableErrorScreen headline="The table lost the thread." message={error} />;
  }

  if (!view) {
    return <TableLoadingScreen copy="Turning up the trump…" />;
  }

  const localBusy = (props.busy ?? false) || deal.dealing;
  const compactRing = view.players.length > 4;

  return (
    <ArrivalProvider fx={props.fx} fxKey={props.fxKey} localSeat={view.localSeat}>
      <TableScreenFrame
        rootRef={rootRef}
        dealState={dealStateAttr(deal)}
        menu={menu}
        hud={
          <TableTitlePill eyebrow="Durak" status={view.phaseLabel}>
            <span className={styles.cardCount} data-testid="durak-stock">
              stock <b>{view.stockCount}</b>
            </span>
          </TableTitlePill>
        }
        howToPlay={{ doc: durakHowToPlay, title: 'Durak', subtitle: view.phaseLabel }}
      >
        <TablePlayfield
          label="Durak table"
          feltMark="D"
          className={compactRing ? tableStyles.compactRing : undefined}
          seatCount={view.players.length}
        >
          {view.players.map((player) => (
            <Seat
              key={player.seat}
              player={player}
              position={tablePosition(player.seat, view.localSeat, view.players.length)}
              stamp={calls.find((call) => call.seat === player.seat) ?? null}
            />
          ))}
          <Table view={view} deal={deal} busy={localBusy} />
          <LocalHand
            view={view}
            busy={localBusy}
            onAttack={props.onAttack}
            onDefend={props.onDefend}
            deal={deal}
          />
          <TableFxLayer
            fx={props.fx}
            fxKey={props.fxKey}
            rootRef={rootRef}
            renderCue={(cue) => <Cue cue={cue} localSeat={view.localSeat} />}
          />
          <Announcer calls={calls} fxKey={props.fxKey} />
        </TablePlayfield>

        <TableActionRail className={styles.actionRail}>
          <AnimatePresence initial={false}>
            {view.legal.transferCards.length > 0 && !localBusy && (
              <motion.div
                key="transfer"
                className={styles.transferRow}
                initial={{ opacity: 0, scale: 0.7, y: 12 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.7, y: 12 }}
                transition={{ duration: 0.2 }}
              >
                {view.legal.transferCards.map((card) => (
                  <button
                    key={card}
                    type="button"
                    data-testid="durak-transfer"
                    className="btn-fat btn-fat--ghost"
                    onClick={() => props.onTransfer?.(card)}
                  >
                    Transfer {cardFace(card)?.short ?? card}
                  </button>
                ))}
              </motion.div>
            )}
            {view.legal.takeCards && !localBusy && (
              <motion.button
                key="take"
                type="button"
                data-testid="durak-take-cards"
                className="btn-fat btn-fat--ghost"
                initial={{ opacity: 0, scale: 0.7, y: 12 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.7, y: 12 }}
                transition={{ duration: 0.2 }}
                onClick={props.onTakeCards}
              >
                Take the table
              </motion.button>
            )}
            {view.legal.pass && !localBusy && (
              <motion.button
                key="pass"
                type="button"
                data-testid="durak-pass"
                className="btn-fat btn-fat--ghost"
                initial={{ opacity: 0, scale: 0.7, y: 12 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.7, y: 12 }}
                transition={{ duration: 0.2 }}
                onClick={props.onPass}
              >
                Nothing to throw in
              </motion.button>
            )}
          </AnimatePresence>
        </TableActionRail>
      </TableScreenFrame>
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

function Seat({
  player,
  position,
  stamp,
}: {
  player: DurakSeatView;
  position: number;
  stamp: DurakAnnouncement | null;
}) {
  const avatar = getAvatar(player.avatarId);
  const style = { '--seat-accent': avatar.accent, '--seat-shade': avatar.shade } as CSSProperties;
  const active = player.isAttacker || player.isDefender;

  return (
    <motion.div
      layout
      data-seat={player.seat}
      data-table-position={position}
      className={`${tableStyles.seat} ${tableStyles[`seat${position}`] ?? ''} ${
        active ? tableStyles.seatActive : ''
      } ${player.isOut ? tableStyles.seatEliminated : ''}`}
      style={style}
      animate={active ? { scale: [1, 1.06, 1.02] } : { scale: 1 }}
      transition={{ duration: 0.24, ease: [0.34, 1.56, 0.64, 1] }}
    >
      {!player.isLocal && (
        <OpponentFan
          count={player.handCount}
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
      <span className={styles.cardCount} data-low={player.handCount <= 2 && !player.isOut}>
        {player.isOut ? 'out' : `${player.handCount} card${player.handCount === 1 ? '' : 's'}`}
      </span>
      {player.isAttacker && (
        <span className={styles.roleTag} data-role="attacker">
          attack
        </span>
      )}
      {player.isDefender && (
        <span className={styles.roleTag} data-role="defender">
          defend
        </span>
      )}
      <AnimatePresence>
        {stamp && (
          <motion.span
            key={stamp.id}
            className={styles.announcement}
            data-stamp={stamp.kind}
            initial={{ opacity: 0, scale: 1.5, rotate: -12 }}
            animate={{ opacity: 1, scale: 1, rotate: -7 }}
            exit={{ opacity: 0, scale: 0.8 }}
            transition={{ duration: 0.26, ease: [0.34, 1.56, 0.64, 1], delay: stamp.atMs / 1000 }}
          >
            <strong>{stamp.text}</strong>
          </motion.span>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function Table({
  view,
  deal,
  busy,
}: {
  view: DurakTableView;
  deal: DealPresentation;
  busy: boolean;
}) {
  const stockCount = view.stockCount + deal.pendingStockCards;
  return (
    <TablePiles localTurn={!busy} centerPiles>
      <StockPile
        count={stockCount}
        className={styles.stockPile}
        canDraw={false}
        disabled
        card={
          <StockStack count={stockCount}>
            <PlayingCard faceDown />
          </StockStack>
        }
      />
      {deal.discardReady && (
        <div className={styles.trumpBadge} data-zone="trump">
          <PlayingCard card={view.trumpCard} face={cardFace(view.trumpCard)} />
          <span className={styles.trumpChip}>{DURAK_SUIT_GLYPHS[view.trumpSuit]} trump</span>
        </div>
      )}
      <div className={styles.tableArea} data-zone="table" aria-label="The table">
        {view.table.map((pair, index) => (
          <div key={`${pair.attack}:${index}`} className={styles.pairSlot}>
            <PlayingCard card={pair.attack} face={cardFace(pair.attack)} />
            {pair.defend && (
              <div className={styles.pairDefend}>
                <PlayingCard card={pair.defend} face={cardFace(pair.defend)} />
              </div>
            )}
          </div>
        ))}
      </div>
    </TablePiles>
  );
}

function LocalHand({
  view,
  busy,
  onAttack,
  onDefend,
  deal,
}: {
  view: DurakTableView;
  busy: boolean;
  onAttack?: (card: string) => void;
  onDefend?: (attack: string, card: string) => void;
  deal: DealPresentation;
}) {
  const plannedHand = orderedHand(
    deal.visibleCards(view.hand, view.localSeat),
    durakCatalog.handOrder,
    {
      trump: view.trumpSuit,
    },
  );
  const visibleHand = useAdmittedHand(plannedHand);
  const canChoose = !busy && view.decision !== null;

  const defendFor = (card: string) =>
    view.legal.defendOptions.find((option) => option.card === card);
  const isPlayable = (card: string) => {
    if (view.decision === 'attack') return view.legal.attackCards.includes(card);
    if (view.decision === 'defend') return Boolean(defendFor(card));
    return false;
  };

  const handleTap = (card: string) => {
    if (!canChoose) return;
    if (view.decision === 'attack' && view.legal.attackCards.includes(card)) {
      onAttack?.(card);
      return;
    }
    if (view.decision === 'defend') {
      const option = defendFor(card);
      if (option) onDefend?.(option.attack, option.card);
    }
  };

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
          const playable = isPlayable(card);
          return (
            <HandRailCard
              key={card}
              cardId={card}
              index={index}
              count={visibleHand.length}
              playable={canChoose ? playable : undefined}
            >
              <PlayingCard
                card={card}
                face={cardFace(card)}
                actionLabel={view.decision === 'attack' ? 'Attack' : 'Beat'}
                disabled={!canChoose || !playable}
                onClick={() => handleTap(card)}
              />
            </HandRailCard>
          );
        })}
      </AnimatePresence>
    </HandRail>
  );
}

function Announcer({
  calls,
  fxKey,
}: {
  calls: readonly DurakAnnouncement[];
  fxKey: string | number;
}) {
  return (
    <div className={styles.announcer} aria-live="polite" data-testid="durak-announcer">
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
      (cue.type === 'deal' && cue.to !== `hand:${localSeat}`) ||
      (cue.type === 'draw' && cue.to !== `hand:${localSeat}` && cue.from !== 'table');
    return (
      <TableCardFlight cueId={cue.id}>
        <PlayingCard card={cue.card} face={cardFace(cue.card)} faceDown={faceDown} />
      </TableCardFlight>
    );
  }
  if (cue.type === 'turn') {
    return <TableTurnPop cueId={cue.id} seat={cue.seat} />;
  }
  return null;
}
