'use client';

import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import { preload } from 'react-dom';
import { usePathname } from 'next/navigation';
import s from '@/styles/splash.module.css';
import { seededRandom } from '@/components/backgrounds/primitives';

export const SPLASH_SESSION_KEY = 'parlour.splash.v1';

const HOLD_MS = 2500;
const FADE_MS = 550;

const SUIT_GLYPHS = ['♠', '♥', '♦', '♣'] as const;

type BurstSuit = {
  glyph: (typeof SUIT_GLYPHS)[number];
  size: string;
  color: string;
  delay: string;
  dx: string;
  dy: string;
  spinFrom: string;
  spinTo: string;
  grow: string;
  peak: string;
};

type SplashPhase = 'shown' | 'leaving' | 'gone';

function makeBurst(count: number): BurstSuit[] {
  const rnd = seededRandom(0x5b1a5);
  return Array.from({ length: count }, (_, i) => {
    const angle = (i / count) * Math.PI * 2 + rnd() * 0.5;
    const dist = 28 + rnd() * 26;
    const warm = i % 2 === 0;
    return {
      glyph: SUIT_GLYPHS[i % SUIT_GLYPHS.length] ?? '♠',
      size: `${(3 + rnd() * 4).toFixed(1)}vmin`,
      color: warm ? 'rgba(226, 147, 73, 0.85)' : 'rgba(127, 192, 209, 0.75)',
      delay: `${(0.12 + rnd() * 0.45).toFixed(2)}s`,
      dx: `${(Math.cos(angle) * dist).toFixed(1)}vmin`,
      dy: `${(Math.sin(angle) * dist * 0.8).toFixed(1)}vmin`,
      spinFrom: `${Math.round(rnd() * 60 - 30)}deg`,
      spinTo: `${Math.round(rnd() * 90 - 45)}deg`,
      grow: (1.2 + rnd() * 0.9).toFixed(2),
      peak: (0.35 + rnd() * 0.3).toFixed(2),
    };
  });
}

const BURST = makeBurst(12);

/**
 * Decided once per full page load; survives StrictMode's double effect run,
 * which would otherwise read back the session marker the first run just wrote.
 */
let shouldShowThisLoad: boolean | null = null;

export function SplashScreen() {
  preload('/parlour-logo-splash.svg', { as: 'image' });
  const pathname = usePathname();
  const [phase, setPhase] = useState<SplashPhase>('shown');
  const phaseRef = useRef<SplashPhase>('shown');
  const holdTimer = useRef<number | null>(null);
  const fadeTimer = useRef<number | null>(null);

  const dismiss = useCallback(() => {
    if (phaseRef.current !== 'shown') return;

    phaseRef.current = 'leaving';
    setPhase('leaving');

    if (holdTimer.current !== null) {
      window.clearTimeout(holdTimer.current);
      holdTimer.current = null;
    }

    fadeTimer.current = window.setTimeout(() => {
      phaseRef.current = 'gone';
      fadeTimer.current = null;
      setPhase('gone');
    }, FADE_MS);
  }, []);

  useEffect(() => {
    if (shouldShowThisLoad === null) {
      const seen = window.sessionStorage.getItem(SPLASH_SESSION_KEY);
      const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      shouldShowThisLoad = !seen && !reduced;
      window.sessionStorage.setItem(SPLASH_SESSION_KEY, '1');
    }

    if (!shouldShowThisLoad) {
      const raf = window.requestAnimationFrame(() => {
        phaseRef.current = 'gone';
        setPhase('gone');
      });
      return () => window.cancelAnimationFrame(raf);
    }

    holdTimer.current = window.setTimeout(dismiss, HOLD_MS);
    return () => {
      if (holdTimer.current !== null) window.clearTimeout(holdTimer.current);
      if (fadeTimer.current !== null) window.clearTimeout(fadeTimer.current);
    };
  }, [dismiss]);

  if (pathname !== '/' || phase === 'gone') return null;

  return (
    <div
      className={phase === 'leaving' ? `${s.overlay} ${s.leaving}` : s.overlay}
      data-testid="splash-screen"
    >
      <div className={s.rays} />
      <div className={s.bloom} />
      {BURST.map((suit, i) => (
        <span
          key={i}
          className={s.suit}
          style={
            {
              fontSize: suit.size,
              color: suit.color,
              '--delay': suit.delay,
              '--dx': suit.dx,
              '--dy': suit.dy,
              '--spin-from': suit.spinFrom,
              '--spin-to': suit.spinTo,
              '--grow': suit.grow,
              '--peak': suit.peak,
            } as CSSProperties
          }
        >
          {suit.glyph}
        </span>
      ))}
      <div className={s.sweep} />
      {/* eslint-disable-next-line @next/next/no-img-element -- static asset with baked-in SVG animation; next/image would proxy it needlessly */}
      <img className={s.logo} src="/parlour-logo-splash.svg" alt="" draggable={false} />
      <div className={s.vignette} />
      <span className={s.hint}>click or tap to continue</span>
      <button
        type="button"
        className={s.dismissTarget}
        aria-label="Continue to Parlour"
        onPointerDown={dismiss}
        onClick={dismiss}
        data-testid="splash-screen-dismiss"
      />
    </div>
  );
}

export default SplashScreen;
