import type { CSSProperties } from 'react';
import s from '@/styles/scenes.module.css';
import { EmberField, Fireflies, SmokeWisps, StarField } from './primitives';

const AURORAS = [
  { left: '6%', width: '24%', from: '#2f86a1', to: '#34d399', dur: '11s', delay: '0s' },
  { left: '26%', width: '30%', from: '#7c6cf0', to: '#2f86a1', dur: '14s', delay: '-4s' },
  { left: '52%', width: '26%', from: '#34d399', to: '#7c6cf0', dur: '12s', delay: '-8s' },
  { left: '72%', width: '22%', from: '#2f86a1', to: '#34d399', dur: '15s', delay: '-2s' },
] as const;

export function CampfireScene() {
  return (
    <div className={s.scene}>
      <div data-parallax className={s.layer}>
        <div className={s.cfSky} />
        <StarField count={120} maxTop={68} seed={31} />
        {AURORAS.map((a, i) => (
          <div
            key={i}
            className={s.cfAurora}
            style={
              {
                left: a.left,
                width: a.width,
                background: `linear-gradient(180deg, transparent 0%, ${a.from}26 22%, ${a.to}3d 52%, ${a.from}1f 80%, transparent 100%)`,
                '--dur': a.dur,
                '--delay': a.delay,
              } as CSSProperties
            }
          />
        ))}
        <div className={s.cfMoon} style={{ top: '11%', right: '22%', width: 58, height: 58 }}>
          <span
            style={{
              position: 'absolute',
              left: '30%',
              top: '38%',
              width: 9,
              height: 9,
              borderRadius: '50%',
              background: 'rgba(160, 148, 122, 0.4)',
            }}
          />
          <span
            style={{
              position: 'absolute',
              left: '58%',
              top: '22%',
              width: 6,
              height: 6,
              borderRadius: '50%',
              background: 'rgba(160, 148, 122, 0.35)',
            }}
          />
          <span
            style={{
              position: 'absolute',
              left: '52%',
              top: '58%',
              width: 7,
              height: 7,
              borderRadius: '50%',
              background: 'rgba(160, 148, 122, 0.3)',
            }}
          />
        </div>
        <span
          className={s.cfShoot}
          style={{ top: '12%', left: '68%', '--dur': '13s', '--delay': '3s' } as CSSProperties}
        />
        <span
          className={s.cfShoot}
          style={{ top: '6%', left: '34%', '--dur': '19s', '--delay': '9s' } as CSSProperties}
        />
      </div>

      <div data-parallax className={s.layer}>
        <Mountains />
        <Lake />
      </div>

      <div data-parallax className={s.layer}>
        <Treeline />
      </div>

      <div data-parallax className={s.layer}>
        <div
          className={s.fill}
          style={{
            top: '72%',
            background: 'linear-gradient(180deg, #10251f 0%, #0b1a16 34%, #060f0d 100%)',
          }}
        />
        <div
          className={s.fill}
          style={{
            top: '70%',
            background:
              'linear-gradient(90deg, rgba(4, 10, 9, 0.55) 0%, transparent 32%, transparent 68%, rgba(4, 10, 9, 0.55) 100%)',
          }}
        />
        <StringLights />
        <Tent />
        <LogSeat left="59%" bottom="16%" scale={1} />
        <LogSeat left="35%" bottom="13%" scale={1.2} />
        <Campfire />
        <Fireflies count={14} seed={17} />
        <div
          className={s.firelight}
          style={{
            background:
              'radial-gradient(46% 40% at 50% 82%, rgba(226, 147, 73, 0.34) 0%, rgba(226, 147, 73, 0.1) 55%, transparent 100%)',
          }}
        />
      </div>
    </div>
  );
}

function Mountains() {
  return (
    <div style={{ position: 'absolute', left: 0, right: 0, bottom: '34%', height: '42%' }}>
      <svg width="100%" height="100%" viewBox="0 0 1440 320" preserveAspectRatio="none">
        <path
          d="M0 320 V190 L150 96 L290 214 L440 84 L600 236 L760 110 L930 226 L1080 128 L1250 244 L1360 168 L1440 236 V320 Z"
          fill="#101a2e"
          opacity="0.85"
        />
        <path d="M-40 320 L210 108 L470 320 Z" fill="#182741" />
        <path
          d="M210 108 L266 156 L238 174 L210 158 L182 176 L156 156 Z"
          fill="#5f7ea6"
          opacity="0.7"
        />
        <path d="M340 320 L640 52 L950 320 Z" fill="#1b2c49" />
        <path
          d="M640 52 L712 116 L678 138 L640 116 L600 140 L570 116 Z"
          fill="#6d8cb4"
          opacity="0.75"
        />
        <path d="M640 52 L640 116 L600 140 L570 116 Z" fill="#3d5578" opacity="0.4" />
        <path d="M840 320 L1120 96 L1400 320 Z" fill="#182741" />
        <path
          d="M1120 96 L1178 148 L1148 166 L1120 148 L1090 168 L1064 148 Z"
          fill="#5f7ea6"
          opacity="0.7"
        />
        <path d="M1200 320 L1420 170 L1640 320 Z" fill="#141f36" />
      </svg>
      <div className={s.cfMist} style={{ bottom: '-4%' }} />
    </div>
  );
}

