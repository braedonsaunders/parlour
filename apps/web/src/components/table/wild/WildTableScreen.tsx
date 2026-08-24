'use client';

import { useEffect, useMemo, useRef, useState, type CSSProperties, type RefObject } from 'react';
import { type FxEvent } from '@parlour/engine';
import { WILDPILE_COLORS, type WildpileColor } from '@parlour/game-wildpile';
import { AnimatePresence, motion } from 'motion/react';
import { getAvatar } from '@/lib/avatars';
import { WILDPILE_SFX_PACK } from '@/lib/audio/sfx';
import { useMatchTension } from '@/lib/audio/tension';
import { WILD_MATCH_PACE_MS } from '@/lib/wild/modes';
import { useMusicMood } from '@/stores/audio';
import { type DealPresentation, useDealPresentation } from '@/lib/table/deal-presentation';
import { buildFxTimeline, type FxCue } from '@/lib/table/fx-motion';
import type { WildSeatView, WildTableView } from '@/lib/wild/view';
import { discardRotation, useFxAnimation, useTableAudio } from '../fx-animation';
import { HandRail, HandRailCard } from '../HandRail';
import { TableMenu } from '../TableMenu';
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
  /** Fired only after the player confirms quitting from the shared table menu. */
  onQuit?: () => void;
};

export function WildTableScreen(props: WildTableScreenProps) {
  const { view, error } = props;
  const rootRef = useRef<HTMLElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const deal = useDealPresentation(props.fx, props.fxKey);
  useTableAudio(props.fx, props.fxKey, WILDPILE_SFX_PACK.id);

  // The pile has no clock, so the tense cue rides Wild's five-minute pace and
  // comes in for the closing minute; it releases when the hand is over.
  const tense = useMatchTension({
    expectedMs: WILD_MATCH_PACE_MS,
    running: Boolean(view) && view?.activeSeat !== null,
  });
  useMusicMood(tense ? 'tense' : null);

  useEffect(() => {
    const gameWindow = window as Window & { render_game_to_text?: () => string };
    const renderGameToText = () =>
      JSON.stringify({
        game: 'wild',
        status: error ? 'error' : view ? (deal.dealing ? 'dealing' : 'ready') : 'loading',
        error,
        localSeat: view?.localSeat ?? null,
        activeSeat: view?.activeSeat ?? null,
        decision: view?.decision ?? null,
        stockCount: view ? view.stockCount + deal.pendingStockCards : null,
        discardTop: view && deal.discardReady ? view.discard.at(-1) : null,
        hand: view ? deal.visibleCards(view.hand, view.localSeat) : [],
        playableCards: deal.dealing ? [] : (view?.legal.playCards ?? []),
      });
    gameWindow.render_game_to_text = renderGameToText;
    return () => {
      if (gameWindow.render_game_to_text === renderGameToText) {
        delete gameWindow.render_game_to_text;
      }
    };
  }, [deal, error, view]);

  if (error) {
    return (
      <main className={tableStyles.screen}>
        <div className={`${tableStyles.statusPanel} panel-soft`} role="alert">
          <strong>The table lost the thread.</strong>
          <span>{error}</span>
        </div>
      </main>
    );
  }

  if (!view) {
    return (
      <main className={tableStyles.screen} aria-busy="true">
        <div className={`${tableStyles.statusPanel} panel-soft`}>
          <span className={tableStyles.loadingPip} />
          <strong>Shuffling the pile…</strong>
        </div>
      </main>
    );
  }

  const localBusy = (props.busy ?? false) || deal.dealing;

  return (
    <main
      ref={rootRef}
      className={tableStyles.screen}
      data-table-screen
      data-deal-state={deal.sequence ? (deal.complete ? 'complete' : 'dealing') : undefined}
    >
      <header className={tableStyles.hud}>
        <div className="pill-soft">
          <span className={tableStyles.eyebrow}>Wild</span>
          <strong>{view.phaseLabel}</strong>
        </div>
        <button
          type="button"
          className={`${tableStyles.menuButton} btn-fat btn-fat--ghost`}
          aria-label="Table menu"
          aria-haspopup="dialog"
          onClick={() => setMenuOpen(true)}
        >
          •••
        </button>
      </header>

      <section className={tableStyles.playfield} aria-label="Wild table">
        <div className={tableStyles.feltMark} aria-hidden="true">
          W
        </div>
        {view.players.map((player) => (
          <Seat
            key={player.seat}
            player={player}
            active={view.activeSeat === player.seat}
            displayCount={deal.visibleCount(player.seat, player.handCount)}
          />
        ))}
        <TableBadges view={view} />
        <Piles view={view} busy={localBusy} onDraw={props.onDraw} deal={deal} />
        <LocalHand view={view} busy={localBusy} onPlay={props.onPlay} deal={deal} />
        <WildFxLayer
          fx={props.fx}
          fxKey={props.fxKey}
          localSeat={view.localSeat}
          rootRef={rootRef}
        />
        {view.decision === 'jump-in' && !localBusy && (
          <div className={`${wildStyles.jumpBanner} panel-soft`} role="alertdialog">
            <strong>Exact match — jump in?</strong>
            <button type="button" className="btn-fat btn-fat--ghost" onClick={props.onDeclineJump}>
              Pass
            </button>
          </div>
        )}
        {view.decision === 'choose-color' && !localBusy && (
          <ColorChooser onChooseColor={props.onChooseColor} />
        )}
      </section>

      <div className={tableStyles.actionRail}>
        <button
          type="button"
          className="btn-fat"
          disabled={!view.legal.draw || localBusy}
          onClick={props.onDraw}
        >
          {view.pendingDraw > 0 ? `Draw +${view.pendingDraw}` : 'Draw'}
        </button>
      </div>

      <TableMenu
        open={menuOpen}
        onClose={() => setMenuOpen(false)}
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
  player: WildSeatView;
  active: boolean;
  displayCount: number;
}) {
  const avatar = getAvatar(player.avatarId);
  const visibleCards = Math.min(displayCount, 5);
  const fanStep = visibleCards > 1 ? 22 / (visibleCards - 1) : 0;
  const style = { '--seat-accent': avatar.accent, '--seat-shade': avatar.shade } as CSSProperties;

  return (
    <motion.div
      layout
      data-seat={player.seat}
      className={`${tableStyles.seat} ${tableStyles[`seat${player.seat}`]} ${active ? tableStyles.seatActive : ''}`}
      style={style}
      animate={active ? { scale: [1, 1.06, 1.02] } : { scale: 1 }}
      transition={{ duration: 0.24, ease: [0.34, 1.56, 0.64, 1] }}
    >
      {!player.isLocal && (
        <div className={tableStyles.opponentCards} aria-label={`${displayCount} hidden cards`}>
          {Array.from({ length: visibleCards }, (_, index) => (
            <WildCard
              key={index}
              compact
              faceDown
              rotation={(index - (visibleCards - 1) / 2) * fanStep}
            />
          ))}
        </div>
      )}
      <AvatarBadge
        avatarId={player.avatarId}
        size="clamp(3.2rem, 5.6vw, 4.8rem)"
        className={tableStyles.avatar}
      />
      <div className={tableStyles.nameplate}>
        <strong>{player.name}</strong>
        {player.isBot && <small>bot</small>}
      </div>
      <span className={wildStyles.cardCount}>
        {displayCount} card{displayCount === 1 ? '' : 's'}
      </span>
    </motion.div>
  );
}

