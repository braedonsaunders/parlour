'use client';

import { useRef, type CSSProperties } from 'react';
import { orderedHand, type FxEvent } from '@parlour/engine';
import { AnimatePresence, motion } from 'motion/react';
import { ginCatalog, ginHowToPlay } from '@parlour/game-gin';
import { getAvatar } from '@/lib/avatars';
import { GIN_SFX_PACK } from '@/lib/audio/sfx';
import { GIN_MATCH_PACE_MS, type GinModeId } from '@/lib/gin/modes';
import type { GinSeatView, GinTableView } from '@/lib/gin/view';
import { useMatchTension } from '@/lib/audio/tension';
import { useMusicMood } from '@/stores/audio';
import { ArrivalProvider, useAdmittedHand } from '@/lib/table/arrival-presentation';
import { type DealPresentation, useDealPresentation } from '@/lib/table/deal-presentation';
import { type FxCue } from '@/lib/table/fx-motion';
import styles from '@/styles/table.module.css';
import ginStyles from '@/styles/gin.module.css';
import { discardRotation, useTableAudio } from '../fx-animation';
import { HandRail, HandRailCard } from '../HandRail';
import { PlayingCard } from '../PlayingCard';
import { StockStack } from '../StockStack';
import { TableMenu } from '../TableMenu';
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
} from '../shell';
import { AvatarBadge } from '@/components/AvatarBadge';

const BURST_LABEL: Record<string, string> = {
  gin: 'GIN!',
  'big-gin': 'BIG GIN!',
  undercut: 'UNDERCUT!',
};

const REASON_STAMP: Record<string, string> = {
  knock: 'KNOCKED',
  gin: 'GIN',
  'big-gin': 'BIG GIN',
  undercut: 'UNDERCUT',
  'dead-hand': 'DEAD HAND',
};

export type GinTableScreenProps = {
  view: GinTableView | null;
  fx: readonly FxEvent[];
  fxKey: string | number;
  mode?: GinModeId;
  busy?: boolean;
  error?: string | null;
  onTakeUpcard?: () => void;
  onPassUpcard?: () => void;
  onDraw?: (source: 'stock' | 'discard') => void;
  onDiscard?: (card: string) => void;
  onKnock?: () => void;
  onReady?: () => void;
  /** Fired only after the player confirms quitting from the shared table menu. */
  onQuit?: () => void;
};