function Lake() {
  return (
    <div
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: '22%',
        height: '13%',
        overflow: 'hidden',
      }}
    >
      <div
        className={s.fill}
        style={{ background: 'linear-gradient(180deg, #0d2135 0%, #0f2a40 55%, #0c1f30 100%)' }}
      />
      <div
        className={s.cfGlint}
        style={{
          right: '15.5%',
          top: '0%',
          width: '5%',
          height: '100%',
          transformOrigin: '50% 0%',
        }}
      />
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className={s.cfWaveWrap}
          style={{ top: `${18 + i * 26}%`, '--dur': `${22 + i * 9}s` } as CSSProperties}
        >
          <svg width="100%" height="14" viewBox="0 0 1200 14" preserveAspectRatio="none">
            <path
              d="M0 7 Q75 2 150 7 T300 7 T450 7 T600 7 T750 7 T900 7 T1050 7 T1200 7 V14 H0 Z"
              fill={i === 2 ? '#123049' : '#16395657'}
              opacity={0.35 + i * 0.2}
            />
          </svg>
        </div>
      ))}
    </div>
  );
}

function PineTree({ color, flip = false }: { color: string; flip?: boolean }) {
  return (
    <svg
      width="100%"
      height="100%"
      viewBox="0 0 52 100"
      preserveAspectRatio="xMidYMax meet"
      style={flip ? { transform: 'scaleX(-1)' } : undefined}
    >
      <rect x="23" y="82" width="6" height="18" rx="2" fill="#170f0a" />
      <path d="M26 2 L44 34 H34 L48 60 H36 L52 88 H0 L16 60 H4 L18 34 H8 Z" fill={color} />
    </svg>
  );
}

const TREES = [
  { left: '-1%', height: 32, color: '#0a1713', dur: '11s', delay: '0s' },
  { left: '5%', height: 44, color: '#0c1d17', dur: '9s', delay: '-3s' },
  { left: '13%', height: 36, color: '#0a1713', dur: '10s', delay: '-6s' },
  { right: '12%', height: 38, color: '#0a1713', dur: '12s', delay: '-2s', flip: true },
  { right: '4%', height: 48, color: '#0c1d17', dur: '9.5s', delay: '-5s', flip: true },
  { right: '-2%', height: 34, color: '#091410', dur: '11s', delay: '-8s', flip: true },
] as const;

function Treeline() {
  return (
    <>
      {TREES.map((t, i) => (
        <div
          key={i}
          className={s.sway}
          style={
            {
              position: 'absolute',
              bottom: '20%',
              left: 'left' in t ? t.left : undefined,
              right: 'right' in t ? t.right : undefined,
              width: `${(t.height * 0.52).toFixed(1)}vh`,
              height: `${t.height}vh`,
              '--dur': t.dur,
              '--delay': t.delay,
            } as CSSProperties
          }
        >
          <PineTree color={t.color} flip={'flip' in t && t.flip} />
        </div>
      ))}
    </>
  );
}

function StringLights() {
  return (
    <div style={{ position: 'absolute', left: '8%', right: '8%', top: '30%', height: '18%' }}>
      <svg width="100%" height="100%" viewBox="0 0 1200 180" preserveAspectRatio="none">
        <path d="M0 20 Q600 190 1200 12" fill="none" stroke="#2b3a3f" strokeWidth="2" />
      </svg>
      {Array.from({ length: 11 }, (_, i) => {
        const t = (i + 1) / 12;
        const sag = 4 * t * (1 - t);
        return (
          <span
            key={i}
            className={s.cfBulb}
            style={
              {
                left: `${(t * 100).toFixed(1)}%`,
                top: `${(sag * 100 + 8).toFixed(1)}%`,
                '--delay': `${(i * 0.3).toFixed(1)}s`,
              } as CSSProperties
            }
          />
        );
      })}
    </div>
  );
}

