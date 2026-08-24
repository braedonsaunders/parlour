'use client';

import { useEffect, useMemo, useRef, useState, type CSSProperties, type RefObject } from 'react';
import { type FxEvent } from '@parlour/engine';
import { AnimatePresence, motion } from 'motion/react';
import { getAvatar } from '@/lib/avatars';
import { buildFxTimeline, type FxCue } from '@/lib/table/fx-motion';
import { ownerCurrentCount } from '@/lib/table/owner-count';
import { discardRotation, useFxAnimation, useTableAudio } from './fx-animation';
import { HandRail } from './HandRail';
import { PlayingCard } from './PlayingCard';
import { TableMenu } from './TableMenu';
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
  const [menuOpen, setMenuOpen] = useState(false);
  useTableAudio(props.fx, props.fxKey);

  useEffect(() => {
    const gameWindow = window as Window & { render_game_to_text?: () => string };
    const renderGameToText = () =>
      JSON.stringify({
        coordinateSystem: 'CSS pixels; origin is top-left, x grows right, y grows down',
        game: 'blitz',
        status: error ? 'error' : view ? 'ready' : 'loading',
        error,
        activeSeat: view?.activeSeat ?? null,
        stockCount: view?.stockCount ?? null,
        discardTop: view?.discard.at(-1) ?? null,
        hand: view?.players.find(({ isLocal }) => isLocal)?.hand ?? [],
        legal: view?.legal ?? null,
        activeFx: props.fx.map(({ kind, at }) => ({ kind, at: at ?? 0 })),
      });
    gameWindow.render_game_to_text = renderGameToText;
    return () => {
      if (gameWindow.render_game_to_text === renderGameToText) {
        delete gameWindow.render_game_to_text;
      }
    };
  }, [error, props.fx, view]);

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
          <strong>Setting the table…</strong>
        </div>
      </main>
    );
  }

  return (
    <main ref={rootRef} className={styles.screen} data-table-screen>
      <header className={styles.hud}>
        <div className="pill-soft">
          <span className={styles.eyebrow}>Blitz</span>
          <strong>{view.phaseLabel}</strong>
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

      <section className={styles.playfield} aria-label="Blitz table">
        <div className={styles.feltMark} aria-hidden="true">
          31
        </div>
        {view.players.map((player) => (
          <Seat key={player.seat} player={player} active={view.activeSeat === player.seat} />
        ))}
        <Piles view={view} busy={props.busy ?? false} onDraw={props.onDraw} />
        <LocalHand {...props} view={view} />
        <FxLayer fx={props.fx} fxKey={props.fxKey} rootRef={rootRef} players={view.players} />
      </section>

      <div className={styles.actionRail}>
        <button
          type="button"
          className="btn-fat"
          disabled={!view.legal.knock || props.busy}
          onClick={props.onKnock}
        >
          Knock
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

function Seat({ player, active }: { player: TablePlayer; active: boolean }) {
  const avatar = getAvatar(player.avatarId);
  const count = player.handCount ?? player.hand.length;
  const visibleCards = Math.min(count, 5);
  const fanStep = visibleCards > 1 ? 22 / (visibleCards - 1) : 0;
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
        <div className={styles.opponentCards} aria-label={`${count} hidden cards`}>
          {Array.from({ length: visibleCards }, (_, index) => (
            <PlayingCard
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
        className={styles.avatar}
      />
      <div className={styles.nameplate}>
        <strong>{player.name}</strong>
        {player.isBot && <small>bot</small>}
      </div>
      <div className={styles.lifeRow} aria-label={`${player.lives} lives`}>
        {Array.from({ length: player.lives }, (_, index) => (
          <i key={index} />
        ))}
      </div>
    </motion.div>
  );
}

function Piles({
  view,
  busy,
  onDraw,
}: {
  view: TableView;
  busy: boolean;
  onDraw?: TableScreenProps['onDraw'];
}) {
  const visibleDiscard = view.discard.slice(0, 3).reverse();
  return (
    <div className={styles.piles} data-local-turn={!busy}>
      {!busy && (
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
        aria-label={`Draw from stock, ${view.stockCount} cards remain`}
      >
        <PlayingCard faceDown />
        <span className={styles.pileCount}>{view.stockCount}</span>
      </button>
      <button
        type="button"
        data-zone="discard"
        className={`${styles.pileButton} ${styles.discardPile}`}
        disabled={!view.legal.drawDiscard || busy || visibleDiscard.length === 0}
        onClick={() => onDraw?.('discard')}
        aria-label="Draw from discard"
      >
        {visibleDiscard.map((card, index) => (
          <PlayingCard
            key={`${card}:${index}`}
            card={card}
            rotation={discardRotation(card, index)}
          />
        ))}
      </button>
    </div>
  );
}

function LocalHand(props: TableScreenProps & { view: TableView }) {
  const player = props.view.players.find(({ isLocal }) => isLocal);
  if (!player) return null;
  const canChoose = props.view.legal.discardCards.length > 0 && !props.busy;
  const currentCount = ownerCurrentCount(props.view.players);
  return (
    <HandRail
      count={player.hand.length}
      zone={`hand:${player.seat}`}
      label="Your hand"
      accessory={
        <output className={styles.ownerCount} aria-label={`My current count: ${currentCount ?? 0}`}>
          <span>My count</span>
          <strong>{currentCount ?? 0}</strong>
        </output>
      }
    >
      <AnimatePresence initial={false} mode="popLayout">
        {player.hand.map((card, index) => {
          const fanIndex = index - (player.hand.length - 1) / 2;
          const playable = canChoose && props.view.legal.discardCards.includes(card);
          return (
            <motion.div
              layout
              layoutId={`card:${card}`}
              key={card}
              className={styles.handCard}
              data-hand-card
              data-playable={canChoose ? playable : undefined}
              style={{ '--fan-index': fanIndex, '--fan-abs': Math.abs(fanIndex) } as CSSProperties}
              initial={{ y: 24, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: -24, opacity: 0 }}
              transition={{ duration: 0.22, ease: [0.2, 0.8, 0.3, 1] }}
            >
              <div className={styles.handFan}>
                <PlayingCard
                  card={card}
                  disabled={!playable}
                  onClick={() => props.onDiscard?.(card)}
                />
              </div>
            </motion.div>
          );
        })}
      </AnimatePresence>
    </HandRail>
  );
}

function FxLayer({
  fx,
  fxKey,
  rootRef,
  players,
}: {
  fx: readonly FxEvent[];
  fxKey: string | number;
  rootRef: RefObject<HTMLElement | null>;
  players: readonly TablePlayer[];
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
        <Cue key={`${fxKey}:${cue.id}`} cue={cue} players={players} />
      ))}
    </div>
  );
}

function Cue({ cue, players }: { cue: FxCue; players: readonly TablePlayer[] }) {
  if (cue.type === 'deal' || cue.type === 'draw' || cue.type === 'discard') {
    return (
      <div data-fx-cue={cue.id} data-card-flight className={styles.flyingCard}>
        <i className={styles.cardTrail} />
        <span data-flight-card className={styles.flightCardVisual}>
          <PlayingCard card={cue.card} faceDown={cue.type === 'deal' && cue.to !== 'hand:0'} />
        </span>
        <i className={styles.cardGlint} />
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

  return <span data-fx-cue={cue.id} data-seat-burst={cue.seat} className={styles.turnPop} />;
}
