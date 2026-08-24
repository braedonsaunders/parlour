import type { CSSProperties } from 'react';
import s from '@/styles/scenes.module.css';
import { DustMotes, EmberField, seededRandom } from './primitives';

export function SnugScene() {
  return (
    <div className={s.scene}>
      <div data-parallax className={s.layer}>
        <div className={s.snWall} />
        <Wallpaper />
        <Wainscot />
        <RainyWindow />
      </div>

      <div data-parallax className={s.layer}>
        <Fireplace />
        <Bookshelf />
        <WallClock />
      </div>

      <div data-parallax className={s.layer}>
        <FloorAndRug />
        <Armchair />
        <SideTable />
        <RecordPlayer />
      </div>

      <div data-parallax className={s.layer}>
        <DustMotes count={9} seed={53} />
        <div
          className={s.firelight}
          style={{
            background:
              'radial-gradient(42% 44% at 30% 72%, rgba(226, 147, 73, 0.3) 0%, rgba(226, 147, 73, 0.08) 55%, transparent 100%)',
          }}
        />
      </div>
    </div>
  );
}

function Wallpaper() {
  return (
    <svg className={s.fill} style={{ height: '68%', opacity: 0.18 }} preserveAspectRatio="none">
      <defs>
        <pattern id="sn-paper" width="44" height="52" patternUnits="userSpaceOnUse">
          <path d="M22 6 Q30 16 22 26 Q14 16 22 6" fill="none" stroke="#7fc0d1" strokeWidth="1" />
          <path d="M0 40 Q11 33 22 40 Q33 47 44 40" fill="none" stroke="#7fc0d1" strokeWidth="0.8" />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#sn-paper)" />
    </svg>
  );
}

function Wainscot() {
  return (
    <>
      <div
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          top: '68%',
          height: 6,
          background: 'linear-gradient(180deg, #8a5a35 0%, #55341f 60%, #3b2417 100%)',
        }}
      />
      <div
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          top: 'calc(68% + 6px)',
          bottom: '24%',
          background: 'linear-gradient(180deg, #46301d 0%, #34220f 100%)',
        }}
      />
      <svg
        style={{
          position: 'absolute',
          left: 0,
          right: 0,
          top: 'calc(68% + 8px)',
          width: '100%',
          height: '8%',
          opacity: 0.28,
        }}
        preserveAspectRatio="none"
        viewBox="0 0 1440 72"
      >
        {Array.from({ length: 18 }, (_, i) => (
          <rect key={i} x={8 + i * 80} y="10" width="64" height="52" rx="5" fill="none" stroke="#241609" strokeWidth="3" />
        ))}
      </svg>
    </>
  );
}

const RAIN = Array.from({ length: 16 }, (_, i) => i);
const TRICKLES = [
  { left: '18%', dur: '8s', delay: '1s' },
  { left: '46%', dur: '11s', delay: '5s' },
  { left: '74%', dur: '9s', delay: '3s' },
] as const;

