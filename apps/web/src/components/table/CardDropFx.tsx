'use client';

import { useMemo, type CSSProperties } from 'react';
import type { FxEvent } from '@parlour/engine';
import { AnimatePresence, motion } from 'motion/react';
import { DROP_EFFECT_MS, dropEffectsForFx, type DropEffect } from '@/lib/table/drop-effects';
import { dropEffectScale, useTableFxStore } from '@/stores/tableFx';
import styles from '@/styles/drop-fx.module.css';

export type CardDropFxProps = {
  fx: readonly FxEvent[];
  fxKey: string | number;
  /** Drop-effect pack id — usually the game's own id. */
  packId: string;
};

/** Particle counts per shape at full intensity. */
const SPOKES: Partial<Record<DropEffect['shape'], number>> = {
  sparks: 10,
  prism: 8,
  swirl: 3,
  slash: 2,
  trade: 2,
};

/**
 * Draws each landing card's flourish over the discard pile. Positioning comes
 * from the pile's own `data-center-piles` box, so this layer never has to know
 * the table layout.
 */
export function CardDropFx({ fx, fxKey, packId }: CardDropFxProps) {
  const level = useTableFxStore((state) => state.dropEffects);
  const scale = dropEffectScale(level);
  const effects = useMemo(
    () => (scale > 0 ? dropEffectsForFx(fx, packId) : []),
    [fx, packId, scale],
  );

  if (effects.length === 0) return null;

  return (
    <div className={styles.layer} data-testid="card-drop-fx" aria-hidden="true">
      <AnimatePresence>
        {effects.map((effect) => (
          <Burst key={`${fxKey}:${effect.id}`} effect={effect} scale={scale} />
        ))}
      </AnimatePresence>
    </div>
  );
}

function Burst({ effect, scale }: { effect: DropEffect; scale: number }) {
  const intensity = effect.intensity * scale;
  const spokes = Math.max(0, Math.round((SPOKES[effect.shape] ?? 0) * scale));
  const style = {
    '--drop-color': effect.color,
    '--drop-intensity': intensity,
    '--drop-ms': `${DROP_EFFECT_MS}ms`,
  } as CSSProperties;

  return (
    <motion.span
      className={styles.burst}
      data-shape={effect.shape}
      style={style}
      initial={{ opacity: 0, scale: 0.4 }}
      animate={{ opacity: [0, 1, 0], scale: [0.4, 1 + intensity * 0.5, 1 + intensity * 0.8] }}
      exit={{ opacity: 0 }}
      transition={{
        duration: DROP_EFFECT_MS / 1000,
        delay: effect.atMs / 1000,
        times: [0, 0.25, 1],
      }}
    >
      <i className={styles.ring} />
      {Array.from({ length: spokes }, (_, index) => (
        <i
          key={index}
          className={styles.spoke}
          style={{ '--spoke-angle': `${(360 / Math.max(1, spokes)) * index}deg` } as CSSProperties}
        />
      ))}
      {effect.glyph && <b className={styles.glyph}>{effect.glyph}</b>}
    </motion.span>
  );
}