function TableBadges({ view }: { view: WildTableView }) {
  return (
    <div className={wildStyles.tableBadges} data-table-badges>
      <span
        className={wildStyles.directionChip}
        aria-label={view.direction === 1 ? 'Play moves left' : 'Play moves right'}
      >
        {view.direction === 1 ? '↻' : '↺'}
      </span>
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
    <div className={tableStyles.piles} data-center-piles data-local-turn={!busy}>
      {!busy && (
        <span className={tableStyles.turnIndicator} aria-hidden="true">
          Your turn
        </span>
      )}
      <button
        type="button"
        data-zone="stock"
        className={tableStyles.pileButton}
        disabled={!view.legal.draw || busy}
        onClick={onDraw}
        aria-label={`Draw from stock, ${stockCount} cards remain`}
      >
        <WildCard faceDown />
        <span className={tableStyles.pileCount}>{stockCount}</span>
      </button>
      <div
        data-zone="discard"
        className={`${tableStyles.pileButton} ${tableStyles.discardPile}`}
        aria-label="Discard pile"
      >
        {visibleDiscard.map((card, index) => (
          <WildCard key={`${card}:${index}`} card={card} rotation={discardRotation(card, index)} />
        ))}
      </div>
    </div>
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
  const visibleHand = deal.visibleCards(view.hand, view.localSeat);
  const canChoose = view.legal.playCards.length > 0 && !busy;
  const showLegality = !busy && view.decision !== null && view.decision !== 'choose-color';
  return (
    <HandRail
      count={visibleHand.length}
      zone={`hand:${view.localSeat}`}
      label="Your hand"
      dealState={deal.sequence ? (deal.complete ? 'complete' : 'dealing') : undefined}
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

function ColorChooser({ onChooseColor }: { onChooseColor?: (color: WildpileColor) => void }) {
  return (
    <div className={wildStyles.chooser} role="dialog" aria-label="Choose a color">
      <div className={`${wildStyles.chooserPanel} panel-soft`}>
        <strong className="font-display text-lg font-extrabold text-hearth-50">
          Call the color
        </strong>
        <div className={wildStyles.chooserRow}>
          {WILDPILE_COLORS.map((color) => (
            <button
              key={color}
              type="button"
              className={wildStyles.chooserSwatch}
              style={{ background: COLOR_SWATCH[color] }}
              aria-label={`Choose ${color}`}
              onClick={() => onChooseColor?.(color)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function WildFxLayer({
  fx,
  fxKey,
  localSeat,
  rootRef,
}: {
  fx: readonly FxEvent[];
  fxKey: string | number;
  localSeat: number;
  rootRef: RefObject<HTMLElement | null>;
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
    <div className={tableStyles.fxLayer} aria-live="polite">
      {planned.error && (
        <div className={tableStyles.fxError}>Animation skipped: {planned.error}</div>
      )}
      {planned.cues.map((cue) => (
        <Cue key={`${fxKey}:${cue.id}`} cue={cue} localSeat={localSeat} />
      ))}
    </div>
  );
}

function Cue({ cue, localSeat }: { cue: FxCue; localSeat: number }) {
  if (cue.type === 'deal' || cue.type === 'flip' || cue.type === 'draw' || cue.type === 'discard') {
    const faceDown =
      (cue.type === 'deal' && cue.to !== `hand:${localSeat}` && cue.to !== 'discard') ||
      (cue.type === 'draw' && cue.to !== `hand:${localSeat}`);
    return (
      <div data-fx-cue={cue.id} data-card-flight className={tableStyles.flyingCard}>
        <i className={tableStyles.cardTrail} />
        <span data-flight-card className={tableStyles.flightCardVisual}>
          <WildCard card={cue.card} faceDown={faceDown} />
        </span>
        <i className={tableStyles.cardGlint} />
      </div>
    );
  }
  if (cue.type === 'turn') {
    return <span data-fx-cue={cue.id} data-seat-burst={cue.seat} className={tableStyles.turnPop} />;
  }
  return null;
}