function RainyWindow() {
  const rnd = seededRandom(0x9a17);
  return (
    <div style={{ position: 'absolute', right: '9%', top: '10%', width: '24vh', height: '34vh' }}>
      <div
        style={{
          position: 'absolute',
          inset: '-4% -6%',
          borderRadius: '2.4vh 2.4vh 0.8vh 0.8vh',
          background: 'linear-gradient(180deg, #55341f 0%, #3b2417 100%)',
          boxShadow: '0 8px 30px rgba(4, 8, 12, 0.5)',
        }}
      />
      <div
        style={{
          position: 'absolute',
          inset: 0,
          borderRadius: '1.8vh 1.8vh 0 0',
          overflow: 'hidden',
          background: 'linear-gradient(180deg, #060d16 0%, #0b1a2b 58%, #12283a 100%)',
        }}
      >
        <div className={s.snLightning} />
        <span
          style={{
            position: 'absolute',
            left: '16%',
            top: '13%',
            width: '3vh',
            height: '3vh',
            borderRadius: '50%',
            background: 'radial-gradient(circle at 40% 35%, #fdf6ec 0%, #cbbfa6 70%)',
            boxShadow: '0 0 18px 5px rgba(253, 246, 236, 0.2)',
          }}
        />
        <svg style={{ position: 'absolute', left: 0, bottom: '18%', width: '100%', height: '26%' }} preserveAspectRatio="none" viewBox="0 0 100 30">
          <path d="M0 30 V16 L14 8 L26 18 L40 6 L56 20 L70 10 L84 20 L100 12 V30 Z" fill="#0a141f" />
        </svg>
        <div
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            bottom: 0,
            height: '20%',
            background: 'linear-gradient(180deg, transparent 0%, rgba(13, 26, 33, 0.85) 100%)',
          }}
        />
        {RAIN.map((i) => {
          const style: CSSProperties & Record<string, string> = {
            left: `${(rnd() * 100).toFixed(1)}%`,
            top: '0',
            height: `${Math.round(16 + rnd() * 22)}%`,
            '--dur': `${(0.9 + rnd() * 0.9).toFixed(2)}s`,
            '--delay': `${(-rnd() * 3).toFixed(2)}s`,
          };
          return <span key={i} className={s.snRainDrop} style={style} />;
        })}
        {TRICKLES.map((t, i) => (
          <span
            key={i}
            className={s.snTrickle}
            style={{ left: t.left, top: '4%', '--dur': t.dur, '--delay': t.delay } as CSSProperties}
          />
        ))}
      </div>
      <div style={{ position: 'absolute', left: '48.5%', top: 0, bottom: 0, width: '3%', background: '#3b2417' }} />
      <div style={{ position: 'absolute', left: 0, right: 0, top: '46%', height: '5%', background: '#3b2417' }} />
      <div
        style={{
          position: 'absolute',
          left: '-10%',
          right: '-10%',
          bottom: '-7%',
          height: '5%',
          borderRadius: '1vh',
          background: 'linear-gradient(180deg, #6d4a2c 0%, #46301d 100%)',
        }}
      />
    </div>
  );
}

function Fireplace() {
  return (
    <div style={{ position: 'absolute', left: '5%', bottom: '19%', width: '44vh' }}>
      <svg width="100%" viewBox="0 0 200 150" style={{ overflow: 'visible' }}>
        <rect x="0" y="18" width="200" height="14" rx="4" fill="#55341f" />
        <rect x="4" y="15" width="192" height="7" rx="3" fill="#8a5a35" />
        <rect x="10" y="32" width="180" height="118" fill="#4a3325" />
        <g fill="#5c4130">
          {Array.from({ length: 6 }, (_, row) =>
            Array.from({ length: 5 }, (_, col) => (
              <rect
                key={`${row}-${col}`}
                x={12 + col * 36 + (row % 2 === 0 ? 0 : 18)}
                y={34 + row * 19}
                width="33"
                height="16"
                rx="2"
              />
            )),
          )}
        </g>
        <path d="M40 150 V72 Q40 46 100 46 Q160 46 160 72 V150 Z" fill="#120a06" />
        <path d="M40 150 V72 Q40 46 100 46 Q160 46 160 72 V150" fill="none" stroke="#241609" strokeWidth="5" />
        <g transform="translate(100 132)">
          <path d="M-34 8 L34 16 M34 8 L-34 16" stroke="#3b2417" strokeWidth="7" strokeLinecap="round" />
          <g className={s.flameOuter}>
            <path d="M0 -52 Q20 -22 16 4 Q10 12 0 12 Q-10 12 -16 4 Q-20 -22 0 -52" fill="#e29349" opacity="0.9" />
          </g>
          <g className={s.flameMid}>
            <path d="M0 -38 Q14 -16 11 6 Q7 12 0 12 Q-7 12 -11 6 Q-14 -16 0 -38" fill="#d97a2b" />
          </g>
          <g className={s.flameCore}>
            <path d="M0 -22 Q7 -8 5 8 Q3 12 0 12 Q-3 12 -5 8 Q-7 -8 0 -22" fill="#fdf6ec" opacity="0.92" />
          </g>
        </g>
        <MantelClutter />
      </svg>
      <div
        className={s.fireGlow}
        style={{
          left: '50%',
          bottom: '2%',
          width: '86%',
          height: '52%',
          transform: 'translateX(-50%)',
          background:
            'radial-gradient(50% 55% at 50% 78%, rgba(242, 176, 106, 0.45) 0%, rgba(217, 122, 43, 0.16) 52%, transparent 80%)',
        }}
      />
      <EmberField count={7} seed={59} spread={26} />
    </div>
  );
}

