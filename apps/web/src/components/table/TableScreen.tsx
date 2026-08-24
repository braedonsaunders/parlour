'use client';

import { useRef, type CSSProperties } from 'react';
import { orderedHand, type FxEvent } from '@parlour/engine';
import { blitzCatalog, blitzHowToPlay } from '@parlour/game-blitz';
import { AnimatePresence, motion } from 'motion/react';
import { getAvatar } from '@/lib/avatars';
import { BLITZ_SFX_PACK } from '@/lib/audio/sfx';
import { ArrivalProvider, useAdmittedHand } from '@/lib/table/arrival-presentation';
import { type DealPresentation, useDealPresentation } from '@/lib/table/deal-presentation';
import { type FxCue } from '@/lib/table/fx-motion';
import { ownerCurrentCount } from '@/lib/table/owner-count';
import { discardRotation, useTableAudio } from './fx-animation';
import { HandRail, HandRailCard } from './HandRail';
import { PlayingCard } from './PlayingCard';
import { StockStack } from './StockStack';
import { TableMenu } from './TableMenu';
import {
  dealStateAttr,
  DiscardPileButton,
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
} from './shell';
import { AvatarBadge } from '@/components/AvatarBadge';
import styles from '@/styles/table.module.css';

export type TablePlayer = {
  seat: number;
  name: string;
  avatarId: string;
  hand: readonly string[];
  handCount?: number;
  lives: number;
  isLocal?: boolean;
  isBot?: boolean;
  eliminated?: boolean;
};

export type TableView = {
  players: readonly TablePlayer[];
  activeSeat: number | null;
  stockCount: number;
  discard: readonly string[];
  phaseLabel: string;
  legal: {
    drawStock: boolean;
    drawDiscard: boolean;
    discardCards: readonly string[];
    knock: boolean;
  };
};

export type TableScreenProps = {
  view: TableView | null;
  fx: readonly FxEvent[];
  fxKey: string | number;
  busy?: boolean;
  error?: string | null;
  onDraw?: (source: 'stock' | 'discard') => void;
  onDiscard?: (card: string) => void;
  onKnock?: () => void;
  /** Fired only after the player confirms quitting from the table menu. */
  onQuit?: () => void;
};

export function TableScreen(props: TableScreenProps) {
  const { view, error } = props;
  const rootRef = useRef<HTMLElement>(null);
  const menu = useTableMenu(props.onQuit);
  const deal = useDealPresentation(props.fx, props.fxKey);
  useTableAudio(props.fx, props.fxKey, BLITZ_SFX_PACK.id);

  useGameTextSurface(() => ({
    coordinateSystem: 'CSS pixels; origin is top-left, x grows right, y grows down',
    game: 'blitz',
    status: error ? 'error' : view ? (deal.dealing ? 'dealing' : 'ready') : 'loading',
    error,
    activeSeat: view?.activeSeat ?? null,
    stockCount: view ? view.stockCount + deal.pendingStockCards : null,
    discardTop: view && deal.discardReady ? view.discard.at(-1) : null,
    hand: (() => {
      const player = view?.players.find(({ isLocal }) => isLocal);
      return player
        ? orderedHand(deal.visibleCards(player.hand, player.seat), blitzCatalog.handOrder)
        : [];
    })(),
    legal: deal.dealing ? null : (view?.legal ?? null),
    activeFx: props.fx.map(({ kind, at }) => ({ kind, at: at ?? 0 })),
  }));

  if (error) {
    return <TableErrorScreen headline="The table lost the thread." message={error} />;
  }

  if (!view) {
    return <TableLoadingScreen copy="Setting the table…" />;
  }

  const tableBusy = (props.busy ?? false) || deal.dealing;
  const localSeat = view.players.find(({ isLocal }) => isLocal)?.seat ?? 0;

  return (
    <ArrivalProvider fx={props.fx} fxKey={props.fxKey} localSeat={localSeat}>
      <TableShell rootRef={rootRef} dealState={dealStateAttr(deal)}>
        <TableHud onOpenMenu={menu.open}>
          <TableTitlePill eyebrow="Blitz" status={view.phaseLabel} />
        </TableHud>

        <TablePlayfield label="Blitz table" feltMark="31">
          {view.players.map((player) => (
            <Seat
              key={player.seat}
              player={player}
              active={view.activeSeat === player.seat}
              displayCount={deal.visibleCount(player.seat, player.handCount ?? player.hand.length)}
            />
          ))}
          <Piles view={view} busy={tableBusy} onDraw={props.onDraw} deal={deal} />
          <LocalHand {...props} view={view} busy={tableBusy} deal={deal} />
          <TableFxLayer
            fx={props.fx}
            fxKey={props.fxKey}
            rootRef={rootRef}
            renderCue={(cue) => <Cue cue={cue} players={view.players} localSeat={localSeat} />}
          />
        </TablePlayfield>

        <TableActionRail>
          <button
            type="button"
            className="btn-fat"
            disabled={!view.legal.knock || tableBusy}
            onClick={props.onKnock}
          >
            Knock
          </button>
        </TableActionRail>

        <TableMenu
          open={menu.isOpen}
          onClose={menu.close}
          howToPlay={{ doc: blitzHowToPlay, title: 'Blitz', subtitle: 'the 31 game' }}
          onQuit={menu.quit}
        />
      </TableShell>
    </ArrivalProvider>
  );
}

