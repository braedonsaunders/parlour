'use client';

import { useEffect, type CSSProperties } from 'react';
import { usePathname } from 'next/navigation';
import { seededRandom } from '@/components/backgrounds/primitives';
import { getGame } from '@/lib/games';
import { normalizePath, tableGameIdFor } from '@/lib/transitions/tableWipe';
import { useWipeStore } from '@/stores/wipe';
import s from '@/styles/wipe.module.css';

const SPARK_GLYPHS = ['♠', '♥', '♦', '♣'] as const;

const SPARK_TINTS = [
  'rgba(255, 236, 200, 0.95)',
  'rgba(242, 176, 106, 0.92)',
  'rgba(127, 192, 209, 0.85)',
] as const;

type Spark = { glyph: string; style: CSSProperties };

/**
 * Seeded rather than random so the tumble is the same every journey — a wipe
 * the player sees dozens of times a session reads as craft when it repeats and
 * as noise when it does not.
 */
function makeSparks(count: number): Spark[] {
  const rnd = seededRandom(0x9a17c3);
  return Array.from({ length: count }, (_, i) => ({
    glyph: SPARK_GLYPHS[i % SPARK_GLYPHS.length] ?? '♠',
    style: {
      fontSize: `${(1.5 + rnd() * 3.6).toFixed(2)}vmin`,
      color: SPARK_TINTS[i % SPARK_TINTS.length],
      // Sparks start off the left edge so they ride in behind the blade.
      '--spark-x': `${(-32 + rnd() * 16).toFixed(1)}vw`,
      '--spark-y': `${(rnd() * 96).toFixed(1)}vh`,
      '--spark-drift': `${(rnd() * 28 - 14).toFixed(1)}vh`,
      '--spark-rot': `${Math.round(rnd() * 860 - 430)}deg`,
      '--spark-peak': (0.4 + rnd() * 0.5).toFixed(2),
      '--spark-delay': `${Math.round(rnd() * 300)}ms`,
    } as CSSProperties,
  }));
}

const SPARKS = makeSparks(16);

const FAN = [
  { glyph: '♠', className: s.fanCardSpade },
  { glyph: '♥', className: s.fanCardHeart },
  { glyph: '♦', className: s.fanCardDiamond },
] as const;

/**
 * The curtain for {@link runTableWipe}.
 *
 * Mounted once at the root so it outlives the pages on either side of the
 * journey: the outgoing table unmounts and the incoming one mounts while this
 * overlay is opaque, and neither swap is ever on screen. It renders nothing at
 * all when the store is idle, so a session that never opens a table pays for a
 * single subscription and no DOM.
 */
export function WipeOverlay() {
  const pathname = usePathname();
  const status = useWipeStore((state) => state.status);
  const target = useWipeStore((state) => state.target);
  const arrived = useWipeStore((state) => state.arrived);
  const markArrived = useWipeStore((state) => state.markArrived);

  /**
   * Tells the sequence the new route is mounted underneath us. A play-again
   * push lands on the route it started from, so this fires on the same tick the
   * journey begins and that hand-off stays as quick as a fresh one.
   */
  useEffect(() => {
    if (!target || arrived) return;
    if (normalizePath(pathname ?? '/') === target) markArrived();
  }, [pathname, target, arrived, markArrived]);

  if (status === 'idle' || !target) return null;

  const gameId = tableGameIdFor(target);
  const game = gameId ? getGame(gameId) : null;

  return (
    <div className={s.overlay} data-status={status} data-testid="wipe-overlay" aria-hidden="true">
      <div className={`${s.panel} ${s.panelA}`} />
      <div className={`${s.panel} ${s.panelB}`} />
      <div className={`${s.panel} ${s.panelC}`} />

      <div className={s.blade} />

      {SPARKS.map((spark, i) => (
        <span key={i} className={s.spark} style={spark.style}>
          {spark.glyph}
        </span>
      ))}

      <div className={s.emblem}>
        <div className={s.emblemInner}>
          <div className={s.fan}>
            {FAN.map((card) => (
              <span key={card.glyph} className={`${s.fanCard} ${card.className}`}>
                {card.glyph}
              </span>
            ))}
          </div>
          {game?.subtitle ? <p className={s.kicker}>{game.subtitle}</p> : null}
          <p className={s.title}>{game?.name ?? 'parlour'}</p>
          <div className={s.rule} />
          <p className={s.sub}>
            dealing you in
            <span className={s.subDot}>.</span>
            <span className={s.subDot}>.</span>
            <span className={s.subDot}>.</span>
          </p>
        </div>
      </div>

      <div className={s.vignette} />
    </div>
  );
}

export default WipeOverlay;