function MantelClutter() {
  return (
    <g>
      <g transform="translate(30 0)">
        <rect x="-3" y="4" width="6" height="11" rx="1.5" fill="#a67833" />
        <rect x="-1.6" y="-2" width="3.2" height="7" fill="#fdf6ec" />
        <ellipse className={s.snCandle} cx="0" cy="-5" rx="2.4" ry="4" fill="#f2b06a" />
      </g>
      <g transform="translate(168 0)">
        <rect x="-3" y="4" width="6" height="11" rx="1.5" fill="#a67833" />
        <rect x="-1.6" y="-4" width="3.2" height="9" fill="#fdf6ec" />
        <ellipse className={s.snCandle} style={{ '--delay': '-0.5s' } as CSSProperties} cx="0" cy="-7" rx="2.4" ry="4" fill="#f2b06a" />
      </g>
      <g transform="translate(100 -1)">
        <rect x="-16" y="-16" width="32" height="31" rx="3" fill="#6d4a2c" />
        <rect x="-12" y="-12" width="24" height="23" rx="2" fill="#fdf6ec" />
        <text x="0" y="6" textAnchor="middle" fontSize="15" fontWeight="700" fill="#bd5f20">
          ♥
        </text>
      </g>
      <g transform="translate(62 2)">
        <rect x="-8" y="-6" width="16" height="21" rx="2" fill="#25586e" transform="rotate(-8)" />
        <rect x="-6" y="-9" width="16" height="21" rx="2" fill="#96471c" transform="rotate(5)" />
      </g>
    </g>
  );
}

const BOOK_COLORS = ['#96471c', '#25586e', '#62301b', '#2c6e4f', '#bd5f20', '#244a5c', '#78391d'] as const;

function Bookshelf() {
  const rnd = seededRandom(0xb00c);
  return (
    <div style={{ position: 'absolute', left: '58%', bottom: '20%', width: '19vh' }}>
      <svg width="100%" viewBox="0 0 100 150">
        <rect x="0" y="0" width="100" height="150" rx="4" fill="#3b2417" />
        <rect x="6" y="8" width="88" height="134" fill="#241609" />
        {[0, 1, 2].map((shelf) => (
          <g key={shelf} transform={`translate(0 ${10 + shelf * 44})`}>
            <rect x="6" y="38" width="88" height="5" fill="#55341f" />
            {Array.from({ length: 7 }, (_, b) => {
              const h = 24 + Math.round(rnd() * 10);
              const tilt = rnd() > 0.82 ? -8 : 0;
              return (
                <rect
                  key={b}
                  x={10 + b * 12}
                  y={38 - h}
                  width="10"
                  height={h}
                  rx="1.5"
                  fill={BOOK_COLORS[(shelf * 7 + b) % BOOK_COLORS.length]}
                  transform={tilt ? `rotate(${tilt} ${10 + b * 12} 38)` : undefined}
                />
              );
            })}
          </g>
        ))}
      </svg>
    </div>
  );
}

function WallClock() {
  return (
    <div style={{ position: 'absolute', left: '30%', top: '15%', width: '9vh' }}>
      <svg width="100%" viewBox="0 0 60 110" style={{ overflow: 'visible' }}>
        <rect x="10" y="0" width="40" height="74" rx="6" fill="#55341f" />
        <rect x="14" y="4" width="32" height="66" rx="4" fill="#3b2417" />
        <circle cx="30" cy="24" r="15" fill="#f9e8d2" stroke="#a67833" strokeWidth="2.5" />
        <path d="M30 24 L30 14 M30 24 L37 27" stroke="#241609" strokeWidth="2" strokeLinecap="round" />
        <circle cx="30" cy="24" r="1.8" fill="#241609" />
        <g className={s.snPendulum} style={{ transformOrigin: '30px 42px' }}>
          <line x1="30" y1="42" x2="30" y2="62" stroke="#c99b52" strokeWidth="2" />
          <circle cx="30" cy="64" r="5" fill="#e2c289" />
        </g>
      </svg>
    </div>
  );
}