function Seat({
  player,
  active,
  displayCount,
}: {
  player: TablePlayer;
  active: boolean;
  displayCount: number;
}) {
  const avatar = getAvatar(player.avatarId);
  const count = player.eliminated ? 0 : displayCount;
  const style = { '--seat-accent': avatar.accent, '--seat-shade': avatar.shade } as CSSProperties;

  return (
    <motion.div
      layout
      data-seat={player.seat}
      className={`${styles.seat} ${styles[`seat${player.seat}`]} ${active ? styles.seatActive : ''} ${player.eliminated ? styles.seatEliminated : ''}`}
      style={style}
      animate={active ? { scale: [1, 1.06, 1.02] } : { scale: 1 }}
      transition={{ duration: 0.24, ease: [0.34, 1.56, 0.64, 1] }}
    >
      {!player.isLocal && (
        <OpponentFan
          count={count}
          max={5}
          spread={22}
          renderCard={({ rotation }) => <PlayingCard compact faceDown rotation={rotation} />}
        />
      )}
      <AvatarBadge
        avatarId={player.avatarId}
        size="clamp(3.2rem, 5.6vw, 4.8rem)"
        className={styles.avatar}
      />
      <SeatNameplate name={player.name} isBot={player.isBot} />
      {!player.isLocal && (
        <div className={styles.lifeRow} aria-label={`${player.lives} lives`}>
          {Array.from({ length: player.lives }, (_, index) => (
            <i key={index} />
          ))}
        </div>
      )}
    </motion.div>
  );
}

function Piles({
  view,
  busy,
  onDraw,
  deal,
}: {
  view: TableView;
  busy: boolean;
  onDraw?: TableScreenProps['onDraw'];
  deal: DealPresentation;
}) {
  const visibleDiscard = (deal.discardReady ? view.discard : []).slice(0, 3).reverse();
  const stockCount = view.stockCount + deal.pendingStockCards;
  return (
    <TablePiles localTurn={!busy}>
      {!busy && <TableTurnIndicator />}
      <StockPile
        count={stockCount}
        disabled={!view.legal.drawStock || busy}
        onClick={() => onDraw?.('stock')}
        card={
          <StockStack count={stockCount}>
            <PlayingCard faceDown />
          </StockStack>
        }
      />
      <DiscardPileButton
        disabled={!view.legal.drawDiscard || busy || visibleDiscard.length === 0}
        onClick={() => onDraw?.('discard')}
        label="Draw from discard"
      >
        {visibleDiscard.map((card, index) => (
          <PlayingCard
            key={`${card}:${index}`}
            card={card}
            rotation={discardRotation(card, index)}
          />
        ))}
      </DiscardPileButton>
    </TablePiles>
  );
}