function Tent() {
  return (
    <div style={{ position: 'absolute', left: '13%', bottom: '15%', width: '17vh' }}>
      <svg width="100%" viewBox="0 0 120 82">
        <ellipse cx="60" cy="77" rx="56" ry="5" fill="#03080a" opacity="0.55" />
        <path d="M10 75 Q15 36 60 8 Q35 40 25 75 Z" fill="#25586e" />
        <path d="M110 75 Q105 36 60 8 Q85 40 95 75 Z" fill="#2f6d88" />
        <path d="M25 75 L60 12 L95 75 Z" fill="#1c4356" />
        <path className={s.cfTentGlow} d="M42 75 L60 32 L78 75 Z" fill="#f2b06a" />
        <path d="M10 75 Q60 -8 110 75" fill="none" stroke="#38596b" strokeWidth="2.5" />
        <path d="M10 75 L2 80 M110 75 L118 80" stroke="#38596b" strokeWidth="1.5" />
        <path d="M25 75 L95 75" stroke="#38596b" strokeWidth="1" strokeDasharray="4 4" />
      </svg>
    </div>
  );
}

function LogSeat({ left, bottom, scale }: { left: string; bottom: string; scale: number }) {
  return (
    <div style={{ position: 'absolute', left, bottom, width: `${8 * scale}vh` }}>
      <svg width="100%" viewBox="0 0 60 26">
        <ellipse cx="30" cy="21" rx="28" ry="5" fill="#04090a" opacity="0.5" />
        <rect x="4" y="6" width="52" height="13" rx="6.5" fill="#3b2417" />
        <rect x="4" y="4" width="52" height="13" rx="6.5" fill="#55341f" />
        <ellipse cx="52" cy="10.5" rx="5" ry="6.5" fill="#8a5a35" />
        <ellipse cx="52" cy="10.5" rx="3" ry="4.2" fill="#a8734a" />
        <path d="M10 8 H40 M12 13 H36" stroke="#3b2417" strokeWidth="1.2" strokeLinecap="round" />
      </svg>
    </div>
  );
}

function Campfire() {
  return (
    <div
      style={{
        position: 'absolute',
        left: '50%',
        bottom: '9%',
        width: '24vh',
        transform: 'translateX(-50%)',
      }}
    >
      <div
        className={s.fireGlow}
        style={{
          left: '50%',
          bottom: '8%',
          width: '160%',
          height: '120%',
          transform: 'translateX(-50%)',
          background:
            'radial-gradient(50% 50% at 50% 62%, rgba(242, 176, 106, 0.5) 0%, rgba(217, 122, 43, 0.22) 48%, transparent 78%)',
        }}
      />
      <svg width="100%" viewBox="0 0 120 96" style={{ position: 'relative', overflow: 'visible' }}>
        <ellipse cx="60" cy="88" rx="46" ry="8" fill="#03080a" opacity="0.6" />
        <g className={s.flameOuter}>
          <path
            d="M60 8 Q82 46 76 78 Q70 88 60 88 Q50 88 44 78 Q38 46 60 8"
            fill="#e29349"
            opacity="0.85"
          />
        </g>
        <g className={s.flameMid}>
          <path
            d="M60 24 Q76 50 71 80 Q66 88 60 88 Q54 88 49 80 Q44 50 60 24"
            fill="#d97a2b"
            opacity="0.95"
          />
        </g>
        <g className={s.flameCore}>
          <path
            d="M60 44 Q68 60 64 82 Q62 88 60 88 Q58 88 56 82 Q52 60 60 44"
            fill="#fdf6ec"
            opacity="0.92"
          />
        </g>
        <path d="M28 78 L88 88 L88 94 L28 84 Z" fill="#55341f" />
        <path d="M92 78 L32 88 L32 94 L92 84 Z" fill="#3b2417" />
        <path
          d="M30 79 L50 82 M62 84 L84 88"
          stroke="#241609"
          strokeWidth="1.4"
          strokeLinecap="round"
        />
        <g fill="#3d4a52">
          {Array.from({ length: 9 }, (_, i) => {
            const angle = (i / 9) * Math.PI * 2;
            return (
              <ellipse
                key={i}
                cx={60 + 42 * Math.cos(angle)}
                cy={88 + 7 * Math.sin(angle)}
                rx="7"
                ry="4.6"
              />
            );
          })}
        </g>
        <g fill="#4f6069">
          {Array.from({ length: 9 }, (_, i) => {
            const angle = (i / 9) * Math.PI * 2;
            return (
              <ellipse
                key={i}
                cx={60 + 42 * Math.cos(angle)}
                cy={86.5 + 7 * Math.sin(angle)}
                rx="5.4"
                ry="3.4"
              />
            );
          })}
        </g>
      </svg>
      <EmberField count={11} seed={23} spread={36} />
      <SmokeWisps count={3} left={50} bottom={70} seed={29} peak={0.3} />
    </div>
  );
}

export default CampfireScene;
