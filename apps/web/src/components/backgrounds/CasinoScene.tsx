import type { CSSProperties } from 'react';
import s from '@/styles/scenes.module.css';
import { DustMotes, SmokeWisps } from './primitives';

export function CasinoScene() {
  return (
    <div className={s.scene}>
      <div data-parallax className={s.layer}>
        <div className={s.csWall} />
        <Wallpaper />
        <GoldTrim />
        <NeonSign />
        <Sconce left="7%" delay="0s" />
        <Sconce left="89%" delay="-1.4s" />
      </div>

      <div data-parallax className={s.layer}>
        <Chandelier left="20%" size={20} dur="8s" delay="0s" />
        <Chandelier left="64%" size={24} dur="10s" delay="-4s" />
        <div
          className={s.csCone}
          style={{ left: '16%', top: '22%', width: '24%', height: '52%' }}
        />
        <div
          className={s.csCone}
          style={{ left: '60%', top: '26%', width: '28%', height: '50%' }}
        />
        <DustMotes count={8} seed={41} color="rgba(226, 194, 137, 0.7)" />
      </div>

      <div data-parallax className={s.layer}>
        <SlotMachine />
        <Roulette />
      </div>

      <div data-parallax className={s.layer}>
        <Carpet />
        <CardTable />
        <SmokeWisps count={2} left={18} bottom={22} seed={43} peak={0.22} />
        <SmokeWisps count={2} left={84} bottom={26} seed={47} peak={0.18} />
      </div>
    </div>
  );
}

function Wallpaper() {
  return (
    <svg className={s.fill} style={{ height: '64%', opacity: 0.16 }} preserveAspectRatio="none">
      <defs>
        <pattern id="cs-damask" width="56" height="56" patternUnits="userSpaceOnUse">
          <path d="M28 6 L40 28 L28 50 L16 28 Z" fill="none" stroke="#e2c289" strokeWidth="1" />
          <circle cx="28" cy="28" r="3.5" fill="none" stroke="#e2c289" strokeWidth="0.8" />
          <path
            d="M0 28 L8 28 M48 28 L56 28 M28 0 L28 4 M28 52 L28 56"
            stroke="#e2c289"
            strokeWidth="0.8"
          />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#cs-damask)" />
    </svg>
  );
}

function GoldTrim() {
  return (
    <>
      <div
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          top: '64%',
          height: 7,
          background: 'linear-gradient(180deg, #e2c289 0%, #a67833 55%, #6d4a1c 100%)',
          boxShadow: '0 2px 10px rgba(0, 0, 0, 0.5)',
        }}
      />
      <div
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          top: 'calc(64% + 7px)',
          bottom: '26%',
          background: 'linear-gradient(180deg, #241014 0%, #180a0d 100%)',
        }}
      />
      <svg
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          top: 'calc(64% + 10px)',
          width: '100%',
          height: '5%',
          opacity: 0.5,
        }}
        preserveAspectRatio="none"
      >
        <defs>
          <pattern id="cs-wainscot" width="90" height="60" patternUnits="userSpaceOnUse">
            <rect
              x="8"
              y="8"
              width="74"
              height="44"
              rx="5"
              fill="none"
              stroke="#5c3a20"
              strokeWidth="2"
            />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#cs-wainscot)" />
      </svg>
    </>
  );
}

const NEON_DELAYS = ['0s', '-1s', '-2.4s', '2.1s', '-3.6s', '-0.6s', '1.4s'] as const;

