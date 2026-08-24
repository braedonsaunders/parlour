'use client';

import { useEffect, useMemo, useRef, type CSSProperties, type RefObject } from 'react';
import { type FxEvent } from '@parlour/engine';
import { gsap } from 'gsap';
import { AnimatePresence, motion } from 'motion/react';
import { getAvatar } from '@/lib/avatars';
import { getAudioManager } from '@/lib/audio/AudioManager';
import { soundCuesForFx } from '@/lib/audio/cues';
import { buildFxTimeline, type FxCue, type Zone } from '@/lib/table/fx-motion';
import { PlayingCard } from './PlayingCard';
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
  onMenu?: () => void;
};

export function TableScreen(props: TableScreenProps) {
  const { view, error } = props;
  const rootRef = useRef<HTMLElement>(null);
  useTableAudio(props.fx, props.fxKey);

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
          onClick={props.onMenu}
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
    </main>
  );
}

function useTableAudio(fx: readonly FxEvent[], fxKey: string | number) {
  useEffect(() => {
    const audio = getAudioManager();
    const timers = soundCuesForFx(fx).map((cue) =>
      window.setTimeout(() => audio.play(cue.id, { rate: cue.rate }), cue.atMs),
    );
    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, [fx, fxKey]);
}

function Seat({ player, active }: { player: TablePlayer; active: boolean }) {
  const avatar = getAvatar(player.avatarId);
  const count = player.handCount ?? player.hand.length;
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
          {Array.from({ length: count }, (_, index) => (
            <PlayingCard key={index} compact faceDown rotation={(index - (count - 1) / 2) * 9} />
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
  const visibleDiscard = view.discard.slice(-3);
  return (
    <div className={styles.piles}>
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
  return (
    <div className={styles.localHand} data-zone={`hand:${player.seat}`} aria-label="Your hand">
      <AnimatePresence initial={false} mode="popLayout">
        {player.hand.map((card, index) => (
          <motion.div
            layout
            layoutId={`card:${card}`}
            key={card}
            className={styles.handCard}
            style={{ '--fan-index': index - (player.hand.length - 1) / 2 } as CSSProperties}
            initial={{ y: 30, opacity: 0, scale: 0.9 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: -50, opacity: 0, scale: 0.9 }}
            transition={{ duration: 0.22, ease: [0.2, 0.8, 0.3, 1] }}
          >
            <div className={styles.handFan}>
              <PlayingCard
                card={card}
                disabled={!canChoose || !props.view.legal.discardCards.includes(card)}
                onClick={() => props.onDiscard?.(card)}
              />
            </div>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
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
        <PlayingCard
          card={cue.card}
          faceDown={cue.type === 'deal' && cue.to !== 'hand:0'}
          compact
        />
        <i className={styles.cardTrail} />
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

function useFxAnimation(
  cues: readonly FxCue[],
  rootRef: RefObject<HTMLElement | null>,
  key: string | number,
) {
  useEffect(() => {
    const root = rootRef.current;
    if (!root || cues.length === 0) return;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const bounds = root.getBoundingClientRect();
    const context = gsap.context(() => {
      const timeline = gsap.timeline();
      for (const cue of cues) {
        const element = root.querySelector<HTMLElement>(`[data-fx-cue="${cue.id}"]`);
        if (!element) continue;
        const start = cue.startMs / 1000;
        if (reduced) {
          timeline
            .set(element, { autoAlpha: 1 }, start)
            .set(element, { autoAlpha: 0 }, start + 0.01);
          continue;
        }
        if (cue.type === 'deal' || cue.type === 'draw' || cue.type === 'discard') {
          const from = zonePoint(cue.from, bounds.width, bounds.height);
          const to = zonePoint(cue.to, bounds.width, bounds.height);
          timeline
            .set(element, { x: from.x, y: from.y, scale: 0.88, rotate: -9, autoAlpha: 1 }, start)
            .to(
              element,
              {
                x: to.x,
                y: to.y,
                scale: 1.05,
                rotate: cue.type === 'discard' ? discardRotation(cue.card, 0) : 2,
                duration: cue.durationMs / 1000,
                ease: 'power3.out',
              },
              start,
            )
            .to(
              element,
              { scale: 0.96, duration: 0.08, ease: 'power2.inOut' },
              start + cue.durationMs / 1000,
            )
            .set(element, { autoAlpha: 0 });
        } else if (cue.type === 'knock' || cue.type === 'blitz') {
          timeline
            .fromTo(
              element,
              { autoAlpha: 0, scale: 0.2, rotate: -8 },
              {
                autoAlpha: 1,
                scale: 1.1,
                rotate: 0,
                duration: 0.22,
                ease: 'back.out(2.4)',
              },
              start,
            )
            .to(element, { scale: 1, duration: 0.12, ease: 'power2.out' })
            .to(
              element,
              { autoAlpha: 0, scale: 1.18, duration: 0.28, ease: 'power2.in' },
              start + cue.durationMs / 1000 - 0.28,
            );
          if (cue.type === 'knock') {
            timeline.to(
              root.querySelector('[data-table-screen]') ?? root,
              {
                x: 4,
                duration: 0.04,
                repeat: 3,
                yoyo: true,
                ease: 'none',
              },
              start,
            );
          }
        } else {
          const point = zonePoint(`seat:${cue.seat}`, bounds.width, bounds.height);
          timeline
            .set(element, { x: point.x, y: point.y, autoAlpha: 0, scale: 0.4 }, start)
            .to(element, { autoAlpha: 1, scale: 1.1, duration: 0.2, ease: 'back.out(2)' }, start)
            .to(
              element,
              { autoAlpha: 0, scale: 0.9, duration: 0.2 },
              start + cue.durationMs / 1000 - 0.2,
            );
        }
      }
    }, root);
    return () => context.revert();
  }, [cues, rootRef, key]);
}

function zonePoint(zone: Zone, width: number, height: number) {
  const points: Record<string, readonly [number, number]> = {
    stock: [0.43, 0.47],
    discard: [0.54, 0.47],
    'hand:0': [0.5, 0.82],
    'hand:1': [0.12, 0.48],
    'hand:2': [0.5, 0.15],
    'hand:3': [0.88, 0.48],
    'seat:0': [0.5, 0.82],
    'seat:1': [0.12, 0.48],
    'seat:2': [0.5, 0.15],
    'seat:3': [0.88, 0.48],
  };
  const [x, y] = points[zone] ?? [0.5, 0.5];
  return { x: x * width, y: y * height };
}

function discardRotation(card: string, index: number) {
  let hash = index * 13;
  for (let i = 0; i < card.length; i += 1) hash = (hash * 31 + card.charCodeAt(i)) | 0;
  return (Math.abs(hash) % 19) - 9;
}
