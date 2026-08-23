'use client';

import { useEffect, useRef, type CSSProperties } from 'react';
import styles from '@/styles/diorama.module.css';

type Cloud = {
  top: string;
  width: string;
  height: string;
  duration: string;
  delay: string;
  opacity: number;
};

type Mote = {
  left: string;
  duration: string;
  delay: string;
  scale: number;
};

const CLOUDS: readonly Cloud[] = [
  { top: '8%', width: '34vw', height: '9vh', duration: '132s', delay: '-14s', opacity: 0.26 },
  { top: '17%', width: '46vw', height: '11vh', duration: '178s', delay: '-96s', opacity: 0.2 },
  { top: '28%', width: '28vw', height: '7vh', duration: '104s', delay: '-52s', opacity: 0.3 },
  { top: '38%', width: '52vw', height: '10vh', duration: '206s', delay: '-160s', opacity: 0.16 },
];

const MOTES: readonly Mote[] = [
  { left: '12%', duration: '17s', delay: '-2s', scale: 0.8 },
  { left: '21%', duration: '23s', delay: '-11s', scale: 1.1 },
  { left: '30%', duration: '19s', delay: '-6s', scale: 0.6 },
  { left: '39%', duration: '26s', delay: '-17s', scale: 1 },
  { left: '47%', duration: '21s', delay: '-9s', scale: 0.7 },
  { left: '55%', duration: '28s', delay: '-21s', scale: 1.2 },
  { left: '63%', duration: '18s', delay: '-4s', scale: 0.9 },
  { left: '71%', duration: '24s', delay: '-13s', scale: 0.65 },
  { left: '80%', duration: '20s', delay: '-8s', scale: 1.05 },
  { left: '88%', duration: '30s', delay: '-25s', scale: 0.75 },
];

const PARALLAX_DEPTHS = [4, 10, 18, 26] as const;
const DAMPING = 0.06;

export function DioramaStage() {
  const stageRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
    if (reduced.matches) return;

    const layers = Array.from(stage.querySelectorAll<HTMLElement>('[data-parallax]'));

    let targetX = 0;
    let targetY = 0;
    let currentX = 0;
    let currentY = 0;
    let frame = 0;

    const onPointerMove = (event: PointerEvent) => {
      targetX = event.clientX / window.innerWidth - 0.5;
      targetY = event.clientY / window.innerHeight - 0.5;
    };

    const tick = () => {
      currentX += (targetX - currentX) * DAMPING;
      currentY += (targetY - currentY) * DAMPING;

      for (let i = 0; i < layers.length; i += 1) {
        const layer = layers[i];
        if (!layer) continue;
        const depth = PARALLAX_DEPTHS[i] ?? 0;
        layer.style.transform = `translate3d(${(-currentX * depth).toFixed(2)}px, ${(
          -currentY *
          depth *
          0.55
        ).toFixed(2)}px, 0)`;
      }

      frame = requestAnimationFrame(tick);
    };

    window.addEventListener('pointermove', onPointerMove, { passive: true });
    frame = requestAnimationFrame(tick);

    return () => {
      window.removeEventListener('pointermove', onPointerMove);
      cancelAnimationFrame(frame);
    };
  }, []);

  return (
    <div ref={stageRef} className={styles.stage} aria-hidden="true">
      <div data-parallax className={styles.layer}>
        {CLOUDS.map((cloud, i) => (
          <div
            key={i}
            className={styles.cloud}
            style={
              {
                top: cloud.top,
                width: cloud.width,
                height: cloud.height,
                opacity: cloud.opacity,
                animationDuration: cloud.duration,
                animationDelay: cloud.delay,
              } as CSSProperties
            }
          />
        ))}
      </div>

      <div data-parallax className={styles.layer}>
        <SkylineFar />
      </div>

      <div data-parallax className={styles.layer}>
        <SkylineNear />
      </div>

      <div data-parallax className={styles.layer}>
        <div className={styles.tableWrap}>
          <div className={styles.tableGlow} />
          <div className={styles.tableRim} />
          <div className={styles.tableTop} />
          <div className={styles.rimLight} />
        </div>
        <div className={styles.moteField}>
          {MOTES.map((mote, i) => (
            <span
              key={i}
              className={styles.mote}
              style={
                {
                  left: mote.left,
                  animationDuration: mote.duration,
                  animationDelay: mote.delay,
                  width: `${6 * mote.scale}px`,
                  height: `${6 * mote.scale}px`,
                } as CSSProperties
              }
            />
          ))}
        </div>
      </div>

      <div className={styles.tilt} />
      <div className={styles.vignette} />
    </div>
  );
}