function FloorAndRug() {
  return (
    <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: '24%' }}>
      <div
        className={s.fill}
        style={{ background: 'linear-gradient(180deg, #46301d 0%, #34220f 55%, #241609 100%)' }}
      />
      <svg className={s.fill} style={{ opacity: 0.3 }} preserveAspectRatio="none" viewBox="0 0 1440 200">
        {Array.from({ length: 6 }, (_, row) => (
          <path
            key={row}
            d={`M0 ${18 + row * 34} H1440 ${row % 2 === 0 ? `M${180 + row * 210} ${18 + row * 34} v34 M${760 + row * 160} ${18 + row * 34} v34` : `M${420 + row * 180} ${18 + row * 34} v34 M${1080 - row * 90} ${18 + row * 34} v34`}`}
            stroke="#241609"
            strokeWidth="3"
            fill="none"
          />
        ))}
      </svg>
      <div
        style={{
          position: 'absolute',
          left: '50%',
          bottom: '6%',
          width: '64%',
          height: '62%',
          transform: 'translateX(-50%)',
          borderRadius: '50%',
          background: 'radial-gradient(50% 50% at 50% 50%, #96471c 0%, #78391d 58%, #62301b 100%)',
          border: '4px solid #d9a85655',
          boxShadow: 'inset 0 0 26px rgba(20, 8, 4, 0.5)',
        }}
      />
    </div>
  );
}

function Armchair() {
  return (
    <div style={{ position: 'absolute', right: '20%', bottom: '10%', width: '26vh' }}>
      <svg width="100%" viewBox="0 0 170 130" style={{ overflow: 'visible' }}>
        <ellipse cx="85" cy="124" rx="76" ry="8" fill="#03070a" opacity="0.5" />
        <path d="M20 118 V56 Q20 30 46 30 H124 Q150 30 150 56 V118 Z" fill="#25586e" />
        <path d="M20 118 V56 Q20 30 46 30 H124 Q150 30 150 56 V118" fill="none" stroke="#1c4356" strokeWidth="4" />
        <rect x="34" y="70" width="102" height="30" rx="12" fill="#2f6d88" />
        <path d="M14 74 Q4 74 4 88 Q4 104 18 104 L26 104 V118 H14 Z" fill="#1c4356" />
        <path d="M156 74 Q166 74 166 88 Q166 104 152 104 L144 104 V118 H156 Z" fill="#1c4356" />
        <rect x="26" y="100" width="118" height="20" rx="8" fill="#244a5c" />
        <rect x="30" y="120" width="10" height="8" rx="2" fill="#241609" />
        <rect x="130" y="120" width="10" height="8" rx="2" fill="#241609" />
        <Cat />
      </svg>
      <span className={s.snZzz} style={{ right: '26%', top: '18%', fontSize: '2vh', '--delay': '0s' } as CSSProperties}>
        z
      </span>
      <span className={s.snZzz} style={{ right: '21%', top: '14%', fontSize: '1.5vh', '--delay': '1.6s' } as CSSProperties}>
        z
      </span>
    </div>
  );
}

function Cat() {
  return (
    <g transform="translate(85 84)">
      <g className={s.snTail} style={{ transformOrigin: '-30px 6px' }}>
        <path d="M-28 8 Q-48 4 -46 -10 Q-45 -18 -38 -16" fill="none" stroke="#d97a2b" strokeWidth="7" strokeLinecap="round" />
      </g>
      <g className={s.snCat}>
        <ellipse cx="0" cy="0" rx="34" ry="18" fill="#e29349" />
        <path d="M-6 -14 Q0 -22 8 -15 Q20 -22 26 -12 Q32 -2 22 2 Q10 6 -2 0 Q-8 -6 -6 -14" fill="#eab271" />
        <circle cx="20" cy="-8" r="11" fill="#e29349" />
        <path d="M12 -16 L14 -24 L20 -18 Z M26 -17 L31 -23 L31 -15 Z" fill="#d97a2b" />
        <path d="M14 -6 Q17 -4 20 -6 M22 -6 Q25 -4 28 -6" fill="none" stroke="#96471c" strokeWidth="1.6" strokeLinecap="round" />
        <path d="M-14 -4 Q-8 -10 0 -6 M-4 4 Q4 8 12 4" fill="none" stroke="#d97a2b" strokeWidth="1.4" strokeLinecap="round" opacity="0.7" />
      </g>
    </g>
  );
}

