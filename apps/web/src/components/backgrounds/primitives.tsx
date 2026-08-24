import type { CSSProperties } from 'react';
import s from '@/styles/scenes.module.css';

/**
 * Deterministic PRNG (mulberry32), adapted from appkit-scene. Fresh per render:
 * identical output on server, client, and StrictMode re-invocations, so seeded
 * particle layouts never cause hydration mismatches.
 */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type FieldStyle = CSSProperties & Record<`--${string}`, string>;

export function StarField({ count = 90, maxTop = 55, seed = 7 }: StarFieldProps) {
  const rnd = seededRandom(0x51a55 + seed);
  return (
    <div className={s.fill}>
      {Array.from({ length: count }, (_, i) => {
        const size = 0.8 + rnd() * 1.9;
        const style: FieldStyle = {
          left: `${(rnd() * 100).toFixed(2)}%`,
          top: `${(rnd() * maxTop).toFixed(2)}%`,
          width: size,
          height: size,
          '--dur': `${(2.2 + rnd() * 2.6).toFixed(2)}s`,
          '--delay': `${(rnd() * 4).toFixed(2)}s`,
        };
        return <span key={i} className={s.star} style={style} />;
      })}
    </div>
  );
}

type StarFieldProps = {
  count?: number;
  maxTop?: number;
  seed?: number;
};

export function EmberField({
  count = 10,
  color = '#eab271',
  seed = 3,
  spread = 30,
}: EmberFieldProps) {
  const rnd = seededRandom(0xe3be2 + seed);
  return (
    <div className={s.fill}>
      {Array.from({ length: count }, (_, i) => {
        const size = 2 + rnd() * 3.5;
        const style: FieldStyle = {
          left: `${(50 - spread / 2 + rnd() * spread).toFixed(2)}%`,
          bottom: '0%',
          width: size,
          height: size,
          background: `radial-gradient(circle, #fdf6ec 0%, ${color} 45%, rgba(226, 147, 73, 0) 80%)`,
          boxShadow: `0 0 ${Math.round(size * 2)}px ${color}`,
          '--dur': `${(2.8 + rnd() * 3).toFixed(2)}s`,
          '--delay': `${(rnd() * 4).toFixed(2)}s`,
          '--swayx': `${Math.round(rnd() * 32 - 16)}px`,
          '--lift': `${-(14 + rnd() * 14).toFixed(1)}vh`,
        };
        return <span key={i} className={s.ember} style={style} />;
      })}
    </div>
  );
}

type EmberFieldProps = {
  count?: number;
  color?: string;
  seed?: number;
  spread?: number;
};

export function Fireflies({ count = 12, color = '#cede6a', seed = 11 }: FirefliesProps) {
  const rnd = seededRandom(0xf12ef + seed);
  return (
    <div className={s.fill}>
      {Array.from({ length: count }, (_, i) => {
        const size = 2.5 + rnd() * 2.5;
        const style: FieldStyle = {
          left: `${(8 + rnd() * 84).toFixed(2)}%`,
          top: `${(38 + rnd() * 48).toFixed(2)}%`,
          width: size,
          height: size,
          background: color,
          boxShadow: `0 0 ${Math.round(size * 3)}px ${color}`,
          '--dur': `${(7 + rnd() * 6).toFixed(2)}s`,
          '--delay': `${(rnd() * 8).toFixed(2)}s`,
          '--fx': `${(rnd() * 6 - 3).toFixed(1)}vw`,
          '--fy': `${(-1 - rnd() * 3).toFixed(1)}vh`,
        };
        return <span key={i} className={s.firefly} style={style} />;
      })}
    </div>
  );
}

type FirefliesProps = {
  count?: number;
  color?: string;
  seed?: number;
};

export function SmokeWisps({
  count = 3,
  left = 50,
  bottom = 30,
  seed = 5,
  peak = 0.35,
}: SmokeWispsProps) {
  const rnd = seededRandom(0x50f7 + seed);
  return (
    <>
      {Array.from({ length: count }, (_, i) => {
        const size = 14 + rnd() * 18;
        const style: FieldStyle = {
          left: `calc(${left}% + ${Math.round(rnd() * 24 - 12)}px)`,
          bottom: `${bottom}%`,
          width: size,
          height: size,
          background: 'rgba(175, 199, 209, 0.5)',
          '--dur': `${(6.5 + rnd() * 4).toFixed(2)}s`,
          '--delay': `${(i * 2.2 + rnd()).toFixed(2)}s`,
          '--swayx': `${Math.round(rnd() * 40 - 20)}px`,
          '--lift': `${-(20 + rnd() * 12).toFixed(1)}vh`,
          '--peak': `${peak}`,
        };
        return <span key={i} className={s.wisp} style={style} />;
      })}
    </>
  );
}

type SmokeWispsProps = {
  count?: number;
  left?: number;
  bottom?: number;
  seed?: number;
  peak?: number;
};

export function DustMotes({
  count = 10,
  color = 'rgba(242, 176, 106, 0.9)',
  seed = 9,
}: DustMotesProps) {
  const rnd = seededRandom(0xd057 + seed);
  return (
    <div className={s.fill}>
      {Array.from({ length: count }, (_, i) => {
        const size = 3 + rnd() * 4;
        const style: FieldStyle = {
          left: `${(6 + rnd() * 88).toFixed(2)}%`,
          bottom: '4%',
          width: size,
          height: size,
          background: `radial-gradient(circle, ${color} 0%, rgba(242, 176, 106, 0) 70%)`,
          '--dur': `${(16 + rnd() * 14).toFixed(2)}s`,
          '--delay': `${(-rnd() * 24).toFixed(2)}s`,
        };
        return <span key={i} className={s.mote} style={style} />;
      })}
    </div>
  );
}

type DustMotesProps = {
  count?: number;
  color?: string;
  seed?: number;
};