export function GinTableScreen(props: GinTableScreenProps) {
  const { view, error } = props;
  const rootRef = useRef<HTMLElement>(null);
  const menu = useTableMenu(props.onQuit);
  const deal = useDealPresentation(props.fx, props.fxKey);
  useTableAudio(props.fx, props.fxKey, GIN_SFX_PACK.id);

  // A match is a handful of hands; the tense cue rides the expected pace and
  // releases when the table closes out.
  const tense = useMatchTension({
    expectedMs: GIN_MATCH_PACE_MS,
    running: Boolean(view) && view?.activeSeat !== null && !view?.matchOver,
  });
  useMusicMood(tense ? 'tense' : null);

  useGameTextSurface(() => ({
    coordinateSystem: 'CSS pixels; origin is top-left, x grows right, y grows down',
    game: 'gin',
    status: error ? 'error' : view ? (deal.dealing ? 'dealing' : 'ready') : 'loading',
    error,
    handNumber: view?.handNumber ?? null,
    activeSeat: view?.activeSeat ?? null,
    decision: view?.decision ?? null,
    stockCount: view ? view.stockCount + deal.pendingStockCards : null,
    discardTop: view && deal.discardReady ? view.discard.at(-1) : null,
    hand: (() => {
      const local = view?.players.find((player) => player.isLocal);
      return view && local
        ? orderedHand(deal.visibleCards(view.hand, local.seat), ginCatalog.handOrder)
        : [];
    })(),
    deadwood: deal.dealing ? null : (view?.deadwood ?? null),
    canKnock: view?.canKnock ?? false,
    legal: deal.dealing ? null : (view?.legal ?? null),
    scores: view ? view.players.map((p) => ({ seat: p.seat, score: p.score })) : [],
    handEnd: view?.handEnd ? { reason: view.handEnd.reason, points: view.handEnd.points } : null,
    matchOver: view?.matchOver ?? false,
    activeFx: props.fx.map(({ kind, at }) => ({ kind, at: at ?? 0 })),
  }));

  if (error) {
    return <TableErrorScreen headline="The table lost the thread." message={error} />;
  }

  if (!view) {
    return <TableLoadingScreen copy="Shuffling up…" />;
  }

  const busy = (props.busy ?? false) || deal.dealing;
  const opponent = view.players.find((player) => !player.isLocal);
  const meldedSet = new Set(view.meldPreview.flatMap((meld) => meld.cards));

  return (
    <ArrivalProvider fx={props.fx} fxKey={props.fxKey} localSeat={view.localSeat}>
      <TableShell rootRef={rootRef} dealState={dealStateAttr(deal)}>
        <TableHud onOpenMenu={menu.open}>
          <TableTitlePill
            eyebrow="Gin"
            status={view.phaseLabel}
            className="flex items-center gap-2"
          >
            <span aria-label="Scores" className="text-xs font-bold text-dusk-100/80">
              {view.players.map((player) => `${player.name} ${player.score}`).join(' · ')}
              <span className="text-dusk-200/70"> → {view.matchTarget}</span>
            </span>
          </TableTitlePill>
        </TableHud>

        <TablePlayfield label="Gin table" feltMark="♣">
          {opponent && (
            <Seat
              player={opponent}
              active={view.activeSeat === opponent.seat}
              displayCount={deal.visibleCount(opponent.seat, opponent.handCount)}
            />
          )}
          <Piles
            view={view}
            busy={busy}
            onDraw={props.onDraw}
            deal={deal}
            onTakeUpcard={props.onTakeUpcard}
            onPassUpcard={props.onPassUpcard}
          />
          <LocalHand
            view={view}
            busy={busy}
            deal={deal}
            meldedSet={meldedSet}
            onDiscard={props.onDiscard}
          />
          <div className={styles.ownerStatusRail} aria-label="Your status">
            <output
              className={ginStyles.deadwoodMeter}
              data-low={(view.deadwood ?? 99) <= view.knockCap}
              aria-label={`Your deadwood: ${view.deadwood ?? '—'}, knock cap ${view.knockCap}`}
            >
              <span>Deadwood</span>
              <strong>{view.handEnd ? '—' : (view.deadwood ?? '—')}</strong>
            </output>
          </div>
          <TableFxLayer
            fx={props.fx}
            fxKey={props.fxKey}
            rootRef={rootRef}
            renderCue={(cue) => <Cue cue={cue} localSeat={view.localSeat} />}
          />
        </TablePlayfield>

        {!view.handEnd && (
          <TableActionRail>
            <button
              type="button"
              className="btn-fat"
              disabled={!view.canKnock || busy || view.decision !== 'act'}
              onClick={props.onKnock}
            >
              Knock
            </button>
          </TableActionRail>
        )}

        {view.handEnd && !view.matchOver && (
          <HandEndSheet
            view={view}
            onReady={props.onReady}
            readySent={!view.handEnd.waitingFor.includes(view.localSeat)}
          />
        )}

        <TableMenu
          open={menu.isOpen}
          onClose={menu.close}
          howToPlay={{ doc: ginHowToPlay, title: 'Gin', subtitle: 'the rummy classic' }}
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
  player: GinSeatView;
  active: boolean;
  displayCount: number;
}) {
  const avatar = getAvatar(player.avatarId);
  const style = { '--seat-accent': avatar.accent, '--seat-shade': avatar.shade } as CSSProperties;

  return (
    <motion.div
      layout
      data-seat={player.seat}
      className={`${styles.seat} ${styles[`seat${player.seat}`]} ${active ? styles.seatActive : ''}`}
      style={style}
      animate={active ? { scale: [1, 1.06, 1.02] } : { scale: 1 }}
      transition={{ duration: 0.24, ease: [0.34, 1.56, 0.64, 1] }}
    >
      <OpponentFan
        count={displayCount}
        max={6}
        spread={20}
        renderCard={({ rotation }) => <PlayingCard compact faceDown rotation={rotation} />}
      />
      <AvatarBadge
        avatarId={player.avatarId}
        size="clamp(3.2rem, 5.6vw, 4.8rem)"
        className={styles.avatar}
      />
      <SeatNameplate
        name={
          <>
            {player.name}
            {player.dealer ? ' · dealer' : ''}
          </>
        }
        isBot={player.isBot}
      />
      <span className={tableScoreStyles()} aria-label={`Score ${player.score}`}>
        {player.score}
      </span>
    </motion.div>
  );
}

