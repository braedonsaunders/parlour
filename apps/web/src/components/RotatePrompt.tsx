'use client';

import { useEffect, useState } from 'react';
import styles from '@/styles/rotate.module.css';

const PORTRAIT_PHONE = '(orientation: portrait) and (max-width: 900px)';

function readOrientation(): boolean {
  if (typeof window === 'undefined') return false;
  const screenOrientation = window.screen?.orientation?.type;
  const portrait = screenOrientation
    ? screenOrientation.startsWith('portrait')
    : window.innerHeight > window.innerWidth;
  return portrait && window.matchMedia(PORTRAIT_PHONE).matches;
}

export function RotatePrompt() {
  const [blocked, setBlocked] = useState(false);

  useEffect(() => {
    const update = () => setBlocked(readOrientation());
    update();

    const query = window.matchMedia(PORTRAIT_PHONE);
    query.addEventListener('change', update);
    window.addEventListener('resize', update, { passive: true });
    window.screen?.orientation?.addEventListener?.('change', update);

    return () => {
      query.removeEventListener('change', update);
      window.removeEventListener('resize', update);
      window.screen?.orientation?.removeEventListener?.('change', update);
    };
  }, []);

  useEffect(() => {
    document.body.style.overflow = blocked ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [blocked]);

  return (
    <div
      className={`${styles.overlay} ${blocked ? styles.visible : ''}`}
      role="dialog"
      aria-modal={blocked}
      aria-label="Rotate your device"
    >
      <TiltingDiorama />
      <h2 className={styles.title}>Turn me sideways</h2>
      <p className={styles.copy}>
        parlour sets the table in landscape — give your phone a quarter turn and pull up a chair.
      </p>
    </div>
  );
}

function TiltingDiorama() {
  return (
    <svg className={styles.art} viewBox="0 0 200 200" fill="none" aria-hidden="true">
      <defs>
        <linearGradient id="rotate-frame" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#7fc0d1" />
          <stop offset="100%" stopColor="#25586e" />
        </linearGradient>
        <radialGradient id="rotate-glow">
          <stop offset="0%" stopColor="#ffd9a0" stopOpacity="0.9" />
          <stop offset="100%" stopColor="#f2b06a" stopOpacity="0" />
        </radialGradient>
      </defs>

      <rect
        x="56"
        y="16"
        width="88"
        height="168"
        rx="20"
        fill="url(#rotate-frame)"
        stroke="#152833"
        strokeWidth="5"
      />
      <rect x="66" y="30" width="68" height="140" rx="12" fill="#152833" />
      <ellipse cx="100" cy="128" rx="38" ry="16" fill="url(#rotate-glow)" />
      <ellipse cx="100" cy="128" rx="28" ry="11" fill="#2f7d7a" stroke="#a86a34" strokeWidth="4" />
      <rect
        x="86"
        y="106"
        width="16"
        height="22"
        rx="4"
        fill="#fdf6ec"
        transform="rotate(-12 94 117)"
      />
      <rect
        x="98"
        y="108"
        width="16"
        height="22"
        rx="4"
        fill="#f9e8d2"
        transform="rotate(9 106 119)"
      />
      <circle cx="100" cy="62" r="12" fill="#e29349" />
      <circle cx="82" cy="82" r="8" fill="#4ba1ba" />
      <circle cx="118" cy="82" r="8" fill="#4ba1ba" />
    </svg>
  );
}

export default RotatePrompt;