function NeonSign() {
  return (
    <div
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        top: '11%',
        display: 'flex',
        justifyContent: 'center',
      }}
    >
      <div
        style={{
          position: 'relative',
          padding: '1.2vh 3.4vh',
          borderRadius: '3vh',
          border: '3px solid rgba(226, 194, 137, 0.4)',
          boxShadow:
            'inset 0 0 24px rgba(226, 147, 73, 0.22), 0 0 34px rgba(226, 147, 73, 0.3), 0 0 90px rgba(217, 122, 43, 0.18)',
          background: 'rgba(20, 8, 11, 0.55)',
        }}
      >
        <span className={`${s.csNeon} font-display`}>
          {'casino'.split('').map((ch, i) => (
            <span
              key={i}
              className={i === 3 ? s.csNeonLetter : undefined}
              style={i === 3 ? ({ '--delay': NEON_DELAYS[i] } as CSSProperties) : undefined}
            >
              {ch}
            </span>
          ))}
        </span>
        <div
          style={{
            display: 'flex',
            justifyContent: 'center',
            gap: '1.6vh',
            marginTop: '0.3vh',
            fontSize: 'clamp(0.8rem, 2vw, 1.3rem)',
          }}
        >
          {(['♠', '♥', '♦', '♣'] as const).map((suit, i) => (
            <span
              key={suit}
              className={s.warmFlicker}
              style={
                {
                  color: i % 2 === 1 ? '#ff9d7a' : '#9fdcef',
                  textShadow:
                    i % 2 === 1
                      ? '0 0 8px rgba(255, 157, 122, 0.9), 0 0 22px rgba(226, 106, 73, 0.6)'
                      : '0 0 8px rgba(159, 220, 239, 0.9), 0 0 22px rgba(79, 168, 199, 0.6)',
                  '--delay': `${i * 0.8}s`,
                } as CSSProperties
              }
            >
              {suit}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

function Sconce({ left, delay }: { left: string; delay: string }) {
  return (
    <div style={{ position: 'absolute', left, top: '30%', width: '4vh' }}>
      <svg width="100%" viewBox="0 0 40 70" style={{ overflow: 'visible' }}>
        <path d="M20 42 Q6 40 8 26 Q14 34 20 32 Q26 34 32 26 Q34 40 20 42" fill="#a67833" />
        <rect x="17" y="42" width="6" height="14" rx="3" fill="#6d4a1c" />
        <ellipse
          className={s.warmFlicker}
          cx="20"
          cy="22"
          rx="9"
          ry="12"
          fill="#f2b06a"
          opacity="0.8"
        />
        <ellipse cx="20" cy="26" rx="4" ry="6" fill="#fdf6ec" />
      </svg>
      <div
        className={s.warmFlicker}
        style={
          {
            position: 'absolute',
            left: '50%',
            top: '-10vh',
            width: '18vh',
            height: '22vh',
            transform: 'translateX(-50%)',
            background:
              'radial-gradient(50% 50% at 50% 50%, rgba(242, 176, 106, 0.2) 0%, transparent 70%)',
            '--delay': delay,
          } as CSSProperties
        }
      />
    </div>
  );
}

function Chandelier({
  left,
  size,
  dur,
  delay,
}: {
  left: string;
  size: number;
  dur: string;
  delay: string;
}) {
  return (
    <div
      className={s.csChandelier}
      style={
        {
          position: 'absolute',
          left,
          top: '4%',
          width: `${size}vh`,
          '--dur': dur,
          '--delay': delay,
        } as CSSProperties
      }
    >
      <svg width="100%" viewBox="0 0 120 110" style={{ overflow: 'visible' }}>
        <line x1="60" y1="0" x2="60" y2="26" stroke="#a67833" strokeWidth="2.5" />
        <path
          d="M60 26 Q24 34 20 58 M60 26 Q96 34 100 58 M60 26 Q42 40 40 62 M60 26 Q78 40 80 62 M60 26 L60 66"
          fill="none"
          stroke="#c99b52"
          strokeWidth="3"
          strokeLinecap="round"
        />
        {[
          { x: 20, y: 58 },
          { x: 40, y: 62 },
          { x: 60, y: 66 },
          { x: 80, y: 62 },
          { x: 100, y: 58 },
        ].map((c, i) => (
          <g key={i}>
            <rect x={c.x - 2.5} y={c.y - 8} width="5" height="8" rx="1.5" fill="#fdf6ec" />
            <ellipse
              className={s.snCandle}
              style={{ '--delay': `${i * 0.22}s` } as CSSProperties}
              cx={c.x}
              cy={c.y - 12}
              rx="3.4"
              ry="5.4"
              fill="#f2b06a"
            />
            <path d={`M${c.x} ${c.y} q-3 7 0 12 q3 -5 0 -12`} fill="#d7edf2" opacity="0.65" />
          </g>
        ))}
        <ellipse
          className={s.warmFlicker}
          cx="60"
          cy="52"
          rx="58"
          ry="30"
          fill="rgba(242, 176, 106, 0.13)"
        />
      </svg>
    </div>
  );
}

const REEL_SYMBOLS = ['♠', '7', '♥', '★'] as const;

function SlotMachine() {
  return (
    <div style={{ position: 'absolute', left: '7%', bottom: '26%', width: '20vh' }}>
      <svg width="100%" viewBox="0 0 120 170" style={{ overflow: 'visible' }}>
        <ellipse cx="60" cy="164" rx="54" ry="6" fill="#03060a" opacity="0.6" />
        <rect
          x="12"
          y="30"
          width="96"
          height="132"
          rx="10"
          fill="#4a1a26"
          stroke="#a67833"
          strokeWidth="2.5"
        />
        <path
          d="M12 60 Q60 8 108 60 V44 Q60 -6 12 44 Z"
          fill="#5c2230"
          stroke="#a67833"
          strokeWidth="2"
        />
        {Array.from({ length: 7 }, (_, i) => {
          const t = i / 6;
          const x = 18 + t * 84;
          const y = 40 - Math.sin(t * Math.PI) * 22;
          return (
            <circle
              key={i}
              className={s.csBulb}
              style={{ '--delay': `${i * 0.2}s` } as CSSProperties}
              cx={x}
              cy={y}
              r="3.4"
              fill="#f9e8d2"
            />
          );
        })}
        <rect
          x="22"
          y="66"
          width="76"
          height="34"
          rx="5"
          fill="#120609"
          stroke="#e2c289"
          strokeWidth="1.5"
        />
        {[0, 1, 2].map((r) => (
          <g key={r}>
            <clipPath id={`cs-reel-${r}`}>
              <rect x={26 + r * 24.5} y={69} width="20" height="28" rx="3" />
            </clipPath>
            <rect x={26 + r * 24.5} y={69} width="20" height="28" rx="3" fill="#fdf6ec" />
            <g clipPath={`url(#cs-reel-${r})`}>
              <g
                className={s.csReelStrip}
                style={{ '--dur': `${6 + r * 1.7}s`, '--delay': `${-r * 1.2}s` } as CSSProperties}
              >
                {[...REEL_SYMBOLS, ...REEL_SYMBOLS].map((sym, i) => (
                  <text
                    key={i}
                    x={36 + r * 24.5}
                    y={90 + i * 28}
                    textAnchor="middle"
                    fontSize="17"
                    fontWeight="700"
                    fill={sym === '♥' || sym === '7' ? '#bd5f20' : '#25586e'}
                  >
                    {sym}
                  </text>
                ))}
              </g>
            </g>
          </g>
        ))}
        <rect
          x="34"
          y="108"
          width="52"
          height="12"
          rx="6"
          fill="#120609"
          stroke="#a67833"
          strokeWidth="1.2"
        />
        <text
          x="60"
          y="117.5"
          textAnchor="middle"
          fontSize="9"
          fontWeight="800"
          fill="#e2c289"
          letterSpacing="1.5"
        >
          777
        </text>
        <rect
          x="26"
          y="128"
          width="68"
          height="20"
          rx="4"
          fill="#33121c"
          stroke="#6d4a1c"
          strokeWidth="1.2"
        />
        <ellipse cx="60" cy="138" rx="20" ry="5" fill="#0d0508" />
        <line
          x1="108"
          y1="72"
          x2="118"
          y2="52"
          stroke="#a67833"
          strokeWidth="3.5"
          strokeLinecap="round"
        />
        <circle cx="118" cy="50" r="5" fill="#bd2f3a" />
      </svg>
    </div>
  );
}

const WHEEL_SEGMENTS = Array.from({ length: 14 }, (_, i) => {
  const start = i * (360 / 14);
  const end = start + 360 / 14;
  return { start, end, color: i % 2 === 0 ? '#7a1f2b' : '#1a2027' };
});

function wedgePath(start: number, end: number): string {
  const r = 44;
  const a1 = (start * Math.PI) / 180;
  const a2 = (end * Math.PI) / 180;
  return `M60 60 L${60 + r * Math.cos(a1)} ${60 + r * Math.sin(a1)} A${r} ${r} 0 0 1 ${60 + r * Math.cos(a2)} ${60 + r * Math.sin(a2)} Z`;
}

function Roulette() {
  return (
    <div
      style={{
        position: 'absolute',
        right: '8%',
        bottom: '27%',
        width: '24vh',
        perspective: '60vh',
      }}
    >
      <div style={{ transform: 'rotateX(52deg)', transformStyle: 'preserve-3d' }}>
        <svg width="100%" viewBox="0 0 120 120" style={{ overflow: 'visible' }}>
          <circle cx="60" cy="60" r="56" fill="#55341f" stroke="#6d4a1c" strokeWidth="3" />
          <circle cx="60" cy="60" r="49" fill="#241609" />
          <g className={s.csWheel} style={{ transformOrigin: '60px 60px' }}>
            {WHEEL_SEGMENTS.map((seg, i) => (
              <path key={i} d={wedgePath(seg.start, seg.end)} fill={seg.color} />
            ))}
            <circle cx="60" cy="60" r="18" fill="#a67833" />
            <circle cx="60" cy="60" r="12" fill="#e2c289" />
            <path d="M60 44 L64 60 L60 76 L56 60 Z M44 60 L60 56 L76 60 L60 64 Z" fill="#6d4a1c" />
          </g>
          <g className={s.csBallRing} style={{ transformOrigin: '60px 60px' }}>
            <circle cx="60" cy="21" r="3.2" fill="#fdf6ec" />
          </g>
          <circle cx="60" cy="60" r="49" fill="none" stroke="#c99b52" strokeWidth="1.6" />
        </svg>
      </div>
      <div
        style={{
          position: 'absolute',
          left: '50%',
          bottom: '-4vh',
          width: '120%',
          height: '5vh',
          transform: 'translateX(-50%)',
          borderRadius: '50%',
          background:
            'radial-gradient(50% 50% at 50% 50%, rgba(3, 6, 10, 0.6) 0%, transparent 75%)',
        }}
      />
    </div>
  );
}

const CHIP_STACKS = [
  { left: '27%', bottom: '46%', color: '#bd2f3a', count: 4 },
  { left: '33%', bottom: '38%', color: '#25586e', count: 3 },
  { left: '66%', bottom: '48%', color: '#e2c289', count: 5 },
  { left: '61%', bottom: '37%', color: '#2c6e4f', count: 3 },
] as const;

function CardTable() {
  return (
    <div
      style={{
        position: 'absolute',
        left: '50%',
        bottom: '-6%',
        width: 'min(86vh, 94vw)',
        aspectRatio: '16 / 6',
        transform: 'translateX(-50%)',
      }}
    >
      <div
        style={{
          position: 'absolute',
          inset: '2% 0 0 0',
          borderRadius: '50% 50% 0 0 / 100% 100% 0 0',
          background: 'linear-gradient(180deg, #a67833 0%, #6d4a1c 26%, #55341f 100%)',
          boxShadow: '0 -14px 44px rgba(3, 6, 10, 0.65)',
        }}
      />
      <div
        style={{
          position: 'absolute',
          inset: '9% 4% 0 4%',
          borderRadius: '50% 50% 0 0 / 100% 100% 0 0',
          overflow: 'hidden',
          background: 'radial-gradient(70% 90% at 50% 30%, #2c6e4f 0%, #1d5c46 46%, #14453a 100%)',
          boxShadow: 'inset 0 10px 34px rgba(3, 10, 8, 0.6)',
        }}
      >
        <div
          style={{
            position: 'absolute',
            inset: '14% 10% 0 10%',
            borderRadius: '50% 50% 0 0 / 100% 100% 0 0',
            border: '2px solid rgba(226, 194, 137, 0.35)',
          }}
        />
        <div className={s.csSheen} />
      </div>
      {CHIP_STACKS.map((stack, i) => (
        <div
          key={i}
          style={{ position: 'absolute', left: stack.left, bottom: stack.bottom, width: '4.6vh' }}
        >
          <svg width="100%" viewBox="0 0 40 46" style={{ overflow: 'visible' }}>
            {Array.from({ length: stack.count }, (_, c) => (
              <g key={c} transform={`translate(0 ${38 - c * 6})`}>
                <ellipse cx="20" cy="4" rx="17" ry="6" fill={stack.color} />
                <ellipse
                  cx="20"
                  cy="2.5"
                  rx="17"
                  ry="6"
                  fill={stack.color}
                  stroke="#fdf6ec"
                  strokeWidth="1.4"
                  strokeDasharray="5 6"
                />
              </g>
            ))}
          </svg>
        </div>
      ))}
      <FannedCards left="43%" bottom="34%" />
    </div>
  );
}

function FannedCards({ left, bottom }: { left: string; bottom: string }) {
  return (
    <div style={{ position: 'absolute', left, bottom, width: '13vh' }}>
      <svg width="100%" viewBox="0 0 110 70" style={{ overflow: 'visible' }}>
        {[-16, 0, 16].map((angle, i) => (
          <g key={i} transform={`rotate(${angle} 55 92)`}>
            <rect
              x="40"
              y="6"
              width="30"
              height="42"
              rx="4"
              fill="#fdf6ec"
              stroke="#d9a856"
              strokeWidth="1.4"
            />
            <text
              x="55"
              y="33"
              textAnchor="middle"
              fontSize="16"
              fontWeight="700"
              fill={i === 1 ? '#bd5f20' : '#25586e'}
            >
              {i === 0 ? '♠' : i === 1 ? '♥' : '♣'}
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
}

function Carpet() {
  return (
    <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: '26%' }}>
      <div
        className={s.fill}
        style={{ background: 'linear-gradient(180deg, #26333d 0%, #1d2831 60%, #141c23 100%)' }}
      />
      <svg className={s.fill} style={{ opacity: 0.2 }} preserveAspectRatio="none">
        <defs>
          <pattern id="cs-carpet" width="48" height="34" patternUnits="userSpaceOnUse">
            <path d="M24 2 L44 17 L24 32 L4 17 Z" fill="none" stroke="#96471c" strokeWidth="1.6" />
            <circle cx="24" cy="17" r="2.6" fill="#d9a856" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#cs-carpet)" />
      </svg>
    </div>
  );
}

export default CasinoScene;