function SkylineFar() {
  return (
    <svg
      className={`${styles.skyline} ${styles.skylineFar}`}
      viewBox="0 0 1600 400"
      preserveAspectRatio="none"
    >
      <defs>
        <linearGradient id="far-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#3d5b6b" />
          <stop offset="100%" stopColor="#22333f" />
        </linearGradient>
      </defs>
      <g fill="url(#far-fill)">
        <rect x="40" y="196" width="120" height="220" rx="10" />
        <rect x="188" y="150" width="86" height="266" rx="10" />
        <rect x="300" y="222" width="150" height="194" rx="12" />
        <rect x="480" y="128" width="96" height="288" rx="10" />
        <rect x="606" y="206" width="128" height="210" rx="12" />
        <rect x="768" y="164" width="104" height="252" rx="10" />
        <rect x="900" y="228" width="164" height="188" rx="14" />
        <rect x="1094" y="142" width="90" height="274" rx="10" />
        <rect x="1214" y="210" width="140" height="206" rx="12" />
        <rect x="1386" y="176" width="112" height="240" rx="10" />
      </g>
    </svg>
  );
}

function SkylineNear() {
  return (
    <svg
      className={`${styles.skyline} ${styles.skylineNear}`}
      viewBox="0 0 1600 400"
      preserveAspectRatio="none"
    >
      <defs>
        <linearGradient id="near-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#1c2f3b" />
          <stop offset="100%" stopColor="#101d26" />
        </linearGradient>
        <radialGradient id="window-lit">
          <stop offset="0%" stopColor="#ffd9a0" stopOpacity="0.95" />
          <stop offset="100%" stopColor="#f2b06a" stopOpacity="0.25" />
        </radialGradient>
      </defs>
      <g fill="url(#near-fill)">
        <path d="M0 260 h150 a16 16 0 0 1 16 16 v124 H0 Z" />
        <path d="M186 214 h132 a18 18 0 0 1 18 18 v168 H186 Z" />
        <path d="M356 286 h210 a18 18 0 0 1 18 18 v96 H356 Z" />
        <path d="M604 238 h116 a16 16 0 0 1 16 16 v146 H604 Z" />
        <path d="M760 300 h250 v100 H760 Z" />
        <path d="M1030 226 h140 a18 18 0 0 1 18 18 v156 H1030 Z" />
        <path d="M1208 292 h180 a16 16 0 0 1 16 16 v92 H1208 Z" />
        <path d="M1424 246 h176 v154 h-176 Z" />
        <rect x="252" y="176" width="10" height="42" rx="5" />
        <rect x="1088" y="188" width="8" height="40" rx="4" />
      </g>
      <g fill="url(#window-lit)">
        <rect x="212" y="248" width="18" height="24" rx="5" />
        <rect x="256" y="292" width="18" height="24" rx="5" />
        <rect x="398" y="318" width="20" height="22" rx="5" />
        <rect x="640" y="272" width="18" height="24" rx="5" />
        <rect x="836" y="332" width="22" height="22" rx="5" />
        <rect x="1064" y="262" width="18" height="26" rx="5" />
        <rect x="1120" y="316" width="18" height="24" rx="5" />
        <rect x="1268" y="324" width="20" height="22" rx="5" />
        <rect x="1478" y="284" width="20" height="26" rx="5" />
      </g>
    </svg>
  );
}

export default DioramaStage;