function LocalHand(props: TableScreenProps & { view: TableView; deal: DealPresentation }) {
  const player = props.view.players.find(({ isLocal }) => isLocal);
  // The hooks below must run on every render, including the one where a
  // spectator view has no local seat — bailing out first made the hook order
  // depend on the data and would desync every later hook the moment a seat
  // appeared or vanished.
  const plannedHand = orderedHand(
    props.deal.visibleCards(player?.hand ?? [], player?.seat ?? 0),
    blitzCatalog.handOrder,
  );
  const visibleHand = useAdmittedHand(plannedHand);
  if (!player) return null;
  const canChoose = props.view.legal.discardCards.length > 0 && !props.busy;
  const currentCount = ownerCurrentCount([{ hand: plannedHand, isLocal: true }]);
  return (
    <>
      <div className={styles.ownerStatusRail} aria-label="Your status">
        <output className={styles.ownerCount} aria-label={`My current count: ${currentCount ?? 0}`}>
          <span>My count</span>
          <strong>{currentCount ?? 0}</strong>
        </output>
        <div className={styles.ownerLives} aria-label={`My lives: ${player.lives}`}>
          <span aria-hidden="true">My lives</span>
          <span className={styles.ownerLifePips} aria-hidden="true">
            {Array.from({ length: player.lives }, (_, index) => (
              <i key={index} />
            ))}
          </span>
        </div>
      </div>
      <HandRail
        count={visibleHand.length}
        zone={`hand:${player.seat}`}
        label="Your hand"
        dealState={dealStateAttr(props.deal)}
        fanPlan={plannedHand}
      >
        <AnimatePresence initial={false} mode="popLayout">
          {visibleHand.map((card, index) => {
            const playable = canChoose && props.view.legal.discardCards.includes(card);
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
                  disabled={!playable}
                  onClick={() => props.onDiscard?.(card)}
                />
              </HandRailCard>
            );
          })}
        </AnimatePresence>
      </HandRail>
    </>
  );
}

function Cue({
  cue,
  players,
  localSeat,
}: {
  cue: FxCue;
  players: readonly TablePlayer[];
  localSeat: number;
}) {
  if (cue.type === 'deal' || cue.type === 'flip' || cue.type === 'draw' || cue.type === 'discard') {
    return (
      <TableCardFlight cueId={cue.id}>
        <PlayingCard
          card={cue.card}
          faceDown={cue.type === 'deal' && cue.to !== `hand:${localSeat}`}
        />
      </TableCardFlight>
    );
  }

  if (cue.type === 'knock') {
    return (
      <div data-fx-cue={cue.id} data-burst className={`${styles.burst} ${styles.knockBurst}`}>
        <span className={styles.ripple} />
        <strong>KNOCKED</strong>
      </div>
    );
  }

  if (cue.type === 'blitz') {
    return (
      <div data-fx-cue={cue.id} data-burst className={`${styles.burst} ${styles.blitzBurst}`}>
        <span className={styles.starburst} />
        <b>{cue.handValue}</b>
        <strong>BLITZ!</strong>
      </div>
    );
  }

  if (cue.type === 'showdown') {
    const hand = players.find(({ seat }) => seat === cue.seat)?.hand ?? [];
    return (
      <div data-fx-cue={cue.id} data-seat-burst={cue.seat} className={styles.showdownBurst}>
        <div>
          {hand.map((card) => (
            <PlayingCard key={card} card={card} compact />
          ))}
        </div>
        <strong>{cue.handValue}</strong>
      </div>
    );
  }

  if (cue.type === 'chip-loss') {
    return (
      <div data-fx-cue={cue.id} data-seat-burst={cue.seat} className={styles.flyingChip}>
        −1
      </div>
    );
  }

  if (cue.type === 'layoff' || cue.type === 'gin-burst') return null; // rendered by the Gin table

  if (cue.type === 'turn') {
    return <TableTurnPop cueId={cue.id} seat={cue.seat} />;
  }
  return null;
}