function tableScoreStyles(): string {
  // small pill reusing the wild card-count look without importing another module
  return 'rounded-full bg-black/40 px-2 py-0.5 text-xs font-extrabold text-hearth-50';
}

function Piles({
  view,
  busy,
  onDraw,
  deal,
  onTakeUpcard,
  onPassUpcard,
}: {
  view: GinTableView;
  busy: boolean;
  onDraw?: GinTableScreenProps['onDraw'];
  deal: DealPresentation;
  onTakeUpcard?: () => void;
  onPassUpcard?: () => void;
}) {
  const visibleDiscard = (deal.discardReady ? view.discard : []).slice(0, 3).reverse();
  const stockCount = view.stockCount + deal.pendingStockCards;
  const optionLive = view.decision === 'option' && !busy;
  const upcardFace = visibleDiscard.at(-1);
  return (
    <TablePiles localTurn={!busy && view.decision !== null}>
      {!busy && view.decision !== null && <TableTurnIndicator />}
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
        disabled={
          optionLive ? false : !view.legal.drawDiscard || busy || visibleDiscard.length === 0
        }
        onClick={() => (optionLive ? onTakeUpcard?.() : onDraw?.('discard'))}
        label={optionLive ? `Take the ${upcardFace ?? 'upcard'}` : 'Draw from discard'}
      >
        {visibleDiscard.map((card, index) => (
          <PlayingCard
            key={`${card}:${index}`}
            card={card}
            rotation={discardRotation(card, index)}
          />
        ))}
      </DiscardPileButton>
      {optionLive && (
        <div
          className={`${ginStyles.optionBanner} panel-soft`}
          role="group"
          aria-label="Upcard option"
        >
          <span className={ginStyles.optionCard}>{upcardFace ?? '?'}</span>
          <button type="button" className="btn-fat" onClick={onTakeUpcard}>
            Take it
          </button>
          <button type="button" className="btn-fat btn-fat--ghost" onClick={onPassUpcard}>
            Pass
          </button>
        </div>
      )}
    </TablePiles>
  );
}

function LocalHand({
  view,
  busy,
  deal,
  meldedSet,
  onDiscard,
}: {
  view: GinTableView;
  busy: boolean;
  deal: DealPresentation;
  meldedSet: ReadonlySet<string>;
  onDiscard?: (card: string) => void;
}) {
  const canChoose = view.legal.discardCards.length > 0 && !busy && view.decision === 'act';
  const plannedHand = orderedHand(
    deal.visibleCards(view.hand, view.localSeat),
    ginCatalog.handOrder,
  );
  const visibleHand = useAdmittedHand(plannedHand);
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
          const playable = canChoose && view.legal.discardCards.includes(card);
          const melded = meldedSet.has(card);
          return (
            <HandRailCard
              key={card}
              cardId={card}
              index={index}
              count={visibleHand.length}
              playable={canChoose ? playable : undefined}
            >
              <span className={ginStyles.handCardShell}>
                <PlayingCard card={card} disabled={!playable} onClick={() => onDiscard?.(card)} />
                {melded && !deal.dealing && <i className={ginStyles.meldMark} aria-hidden="true" />}
              </span>
            </HandRailCard>
          );
        })}
      </AnimatePresence>
    </HandRail>
  );
}

