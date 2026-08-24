'use client';

import { useEffect, useMemo, useRef, useState, type CSSProperties, type RefObject } from 'react';
import { orderedHand, type FxEvent } from '@parlour/engine';
import { AnimatePresence, motion } from 'motion/react';
import { ginCatalog, ginHowToPlay } from '@parlour/game-gin';
import { getAvatar } from '@/lib/avatars';
import { GIN_SFX_PACK } from '@/lib/audio/sfx';
import { GIN_MATCH_PACE_MS, type GinModeId } from '@/lib/gin/modes';
import type { GinSeatView, GinTableView } from '@/lib/gin/view';
import { useMatchTension } from '@/lib/audio/tension';
import { useMusicMood } from '@/stores/audio';
import { type DealPresentation, useDealPresentation } from '@/lib/table/deal-presentation';
import { buildFxTimeline, type FxCue } from '@/lib/table/fx-motion';
import styles from '@/styles/table.module.css';
import ginStyles from '@/styles/gin.module.css';
import { discardRotation, useFxAnimation, useTableAudio } from '../fx-animation';
import { HandRail, HandRailCard } from '../HandRail';
import { PlayingCard } from '../PlayingCard';
import { TableMenu } from '../TableMenu';
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
  const [menuOpen, setMenuOpen] = useState(false);
  const deal = useDealPresentation(props.fx, props.fxKey);
  useTableAudio(props.fx, props.fxKey, GIN_SFX_PACK.id);

  // A match is a handful of hands; the tense cue rides the expected pace and
  // releases when the table closes out.
  const tense = useMatchTension({
    expectedMs: GIN_MATCH_PACE_MS,
    running: Boolean(view) && view?.activeSeat !== null && !view?.matchOver,
  });
  useMusicMood(tense ? 'tense' : null);

  useEffect(() => {
    const gameWindow = window as Window & { render_game_to_text?: () => string };
    const renderGameToText = () =>
      JSON.stringify({
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
        handEnd: view?.handEnd
          ? { reason: view.handEnd.reason, points: view.handEnd.points }
          : null,
        matchOver: view?.matchOver ?? false,
        activeFx: props.fx.map(({ kind, at }) => ({ kind, at: at ?? 0 })),
      });
    gameWindow.render_game_to_text = renderGameToText;
    return () => {
      if (gameWindow.render_game_to_text === renderGameToText) {
        delete gameWindow.render_game_to_text;
      }
    };
  }, [deal, error, props.fx, view]);

  if (error) {
    return (
      <main className={styles.screen}>
        <div className={`${styles.statusPanel} panel-soft`} role="alert">
          <strong>The table lost the thread.</strong>
          <span>{error}</span>
        </div>
      </main>
    );
  }

  if (!view) {
    return (
      <main className={styles.screen} aria-busy="true">
        <div className={`${styles.statusPanel} panel-soft`}>
          <span className={styles.loadingPip} />
          <strong>Shuffling up…</strong>
        </div>
      </main>
    );
  }

  const busy = (props.busy ?? false) || deal.dealing;
  const opponent = view.players.find((player) => !player.isLocal);
  const meldedSet = new Set(view.meldPreview.flatMap((meld) => meld.cards));

  return (
    <main
      ref={rootRef}
      className={styles.screen}
      data-table-screen
      data-deal-state={deal.sequence ? (deal.complete ? 'complete' : 'dealing') : undefined}
    >
      <header className={styles.hud}>
        <div className="pill-soft flex items-center gap-2">
          <span className={styles.eyebrow}>Gin</span>
          <strong>{view.phaseLabel}</strong>
          <span aria-label="Scores" className="text-xs font-bold text-dusk-100/80">
            {view.players.map((player) => `${player.name} ${player.score}`).join(' · ')}
            <span className="text-dusk-200/70"> → {view.matchTarget}</span>
          </span>
        </div>
        <button
          type="button"
          className={`${styles.menuButton} btn-fat btn-fat--ghost`}
          aria-label="Table menu"
          aria-haspopup="dialog"
          onClick={() => setMenuOpen(true)}
        >
          •••
        </button>
      </header>

      <section className={styles.playfield} aria-label="Gin table">
        <div className={styles.feltMark} aria-hidden="true">
          ♣
        </div>
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
        <GinFxLayer
          fx={props.fx}
          fxKey={props.fxKey}
          rootRef={rootRef}
          localSeat={view.localSeat}
        />
      </section>

      {!view.handEnd && (
        <div className={styles.actionRail}>
          <button
            type="button"
            className="btn-fat"
            disabled={!view.canKnock || busy || view.decision !== 'act'}
            onClick={props.onKnock}
          >
            Knock
          </button>
        </div>
      )}

      {view.handEnd && !view.matchOver && (
        <HandEndSheet
          view={view}
          onReady={props.onReady}
          readySent={!view.handEnd.waitingFor.includes(view.localSeat)}
        />
      )}

      <TableMenu
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
        howToPlay={{ doc: ginHowToPlay, title: 'Gin', subtitle: 'the rummy classic' }}
        onQuit={() => {
          setMenuOpen(false);
          props.onQuit?.();
        }}
      />
    </main>
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
  const visibleCards = Math.min(displayCount, 6);
  const fanStep = visibleCards > 1 ? 20 / (visibleCards - 1) : 0;
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
      <div className={styles.opponentCards} aria-label={`${displayCount} hidden cards`}>
        {Array.from({ length: visibleCards }, (_, index) => (
          <PlayingCard
            key={index}
            compact
            faceDown
            rotation={(index - (visibleCards - 1) / 2) * fanStep}
          />
        ))}
      </div>
      <AvatarBadge
        avatarId={player.avatarId}
        size="clamp(3.2rem, 5.6vw, 4.8rem)"
        className={styles.avatar}
      />
      <div className={styles.nameplate}>
        <strong>
          {player.name}
          {player.dealer ? ' · dealer' : ''}
        </strong>
        {player.isBot && <small>bot</small>}
      </div>
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
    <div className={styles.piles} data-local-turn={!busy && view.decision !== null}>
      {!busy && view.decision !== null && (
        <span className={styles.turnIndicator} aria-hidden="true">
          Your turn
        </span>
      )}
      <button
        type="button"
        data-zone="stock"
        className={styles.pileButton}
        disabled={!view.legal.drawStock || busy}
        onClick={() => onDraw?.('stock')}
        aria-label={`Draw from stock, ${stockCount} cards remain`}
      >
        <PlayingCard faceDown />
        <span className={styles.pileCount}>{stockCount}</span>
      </button>
      <button
        type="button"
        data-zone="discard"
        className={`${styles.pileButton} ${styles.discardPile}`}
        disabled={
          optionLive ? false : !view.legal.drawDiscard || busy || visibleDiscard.length === 0
        }
        onClick={() => (optionLive ? onTakeUpcard?.() : onDraw?.('discard'))}
        aria-label={optionLive ? `Take the ${upcardFace ?? 'upcard'}` : 'Draw from discard'}
      >
        {visibleDiscard.map((card, index) => (
          <PlayingCard
            key={`${card}:${index}`}
            card={card}
            rotation={discardRotation(card, index)}
          />
        ))}
      </button>
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
    </div>
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
  const visibleHand = orderedHand(
    deal.visibleCards(view.hand, view.localSeat),
    ginCatalog.handOrder,
  );
  return (
    <HandRail
      count={visibleHand.length}
      zone={`hand:${view.localSeat}`}
      label="Your hand"
      dealState={deal.sequence ? (deal.complete ? 'complete' : 'dealing') : undefined}
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
              count={view.hand.length}
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

function GinFxLayer({
  fx,
  fxKey,
  rootRef,
  localSeat,
}: {
  fx: readonly FxEvent[];
  fxKey: string | number;
  rootRef: RefObject<HTMLElement | null>;
  localSeat: number;
}) {
  const planned = useMemo(() => {
    try {
      return { cues: buildFxTimeline(fx), error: null };
    } catch (error) {
      return {
        cues: [] as FxCue[],
        error: error instanceof Error ? error.message : 'Invalid table effect',
      };
    }
  }, [fx]);

  useFxAnimation(planned.cues, rootRef, fxKey);

  return (
    <div className={styles.fxLayer} aria-live="polite">
      {planned.error && <div className={styles.fxError}>Animation skipped: {planned.error}</div>}
      {planned.cues.map((cue) => (
        <Cue key={`${fxKey}:${cue.id}`} cue={cue} localSeat={localSeat} />
      ))}
    </div>
  );
}

function Cue({ cue, localSeat }: { cue: FxCue; localSeat: number }) {
  if (cue.type === 'deal' || cue.type === 'flip' || cue.type === 'draw') {
    const faceDown = cue.type === 'deal' && cue.to !== `hand:${localSeat}` && cue.to !== 'discard';
    return (
      <div data-fx-cue={cue.id} data-card-flight className={styles.flyingCard}>
        <i className={styles.cardTrail} />
        <span data-flight-card className={styles.flightCardVisual}>
          <PlayingCard
            card={cue.card}
            faceDown={faceDown || (cue.type === 'draw' && cue.to !== `hand:${localSeat}`)}
          />
        </span>
        <i className={styles.cardGlint} />
      </div>
    );
  }

  if (cue.type === 'discard' || cue.type === 'layoff') {
    return (
      <div data-fx-cue={cue.id} data-card-flight className={styles.flyingCard}>
        <i className={styles.cardTrail} />
        <span data-flight-card className={styles.flightCardVisual}>
          <PlayingCard card={cue.card} faceDown={false} />
        </span>
        <i className={styles.cardGlint} />
      </div>
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
    return <span data-fx-cue={cue.id} data-seat-burst={cue.seat} className={styles.turnPop} />;
  }
  return null;
}