function SideTable() {
  return (
    <div style={{ position: 'absolute', left: '40%', bottom: '7%', width: '13vh' }}>
      <svg width="100%" viewBox="0 0 90 80" style={{ overflow: 'visible' }}>
        <ellipse cx="45" cy="76" rx="40" ry="5" fill="#03070a" opacity="0.5" />
        <ellipse cx="45" cy="26" rx="42" ry="9" fill="#8a5a35" />
        <ellipse cx="45" cy="23" rx="42" ry="9" fill="#a8734a" />
        <path d="M12 27 L16 74 M78 27 L74 74 M45 33 L45 76" stroke="#55341f" strokeWidth="5" strokeLinecap="round" />
        <g transform="translate(24 8)">
          <path d="M0 6 Q0 14 9 14 Q18 14 18 6 L17 0 H1 Z" fill="#bd5f20" />
          <path d="M18 4 Q25 4 24 9 Q23 13 17 12" fill="none" stroke="#bd5f20" strokeWidth="2.4" />
        </g>
        <g transform="translate(52 4) rotate(6)">
          <rect width="15" height="21" rx="2.5" fill="#fdf6ec" stroke="#d9a856" strokeWidth="1.2" />
          <text x="7.5" y="14" textAnchor="middle" fontSize="9" fontWeight="700" fill="#25586e">
            ♠
          </text>
        </g>
        <g transform="translate(60 6) rotate(-7)">
          <rect width="15" height="21" rx="2.5" fill="#fdf6ec" stroke="#d9a856" strokeWidth="1.2" />
          <text x="7.5" y="14" textAnchor="middle" fontSize="9" fontWeight="700" fill="#bd5f20">
            ♦
          </text>
        </g>
      </svg>
      <span className={s.snSteam} style={{ left: '32%', top: '-6%', width: 7, height: 7, '--dur': '4s', '--delay': '0s' } as CSSProperties} />
      <span className={s.snSteam} style={{ left: '37%', top: '-4%', width: 5, height: 5, '--dur': '5s', '--delay': '2s' } as CSSProperties} />
    </div>
  );
}

function RecordPlayer() {
  return (
    <div style={{ position: 'absolute', right: '3%', bottom: '7%', width: '17vh' }}>
      <svg width="100%" viewBox="0 0 110 90" style={{ overflow: 'visible' }}>
        <ellipse cx="55" cy="86" rx="48" ry="5" fill="#03070a" opacity="0.5" />
        <rect x="8" y="40" width="94" height="44" rx="6" fill="#55341f" />
        <rect x="8" y="36" width="94" height="10" rx="4" fill="#8a5a35" />
        <g className={s.snVinyl} style={{ transformOrigin: '46px 30px' }}>
          <circle cx="46" cy="30" r="22" fill="#10151b" />
          <circle cx="46" cy="30" r="21" fill="none" stroke="#2b3a44" strokeWidth="0.8" />
          <circle cx="46" cy="30" r="16" fill="none" stroke="#2b3a44" strokeWidth="0.6" />
          <circle cx="46" cy="30" r="11" fill="none" stroke="#2b3a44" strokeWidth="0.6" />
          <circle cx="46" cy="30" r="7" fill="#d97a2b" />
          <circle cx="46" cy="30" r="1.6" fill="#241609" />
        </g>
        <line x1="88" y1="14" x2="70" y2="34" stroke="#c9c2b4" strokeWidth="3" strokeLinecap="round" />
        <circle cx="88" cy="14" r="4.5" fill="#a67833" />
        <circle cx="24" cy="62" r="4" fill="#e2c289" />
        <rect x="60" y="58" width="34" height="8" rx="4" fill="#3b2417" />
      </svg>
      <span className={s.snNote} style={{ left: '20%', top: '-16%', fontSize: '2.4vh', '--dur': '6s', '--delay': '0s' } as CSSProperties}>
        ♪
      </span>
      <span className={s.snNote} style={{ left: '48%', top: '-10%', fontSize: '1.9vh', '--dur': '7s', '--delay': '2.4s' } as CSSProperties}>
        ♫
      </span>
      <span className={s.snNote} style={{ left: '34%', top: '-22%', fontSize: '1.6vh', '--dur': '8s', '--delay': '4.6s' } as CSSProperties}>
        ♪
      </span>
    </div>
  );
}

export default SnugScene;