function HandEndSheet({
  view,
  onReady,
  readySent,
}: {
  view: GinTableView;
  onReady?: () => void;
  readySent: boolean;
}) {
  const end = view.handEnd!;
  const scorerName = view.players.find((player) => player.seat === end.scorer)?.name ?? 'Nobody';
  return (
    <div className={ginStyles.handEnd} data-testid="hand-end-sheet">
      <div className={`${ginStyles.sheet} panel-soft`} role="dialog" aria-label="Hand result">
        <div className={ginStyles.stampRow}>
          <span className={ginStyles.stamp} data-reason={end.reason}>
            {REASON_STAMP[end.reason] ?? end.reason.toUpperCase()}
          </span>
          <span className={ginStyles.points}>
            {end.scorer !== null ? `+${end.points} ${scorerName}` : 'no score'}
          </span>
        </div>

        {view.players.map((player) => (
          <div key={player.seat} className={ginStyles.seatRow}>
            <span className={ginStyles.seatName}>
              {player.name}
              {end.knocker === player.seat ? ' (knocker)' : ''}
            </span>
            <MeldRow melds={view.handEnd?.meldsBySeat[player.seat] ?? []} />
            {end.deadwood[player.seat] !== null && (
              <span className={ginStyles.layoffNote}>{end.deadwood[player.seat]} deadwood</span>
            )}
          </div>
        ))}

        {end.layoffs.length > 0 && (
          <p className={ginStyles.layoffNote}>
            Laid off: {end.layoffs.map((layoff) => layoff.card).join(', ')}
          </p>
        )}

        <div className={ginStyles.scoreLine}>
          {view.players.map((player) => (
            <span key={player.seat}>
              {player.name} {player.score}
              <span className="text-dusk-200/70"> → {view.matchTarget}</span>
            </span>
          ))}
        </div>

        <div className={ginStyles.readyRow}>
          <span className={ginStyles.waiting}>
            {readySent
              ? 'Waiting for the table…'
              : `Waiting for ${view.handEnd!.waitingFor.length}`}
          </span>
          <button type="button" className="btn-fat" disabled={readySent} onClick={onReady}>
            {readySent ? 'Ready ✓' : 'Deal the next hand'}
          </button>
        </div>
      </div>
    </div>
  );
}

function MeldRow({ melds }: { melds: readonly { kind: string; cards: readonly string[] }[] }) {
  if (melds.length === 0) return <span className={ginStyles.layoffNote}>no melds</span>;
  const grouped = new Set(melds.flatMap((meld) => meld.cards));
  return (
    <div className={ginStyles.meldRow}>
      {melds.map((meld, index) => (
        <span key={index} className={ginStyles.meldGroup}>
          {meld.cards.map((card) => (
            <PlayingCard key={card} card={card} compact />
          ))}
        </span>
      ))}
      {melds.some((meld) => meld.kind === 'loose') &&
        melds
          .filter((meld) => meld.kind === 'loose')
          .flatMap((meld) => meld.cards)
          .map((card) => (
            <span key={`loose-${card}`} className={ginStyles.looseCard}>
              <PlayingCard card={card} compact />
            </span>
          ))}
      {grouped.size === 0 && null}
    </div>
  );
}

function Cue({ cue, localSeat }: { cue: FxCue; localSeat: number }) {
  if (cue.type === 'deal' || cue.type === 'flip' || cue.type === 'draw') {
    const faceDown = cue.type === 'deal' && cue.to !== `hand:${localSeat}` && cue.to !== 'discard';
    return (
      <TableCardFlight cueId={cue.id}>
        <PlayingCard
          card={cue.card}
          faceDown={faceDown || (cue.type === 'draw' && cue.to !== `hand:${localSeat}`)}
        />
      </TableCardFlight>
    );
  }

  if (cue.type === 'discard' || cue.type === 'layoff') {
    return (
      <TableCardFlight cueId={cue.id}>
        <PlayingCard card={cue.card} faceDown={false} />
      </TableCardFlight>
    );
  }

  if (cue.type === 'gin-burst') {
    return (
      <div
        data-fx-cue={cue.id}
        data-burst
        className={`${styles.burst} ${ginStyles.ginBurst}`}
        data-burst-kind={cue.burst}
      >
        <span className={styles.starburst} />
        <strong>{BURST_LABEL[cue.burst]}</strong>
      </div>
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

  if (cue.type === 'showdown') {
    return (
      <div data-fx-cue={cue.id} data-seat-burst={cue.seat} className={styles.showdownBurst}>
        <div />
        <strong>{cue.handValue}</strong>
      </div>
    );
  }

  if (cue.type === 'turn') {
    return <TableTurnPop cueId={cue.id} seat={cue.seat} />;
  }
  return null;
}
