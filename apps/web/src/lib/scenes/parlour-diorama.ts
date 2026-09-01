import type { SceneId } from '@/stores/scene';
import { clamp, fbm, hashi, hex, mulberry } from './diorama/noise';
import {
  clipDraw,
  context2d,
  ellipse,
  fillPat,
  glow,
  LIVE_SCENE_CONTEXT,
  makeTex,
  rr,
  sceneBufferSize,
  sceneBufferUnchanged,
  tongue,
} from './diorama/primitives';

export type DioramaOptions = {
  getScene: () => SceneId;
  getReducedMotion: () => boolean;
};

/** Every texture the scenes bake, named so a typo cannot reach the canvas. */
type TextureName =
  | 'bark'
  | 'brick'
  | 'carpet'
  | 'damask'
  | 'endgrain'
  | 'felt'
  | 'grain'
  | 'grass'
  | 'leather'
  | 'stone'
  | 'tealpaper'
  | 'wood';

/** Pre-rendered sprites reused across frames. */
type SpriteName = 'chand' | 'curtB' | 'curtG' | 'curtP' | 'vinyl' | 'wheel';

/** One parallax plate: its canvas and the context already set up to draw on it. */
interface Plate {
  c: HTMLCanvasElement;
  g: CanvasRenderingContext2D;
}

/**
 * The anchors a scene's live pass needs, all present.
 *
 * The bakers fill {@link SceneExtras} field by field, so the stored value is
 * partial until the bake finishes. `ensureBaked` always runs first, but the
 * type system cannot see that — so each live pass narrows once at the top
 * through {@link readyExtras} rather than asserting at every read.
 */
type ReadyExtras<K extends keyof SceneExtras> = SceneExtras & Required<Pick<SceneExtras, K>>;

/** A point the live layer paints at. */
interface Anchor {
  x: number;
  y: number;
}

/** An anchor with a uniform scale, for props that shrink with the viewport. */
interface ScaledAnchor extends Anchor {
  s: number;
}

/**
 * Per-scene animation anchors captured while baking.
 *
 * The bakers record where the live layer has to paint — the fire's seat, the
 * window's rectangle, the path of the arch to clip against — so the animated
 * pass never has to recompute the layout the baked plates were drawn from.
 * Every field is optional because each scene records only its own, and the
 * live pass for a scene only ever reads the fields its own baker wrote.
 */
interface SceneExtras {
  // campfire
  moon?: { x: number; y: number; r: number };
  lake?: { top: number; bot: number };
  tent?: { x: number; y: number; h: number };
  fire?: ScaledAnchor;
  // casino
  sign?: { x: number; y: number; w: number };
  sconces?: Anchor[];
  reels?: { x: number; y: number; w: number; h: number }[];
  marquee?: Anchor[];
  wheel?: ScaledAnchor;
  table?: { x: number; yc: number; rx: number; ry: number };
  chands?: ScaledAnchor[];
  // snug
  window?: { x: number; y: number; w: number; h: number };
  hearth?: { ox: number; ohw: number; oby: number; oty: number };
  archPath?: (c: CanvasRenderingContext2D) => void;
  candles?: { x: number; y: number; h: number }[];
  clock?: {
    x: number;
    pivotY: number;
    winX: number;
    winY: number;
    winW: number;
    winH: number;
    len: number;
  };
  vinyl?: { x: number; y: number; r: number };
  mug?: ScaledAnchor;
  cat?: ScaledAnchor;
  // beach
  sun?: { x: number; y: number; r: number };
  sea?: { top: number; bot: number };
  /** Festoon bulbs strung between the palms, pulsing to the party. */
  bulbs?: Anchor[];
  torchesB?: ScaledAnchor[];
  /** The beach bar's light wash, where the colour sweeps come from. */
  bar?: ScaledAnchor;
}

export function mountParlourDiorama(
  canvas: HTMLCanvasElement,
  options: DioramaOptions,
): () => void {
  const ctx = context2d(canvas, LIVE_SCENE_CONTEXT);

  /* ------------------------------------------------------------------ */
  /* textures — generated once                                           */
  /* ------------------------------------------------------------------ */

  /**
   * The generated textures, named. Declaring the shape here rather than leaving
   * it inferred from an empty object is what lets a typo in `tex('tealpaper')`
   * become a build error instead of an `undefined` pattern painting nothing.
   */
  const T: Partial<Record<TextureName, HTMLCanvasElement>> = {};

  /** A baked sprite. Reading one before `buildSprites` is a programming error. */
  function spr(name: SpriteName): HTMLCanvasElement {
    const canvas = S[name];
    if (!canvas) throw new Error(`diorama sprite "${name}" was read before it was baked`);
    return canvas;
  }

  /** A baked texture. Reading one before `buildTextures` is a programming error. */
  function tex(name: TextureName): HTMLCanvasElement {
    const canvas = T[name];
    if (!canvas) throw new Error(`diorama texture "${name}" was read before it was baked`);
    return canvas;
  }
  function buildTextures() {
    T.wood = makeTex(256, 256, (c) => {
      c.fillStyle = '#5e3b21';
      c.fillRect(0, 0, 256, 256);
      for (let y = 0; y < 256; y += 1) {
        const n = fbm(0.35, y * 0.032, 5);
        c.strokeStyle = `rgba(26,13,7,${0.1 + n * 0.3})`;
        c.beginPath();
        c.moveTo(0, y);
        for (let x = 0; x <= 256; x += 8) {
          c.lineTo(x, y + Math.sin(x * 0.045 + n * 11) * 1.7 + (n - 0.5) * 2.2);
        }
        c.stroke();
      }
      for (let y = 0; y < 256; y += 6) {
        const n = fbm(0.9, y * 0.05, 3);
        if (n > 0.62) {
          c.strokeStyle = 'rgba(214,160,96,0.10)';
          c.beginPath();
          c.moveTo(0, y);
          c.lineTo(256, y + (n - 0.6) * 8);
          c.stroke();
        }
      }
      for (let i = 0; i < 5; i += 1) {
        const x = 26 + i * 50;
        const y = 36 + ((i * 71) % 170);
        c.strokeStyle = 'rgba(96,52,24,0.4)';
        c.beginPath();
        c.ellipse(x, y, 9, 5.4, 0.4, 0, Math.PI * 2);
        c.stroke();
        c.strokeStyle = 'rgba(30,14,6,0.4)';
        c.beginPath();
        c.ellipse(x, y, 4.4, 2.6, 0.4, 0, Math.PI * 2);
        c.stroke();
      }
    });

    T.bark = makeTex(128, 256, (c) => {
      c.fillStyle = '#38220f';
      c.fillRect(0, 0, 128, 256);
      for (let x = 3; x < 128; x += 6) {
        c.strokeStyle = `rgba(16,9,4,${0.32 + hashi(x, 3) * 0.42})`;
        c.lineWidth = 1 + hashi(x, 9) * 2.2;
        c.beginPath();
        c.moveTo(x, 0);
        for (let y = 0; y <= 256; y += 10) c.lineTo(x + Math.sin(y * 0.07 + x) * 2.4, y);
        c.stroke();
      }
      for (let i = 0; i < 30; i += 1) {
        const x = hashi(i, 21) * 128;
        const y = hashi(i, 47) * 256;
        c.fillStyle = 'rgba(120,80,44,0.14)';
        c.fillRect(x, y, 2 + hashi(i, 5) * 4, 1.5);
      }
    });

    T.felt = makeTex(128, 128, (c) => {
      const img = c.createImageData(128, 128);
      for (let i = 0; i < img.data.length; i += 4) {
        const n = hashi(i, i * 3) * 26;
        img.data[i] = 14 + n * 0.45;
        img.data[i + 1] = 66 + n * 0.85;
        img.data[i + 2] = 48 + n * 0.4;
        img.data[i + 3] = 255;
      }
      c.putImageData(img, 0, 0);
    });

    /* wine damask with layered gold motif */
    T.damask = makeTex(144, 144, (c) => {
      c.fillStyle = '#2c1019';
      c.fillRect(0, 0, 144, 144);
      const motif = (cx: number, cy: number, s: number, a: number) => {
        c.save();
        c.translate(cx, cy);
        c.scale(s, s);
        c.strokeStyle = `rgba(226,194,137,${a})`;
        c.fillStyle = `rgba(226,194,137,${a * 0.35})`;
        c.lineWidth = 1.4;
        c.beginPath();
        c.moveTo(0, -30);
        c.bezierCurveTo(16, -22, 18, -8, 8, 2);
        c.bezierCurveTo(20, 6, 20, 22, 0, 30);
        c.bezierCurveTo(-20, 22, -20, 6, -8, 2);
        c.bezierCurveTo(-18, -8, -16, -22, 0, -30);
        c.closePath();
        c.stroke();
        c.beginPath();
        c.moveTo(0, -18);
        c.quadraticCurveTo(8, -6, 0, 8);
        c.quadraticCurveTo(-8, -6, 0, -18);
        c.fill();
        c.beginPath();
        c.arc(0, 20, 3.2, 0, Math.PI * 2);
        c.fill();
        c.beginPath();
        c.moveTo(-13, -2);
        c.quadraticCurveTo(-22, -12, -13, -20);
        c.moveTo(13, -2);
        c.quadraticCurveTo(22, -12, 13, -20);
        c.stroke();
        c.restore();
      };
      motif(72, 72, 1, 0.34);
      motif(0, 0, 0.62, 0.22);
      motif(144, 0, 0.62, 0.22);
      motif(0, 144, 0.62, 0.22);
      motif(144, 144, 0.62, 0.22);
      c.strokeStyle = 'rgba(226,194,137,0.10)';
      c.lineWidth = 1;
      c.beginPath();
      c.moveTo(72, 0);
      c.lineTo(144, 72);
      c.lineTo(72, 144);
      c.lineTo(0, 72);
      c.closePath();
      c.stroke();
    });

    /* teal snug wallpaper: soft stripe + fern sprig */
    T.tealpaper = makeTex(120, 150, (c) => {
      c.fillStyle = '#1e363f';
      c.fillRect(0, 0, 120, 150);
      c.fillStyle = 'rgba(255,255,255,0.025)';
      c.fillRect(0, 0, 60, 150);
      const sprig = (cx: number, cy: number, s: number) => {
        c.save();
        c.translate(cx, cy);
        c.scale(s, s);
        c.strokeStyle = 'rgba(141,196,205,0.30)';
        c.lineWidth = 1.2;
        c.beginPath();
        c.moveTo(0, 18);
        c.quadraticCurveTo(3, 0, 0, -18);
        c.stroke();
        for (let k = 0; k < 5; k += 1) {
          const yy = 12 - k * 6.4;
          const ll = 9 - k * 1.2;
          c.beginPath();
          c.moveTo(1, yy);
          c.quadraticCurveTo(ll * 0.7, yy - 3, ll, yy - 7);
          c.moveTo(1, yy);
          c.quadraticCurveTo(-ll * 0.7 + 2, yy - 3, -ll + 2, yy - 7);
          c.stroke();
        }
        c.fillStyle = 'rgba(226,194,137,0.28)';
        c.beginPath();
        c.arc(0, -21, 1.8, 0, Math.PI * 2);
        c.fill();
        c.restore();
      };
      sprig(30, 40, 1);
      sprig(90, 115, 1);
      sprig(90, -35, 1);
      sprig(30, 190, 1);
      c.fillStyle = 'rgba(141,196,205,0.10)';
      (
        [
          [62, 20],
          [8, 100],
          [112, 62],
          [58, 140],
        ] as const
      ).forEach(([x, y]) => {
        c.beginPath();
        c.arc(x, y, 1.3, 0, Math.PI * 2);
        c.fill();
      });
    });

    /* casino carpet: navy field, amber quatrefoil, teal seeds */
    T.carpet = makeTex(112, 112, (c) => {
      c.fillStyle = '#141d2b';
      c.fillRect(0, 0, 112, 112);
      const quat = (cx: number, cy: number, a: number) => {
        c.save();
        c.translate(cx, cy);
        c.strokeStyle = `rgba(198,124,52,${a})`;
        c.lineWidth = 2;
        for (let k = 0; k < 4; k += 1) {
          c.rotate(Math.PI / 2);
          c.beginPath();
          c.arc(0, -13, 9, Math.PI * 0.8, Math.PI * 2.2);
          c.stroke();
        }
        c.fillStyle = `rgba(226,194,137,${a})`;
        c.beginPath();
        c.arc(0, 0, 3, 0, Math.PI * 2);
        c.fill();
        c.restore();
      };
      quat(28, 28, 0.5);
      quat(84, 84, 0.5);
      c.fillStyle = 'rgba(47,134,161,0.5)';
      (
        [
          [84, 28],
          [28, 84],
        ] as const
      ).forEach(([x, y]) => {
        c.save();
        c.translate(x, y);
        c.rotate(Math.PI / 4);
        c.fillRect(-4, -4, 8, 8);
        c.strokeStyle = 'rgba(47,134,161,0.3)';
        c.strokeRect(-8, -8, 16, 16);
        c.restore();
      });
      c.strokeStyle = 'rgba(226,194,137,0.10)';
      c.lineWidth = 1;
      c.strokeRect(0.5, 0.5, 56, 56);
      c.strokeRect(56.5, 56.5, 56, 56);
    });

    T.brick = makeTex(168, 96, (c) => {
      c.fillStyle = '#2d1c12';
      c.fillRect(0, 0, 168, 96);
      for (let row = 0; row < 4; row += 1) {
        const off = row % 2 ? 21 : 0;
        for (let col = -1; col < 5; col += 1) {
          const x = col * 42 + off;
          const y = row * 24;
          const n = hashi(col + 7, row + 13);
          const rC = 96 + n * 34;
          const gC = 58 + n * 20;
          const bC = 40 + n * 12;
          c.fillStyle = `rgb(${rC | 0},${gC | 0},${bC | 0})`;
          c.fillRect(x + 1.5, y + 1.5, 39, 21);
          c.fillStyle = 'rgba(255,214,160,0.10)';
          c.fillRect(x + 1.5, y + 1.5, 39, 3);
          c.fillStyle = 'rgba(16,8,4,0.30)';
          c.fillRect(x + 1.5, y + 17, 39, 5.5);
          if (n > 0.7) {
            c.fillStyle = 'rgba(20,10,6,0.22)';
            c.fillRect(x + 6 + n * 20, y + 5, 6, 4);
          }
        }
      }
    });

    T.grass = makeTex(200, 100, (c) => {
      c.fillStyle = '#0c1c14';
      c.fillRect(0, 0, 200, 100);
      const rnd = mulberry(0x11);
      for (let i = 0; i < 300; i += 1) {
        const x = rnd() * 200;
        const y = 24 + rnd() * 76;
        c.strokeStyle = `rgba(${(12 + rnd() * 34) | 0},${(44 + rnd() * 56) | 0},${(22 + rnd() * 22) | 0},${0.25 + rnd() * 0.45})`;
        c.lineWidth = 1;
        c.beginPath();
        c.moveTo(x, y);
        c.quadraticCurveTo(
          x + (rnd() - 0.5) * 6,
          y - 9,
          x + (rnd() - 0.5) * 5,
          y - 13 - rnd() * 11,
        );
        c.stroke();
      }
    });

    T.leather = makeTex(128, 128, (c) => {
      const img = c.createImageData(128, 128);
      for (let y = 0; y < 128; y += 1) {
        for (let x = 0; x < 128; x += 1) {
          const n = fbm(x * 0.09, y * 0.09, 4);
          const i = (y * 128 + x) * 4;
          img.data[i] = 24 + n * 38;
          img.data[i + 1] = 62 + n * 40;
          img.data[i + 2] = 82 + n * 32;
          img.data[i + 3] = 255;
        }
      }
      c.putImageData(img, 0, 0);
      c.strokeStyle = 'rgba(10,26,36,0.35)';
      for (let i = 0; i < 7; i += 1) {
        c.beginPath();
        c.moveTo(hashi(i, 3) * 128, 0);
        c.bezierCurveTo(hashi(i, 5) * 128, 40, hashi(i, 7) * 128, 90, hashi(i, 9) * 128, 128);
        c.stroke();
      }
    });

    T.stone = makeTex(128, 128, (c) => {
      const img = c.createImageData(128, 128);
      for (let y = 0; y < 128; y += 1) {
        for (let x = 0; x < 128; x += 1) {
          const n = fbm(x * 0.06, y * 0.06, 4);
          const i = (y * 128 + x) * 4;
          const v = 74 + n * 44;
          img.data[i] = v;
          img.data[i + 1] = v * 0.97;
          img.data[i + 2] = v * 0.92;
          img.data[i + 3] = 255;
        }
      }
      c.putImageData(img, 0, 0);
    });

    T.grain = makeTex(160, 160, (c) => {
      const img = c.createImageData(160, 160);
      for (let i = 0; i < img.data.length; i += 4) {
        const n = hashi(i, i * 7) * 255;
        img.data[i] = img.data[i + 1] = img.data[i + 2] = n;
        img.data[i + 3] = 26;
      }
      c.putImageData(img, 0, 0);
    });

    T.endgrain = makeTex(64, 64, (c) => {
      c.fillStyle = '#96693c';
      c.fillRect(0, 0, 64, 64);
      c.strokeStyle = 'rgba(62,32,14,0.5)';
      for (let r = 3; r < 34; r += 4) {
        c.beginPath();
        c.ellipse(32, 33, r, r * 0.84, 0.08, 0, Math.PI * 2);
        c.stroke();
      }
      c.strokeStyle = 'rgba(40,20,8,0.6)';
      c.beginPath();
      c.moveTo(32, 33);
      c.lineTo(52, 12);
      c.stroke();
    });
  }

  /* ------------------------------------------------------------------ */
  /* sprites — generated once                                            */
  /* ------------------------------------------------------------------ */

  /**
   * Pre-rendered sprites, plus the two geometry slots the chandelier needs:
   * where its bulbs sit on the sprite, and how far its chain hangs. They live
   * beside the canvases because they are baked at the same moment and read by
   * the same live pass.
   */
  const S: Partial<Record<SpriteName, HTMLCanvasElement>> & {
    chandBulbs?: [number, number][];
    chandHang?: [number, number];
  } = {};
  function buildSprites() {
    const curtain = (color: string) =>
      makeTex(48, 256, (c) => {
        const g = c.createLinearGradient(0, 0, 0, 256);
        g.addColorStop(0, hex(color, 0));
        g.addColorStop(0.4, hex(color, 0.1));
        g.addColorStop(0.72, hex(color, 0.3));
        g.addColorStop(0.9, hex(color, 0.58));
        g.addColorStop(0.97, hex(color, 0.3));
        g.addColorStop(1, hex(color, 0));
        c.fillStyle = g;
        c.fillRect(0, 0, 48, 256);
      });
    S.curtG = curtain('#3ee0a0');
    S.curtB = curtain('#5aa4e8');
    S.curtP = curtain('#8f7dff');

    /* roulette wheel: 240px sprite */
    S.wheel = makeTex(240, 240, (c) => {
      c.translate(120, 120);
      const rim = c.createRadialGradient(0, 0, 84, 0, 0, 116);
      rim.addColorStop(0, '#8a5a2c');
      rim.addColorStop(0.5, '#b98a4a');
      rim.addColorStop(1, '#5c3a18');
      c.fillStyle = rim;
      c.beginPath();
      c.arc(0, 0, 116, 0, Math.PI * 2);
      c.fill();
      c.strokeStyle = '#e2c289';
      c.lineWidth = 3;
      c.beginPath();
      c.arc(0, 0, 104, 0, Math.PI * 2);
      c.stroke();
      for (let i = 0; i < 18; i += 1) {
        c.fillStyle = i === 0 ? '#1d5c46' : i % 2 ? '#151a22' : '#7a1f2b';
        c.beginPath();
        c.moveTo(0, 0);
        c.arc(0, 0, 100, (i * Math.PI) / 9, ((i + 1) * Math.PI) / 9);
        c.closePath();
        c.fill();
      }
      c.strokeStyle = 'rgba(226,194,137,0.75)';
      c.lineWidth = 1.6;
      for (let i = 0; i < 18; i += 1) {
        const a = (i * Math.PI) / 9;
        c.beginPath();
        c.moveTo(Math.cos(a) * 56, Math.sin(a) * 56);
        c.lineTo(Math.cos(a) * 100, Math.sin(a) * 100);
        c.stroke();
      }
      const bowl = c.createRadialGradient(0, 0, 6, 0, 0, 56);
      bowl.addColorStop(0, '#3a2412');
      bowl.addColorStop(1, '#1c1008');
      c.fillStyle = bowl;
      c.beginPath();
      c.arc(0, 0, 56, 0, Math.PI * 2);
      c.fill();
      c.strokeStyle = '#c99b52';
      c.lineWidth = 2.4;
      c.beginPath();
      c.arc(0, 0, 56, 0, Math.PI * 2);
      c.stroke();
      c.fillStyle = '#c99b52';
      c.beginPath();
      c.arc(0, 0, 15, 0, Math.PI * 2);
      c.fill();
      c.strokeStyle = '#f3d7a4';
      c.lineWidth = 4;
      c.lineCap = 'round';
      for (let k = 0; k < 4; k += 1) {
        const a = (k * Math.PI) / 2 + Math.PI / 4;
        c.beginPath();
        c.moveTo(Math.cos(a) * 14, Math.sin(a) * 14);
        c.lineTo(Math.cos(a) * 40, Math.sin(a) * 40);
        c.stroke();
        c.fillStyle = '#f3d7a4';
        c.beginPath();
        c.arc(Math.cos(a) * 42, Math.sin(a) * 42, 4.4, 0, Math.PI * 2);
        c.fill();
      }
      c.fillStyle = '#ffe9c4';
      c.beginPath();
      c.arc(0, 0, 6, 0, Math.PI * 2);
      c.fill();
    });

    /* vinyl record: 120px sprite */
    S.vinyl = makeTex(120, 120, (c) => {
      c.translate(60, 60);
      const disc = c.createRadialGradient(-14, -14, 4, 0, 0, 52);
      disc.addColorStop(0, '#232a33');
      disc.addColorStop(0.4, '#0f141b');
      disc.addColorStop(1, '#080b10');
      c.fillStyle = disc;
      c.beginPath();
      c.arc(0, 0, 52, 0, Math.PI * 2);
      c.fill();
      c.strokeStyle = 'rgba(120,150,170,0.20)';
      for (let r = 20; r < 50; r += 4.5) {
        c.beginPath();
        c.arc(0, 0, r, 0, Math.PI * 2);
        c.stroke();
      }
      c.strokeStyle = 'rgba(255,255,255,0.16)';
      c.lineWidth = 6;
      c.beginPath();
      c.arc(0, 0, 36, -2.4, -1.7);
      c.stroke();
      c.beginPath();
      c.arc(0, 0, 36, 0.7, 1.4);
      c.stroke();
      c.lineWidth = 1;
      c.fillStyle = '#d97a2b';
      c.beginPath();
      c.arc(0, 0, 15, 0, Math.PI * 2);
      c.fill();
      c.fillStyle = 'rgba(255,244,220,0.85)';
      c.font = '700 7px sans-serif';
      c.textAlign = 'center';
      c.fillText('parlour', 0, -3);
      c.fillStyle = '#241609';
      c.beginPath();
      c.arc(0, 0, 2.4, 0, Math.PI * 2);
      c.fill();
    });

    /* brass chandelier: logical 320x300 baked at 2x */
    const chandBulbs: [number, number][] = [];
    S.chand = makeTex(640, 600, (c) => {
      c.scale(2, 2);
      c.translate(160, 0);
      c.strokeStyle = '#c99b52';
      c.lineWidth = 3;
      for (let k = 0; k < 4; k += 1) {
        c.beginPath();
        c.ellipse(0, 14 + k * 13, k % 2 ? 3 : 5, 6.5, 0, 0, Math.PI * 2);
        c.stroke();
      }
      const stem = c.createLinearGradient(-5, 0, 5, 0);
      stem.addColorStop(0, '#8a5a24');
      stem.addColorStop(0.5, '#f3d7a4');
      stem.addColorStop(1, '#8a5a24');
      c.fillStyle = stem;
      c.fillRect(-4, 66, 8, 76);
      ellipse(c, 0, 74, 9, 7, '#c99b52');
      ellipse(c, 0, 118, 7, 5.5, '#c99b52');
      ellipse(c, 0, 148, 11, 9, '#b9884a');
      const arms = [-124, -78, -30, 30, 78, 124];
      arms.forEach((ax) => {
        const ay = 176 - Math.abs(ax) * 0.14;
        c.strokeStyle = '#b9884a';
        c.lineWidth = 5;
        c.beginPath();
        c.moveTo(0, 126);
        c.bezierCurveTo(ax * 0.2, 132, ax * 0.72, ay + 24, ax, ay);
        c.stroke();
        c.strokeStyle = 'rgba(255,231,184,0.55)';
        c.lineWidth = 1.4;
        c.beginPath();
        c.moveTo(0, 124);
        c.bezierCurveTo(ax * 0.2, 130, ax * 0.72, ay + 22, ax, ay - 2);
        c.stroke();
        ellipse(c, ax, ay + 2, 10, 4, '#c99b52');
        rr(c, ax - 3.4, ay - 18, 6.8, 19, 2.5, '#f6ecd8');
        c.fillStyle = 'rgba(0,0,0,0.14)';
        c.fillRect(ax + 0.8, ay - 18, 2.6, 19);
        chandBulbs.push([ax, ay - 22]);
        c.strokeStyle = 'rgba(214,236,244,0.6)';
        c.lineWidth = 1.2;
        for (let d = 0; d < 3; d += 1) {
          const dy = ay + 8 + d * 11;
          c.beginPath();
          c.moveTo(ax, dy - 4);
          c.lineTo(ax + 3, dy);
          c.lineTo(ax, dy + 4);
          c.lineTo(ax - 3, dy);
          c.closePath();
          c.stroke();
        }
      });
      c.strokeStyle = 'rgba(214,236,244,0.5)';
      c.lineWidth = 1.2;
      for (let k = -2; k <= 2; k += 1) {
        const bx = k * 26;
        c.beginPath();
        c.moveTo(bx, 152);
        c.quadraticCurveTo(bx * 0.5, 196, 0, 216);
        c.stroke();
      }
      ellipse(c, 0, 222, 8, 10, '#c99b52');
      ellipse(c, 0, 234, 4.5, 6, '#f3d7a4');
    });
    S.chandBulbs = chandBulbs.slice(0, 6);
    S.chandHang = [160, 8];
  }

  /* ------------------------------------------------------------------ */
  /* shared small props                                                  */
  /* ------------------------------------------------------------------ */

  function card(
    c: CanvasRenderingContext2D,
    x: number,
    y: number,
    rot: number,
    rank: string,
    suit: string,
    red: boolean,
    s = 1,
  ) {
    c.save();
    c.translate(x, y);
    c.rotate(rot);
    c.scale(s, s);
    c.save();
    c.shadowColor = 'rgba(0,0,0,0.4)';
    c.shadowBlur = 7;
    c.shadowOffsetY = 3;
    const face = c.createLinearGradient(0, -30, 0, 30);
    face.addColorStop(0, '#fffdf6');
    face.addColorStop(1, '#f0e6d4');
    c.fillStyle = face;
    c.beginPath();
    c.roundRect(-21, -29, 42, 58, 5);
    c.fill();
    c.restore();
    c.strokeStyle = '#d9a856';
    c.lineWidth = 1.4;
    c.beginPath();
    c.roundRect(-18.5, -26.5, 37, 53, 3.5);
    c.stroke();
    c.fillStyle = red ? '#bd3f24' : '#20475c';
    c.textAlign = 'center';
    c.font = '800 11px "Baloo 2", sans-serif';
    c.fillText(rank, -13, -15);
    c.font = '700 9px "Baloo 2", sans-serif';
    c.fillText(suit, -13, -6);
    c.save();
    c.rotate(Math.PI);
    c.font = '800 11px "Baloo 2", sans-serif';
    c.fillText(rank, -13, -15);
    c.font = '700 9px "Baloo 2", sans-serif';
    c.fillText(suit, -13, -6);
    c.restore();
    c.font = '700 22px "Baloo 2", sans-serif';
    c.fillText(suit, 0, 8);
    c.restore();
  }

  function cardBack(c: CanvasRenderingContext2D, x: number, y: number, rot: number, s = 1) {
    c.save();
    c.translate(x, y);
    c.rotate(rot);
    c.scale(s, s);
    c.save();
    c.shadowColor = 'rgba(0,0,0,0.4)';
    c.shadowBlur = 7;
    c.shadowOffsetY = 3;
    rr(c, -21, -29, 42, 58, 5, '#fdf6ec');
    c.restore();
    rr(c, -17, -25, 34, 50, 3, '#25586e');
    c.strokeStyle = 'rgba(226,194,137,0.75)';
    c.lineWidth = 1.2;
    c.beginPath();
    c.roundRect(-14, -22, 28, 44, 2);
    c.stroke();
    c.beginPath();
    c.moveTo(0, -20);
    c.lineTo(12, 0);
    c.lineTo(0, 20);
    c.lineTo(-12, 0);
    c.closePath();
    c.stroke();
    c.fillStyle = 'rgba(226,194,137,0.85)';
    c.beginPath();
    c.arc(0, 0, 3.4, 0, Math.PI * 2);
    c.fill();
    c.restore();
  }

  function chipStack(
    c: CanvasRenderingContext2D,
    x: number,
    y: number,
    color: string,
    n: number,
    s = 1,
  ) {
    c.save();
    c.translate(x, y);
    c.scale(s, s);
    ellipse(c, 0, 4, 17, 6.6, 'rgba(0,0,0,0.35)');
    for (let i = 0; i < n; i += 1) {
      const yy = -i * 6;
      const side = c.createLinearGradient(-15, 0, 15, 0);
      side.addColorStop(0, hex(color, 0.75));
      side.addColorStop(0.5, hex(color, 1));
      side.addColorStop(1, hex(color, 0.65));
      c.fillStyle = side;
      c.beginPath();
      c.rect(-15, yy - 6, 30, 6);
      c.fill();
      c.fillStyle = '#fdf6ec';
      for (let k = -1; k <= 1; k += 1) {
        c.fillRect(k * 10 - 2, yy - 6, 4, 6);
      }
      ellipse(c, 0, yy - 6, 15, 5.8, hex(color, 1));
      c.strokeStyle = '#fdf6ec';
      c.lineWidth = 1.4;
      c.setLineDash([4, 5]);
      c.beginPath();
      c.ellipse(0, yy - 6, 11.5, 4.3, 0, 0, Math.PI * 2);
      c.stroke();
      c.setLineDash([]);
    }
    const top = -(n - 1) * 6 - 6;
    ellipse(c, 0, top, 7.5, 2.9, 'rgba(255,255,255,0.22)');
    c.restore();
  }

  /* layered pine with optional warm rim on the side facing +dir */
  function pine(
    c: CanvasRenderingContext2D,
    x: number,
    y: number,
    h: number,
    seed: number,
    lit: boolean,
    dir = 1,
  ) {
    const rnd = mulberry(seed);
    c.save();
    c.translate(x, y);
    ellipse(c, dir * 4, 5, h * 0.24, 6, 'rgba(0,0,0,0.4)');
    clipDraw(
      c,
      () => c.rect(-h * 0.035, -h * 0.3, h * 0.07, h * 0.34),
      () => fillPat(c, tex('bark'), -h * 0.05, -h * 0.32, h * 0.1, h * 0.38, 0.95),
    );
    const tiers = 15;
    for (let i = 0; i < tiers; i += 1) {
      const tt = i / (tiers - 1);
      const yy = -h * (0.2 + tt * 0.76);
      const spread = h * (0.05 + (1 - tt) * 0.26);
      const xx = (rnd() - 0.5) * spread * 0.9;
      const rx = spread * (0.7 + rnd() * 0.55);
      const ry = h * (0.055 + rnd() * 0.05);
      const sh = 10 + tt * 16;
      c.fillStyle = `rgb(${(sh * 0.8) | 0},${(16 + sh) | 0},${(12 + sh * 0.55) | 0})`;
      c.beginPath();
      c.ellipse(xx, yy, rx, ry, (rnd() - 0.5) * 0.5, 0, Math.PI * 2);
      c.fill();
      c.fillStyle = `rgba(30,60,44,${0.5 - tt * 0.2})`;
      c.beginPath();
      c.ellipse(xx - dir * rx * 0.3, yy + ry * 0.3, rx * 0.6, ry * 0.6, 0, 0, Math.PI * 2);
      c.fill();
      if (lit) {
        c.fillStyle = hex('#e29349', 0.08 + tt * 0.14);
        c.beginPath();
        c.ellipse(
          xx + dir * rx * 0.42,
          yy + ry * 0.1,
          rx * 0.4,
          ry * 0.5,
          dir * 0.25,
          0,
          Math.PI * 2,
        );
        c.fill();
      }
    }
    c.restore();
  }

  /* ------------------------------------------------------------------ */
  /* state                                                               */
  /* ------------------------------------------------------------------ */

  const PAD = 64;
  let W = 0;
  let H = 0;
  let dpr = 1;
  let bakeDpr = 1;
  let scene: SceneId = 'campfire';
  let mx = 0;
  let my = 0;
  let px = 0;
  let py = 0;

  /**
   * Media queries are hoisted out of the frame loop deliberately. Both of these
   * used to be evaluated per frame, and `matchMedia` is not free: at 60fps it
   * measured as one of the most expensive single calls in the whole app.
   */
  const calmQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  const coarseQuery = window.matchMedia('(pointer: coarse)');
  let reduced = options.getReducedMotion() || calmQuery.matches;

  /** The four baked parallax plates per scene, filled on first render. */
  const plates: Record<SceneId, Plate[] | null> = {
    campfire: null,
    casino: null,
    snug: null,
    beach: null,
  };
  const EX: Record<SceneId, SceneExtras> = { campfire: {}, casino: {}, snug: {}, beach: {} };

  /**
   * The animated fields, seeded once from fixed seeds so the scatter is the
   * same on every device. Positions are stored in 0–1 space where the field
   * spans the viewport and in pixels where it is anchored to a prop.
   */
  const twinkles: { x: number; y: number; r: number; a: number; s: number; p: number }[] = [];
  const flies: { x: number; y: number; s: number; p: number; ox: number; oy: number }[] = [];
  const embersCF: {
    x: number;
    delay: number;
    life: number;
    sway: number;
    lift: number;
    r: number;
  }[] = [];
  const embersSN: { x: number; delay: number; life: number; sway: number; r: number }[] = [];
  const rain: { x: number; y: number; len: number; s: number; a: number }[] = [];
  const motes: { x: number; r: number; s: number; p: number }[] = [];
  const glints: { x: number; y: number; w: number; s: number; p: number }[] = [];

  function seedFields() {
    const rt = mulberry(0x7a11);
    twinkles.length = 0;
    for (let i = 0; i < 18; i += 1) {
      twinkles.push({
        x: rt(),
        y: rt() * 0.42,
        r: 0.6 + rt() * 1.4,
        a: 0.35 + rt() * 0.6,
        s: 1.6 + rt() * 2.4,
        p: rt() * 6.28,
      });
    }
    const rf = mulberry(0xf12e);
    flies.length = 0;
    for (let i = 0; i < 12; i += 1) {
      flies.push({
        x: 0.08 + rf() * 0.84,
        y: 0.6 + rf() * 0.3,
        s: 5 + rf() * 6,
        p: rf() * 6.28,
        ox: (rf() - 0.5) * 0.06,
        oy: -0.015 - rf() * 0.03,
      });
    }
    const re = mulberry(0xe3b1);
    embersCF.length = 0;
    for (let i = 0; i < 26; i += 1) {
      embersCF.push({
        x: (re() - 0.5) * 76,
        delay: re() * 5,
        life: 2.4 + re() * 3,
        sway: (re() - 0.5) * 46,
        lift: 120 + re() * 150,
        r: 1 + re() * 2,
      });
    }
    const rs = mulberry(0x51ce);
    embersSN.length = 0;
    for (let i = 0; i < 11; i += 1) {
      embersSN.push({
        x: (rs() - 0.5) * 0.9,
        delay: rs() * 4,
        life: 1.8 + rs() * 2,
        sway: (rs() - 0.5) * 14,
        r: 0.8 + rs() * 1.4,
      });
    }
    const rrn = mulberry(0x9a17);
    rain.length = 0;
    for (let i = 0; i < 40; i += 1) {
      rain.push({
        x: rrn(),
        y: rrn(),
        len: 8 + rrn() * 15,
        s: 0.8 + rrn() * 0.9,
        a: 0.2 + rrn() * 0.3,
      });
    }
    const rm = mulberry(0xd057);
    motes.length = 0;
    for (let i = 0; i < 12; i += 1) {
      motes.push({ x: 0.06 + rm() * 0.88, r: 1 + rm() * 1.8, s: 14 + rm() * 14, p: rm() });
    }
    // Sea sparkles: x/y in 0–1 space across the sun's glitter path.
    const rg = mulberry(0xbea);
    glints.length = 0;
    for (let i = 0; i < 22; i += 1) {
      glints.push({
        x: (rg() - 0.5) * 0.16,
        y: rg(),
        w: 8 + rg() * 22,
        s: 1.2 + rg() * 2.6,
        p: rg() * 6.28,
      });
    }
  }

  function plate(): Plate {
    const c = document.createElement('canvas');
    c.width = Math.round((W + PAD * 2) * bakeDpr);
    c.height = Math.round((H + PAD * 2) * bakeDpr);
    const g = context2d(c);
    g.setTransform(bakeDpr, 0, 0, bakeDpr, PAD * bakeDpr, PAD * bakeDpr);
    g.imageSmoothingEnabled = true;
    g.imageSmoothingQuality = 'high';
    return { c, g };
  }

  const DEPTHS = [5, 11, 19, 30] as const;

  /**
   * The four parallax plates are the most expensive thing on screen: four
   * full-screen scaled blits, every frame, forever.
   *
   * They only ever differ when the parallax offset moves, and the offset is
   * driven by the pointer — which on a phone never moves at all. So the
   * composite is cached and re-cut only when the offset actually changes by
   * enough to see (the deepest plate moves 30px per unit of offset, so a
   * hundredth of a unit is a third of a pixel). Steady state is one blit.
   */
  let flatPlate: {
    c: HTMLCanvasElement;
    g: CanvasRenderingContext2D;
    w: number;
    h: number;
  } | null = null;
  let flatFor: readonly Plate[] | null = null;
  let flatKey = '';
  let washGradient: CanvasGradient | null = null;
  let washFor = '';

  function blitPlates(arr: readonly Plate[]) {
    // While the parallax is still easing there is a new composite every frame,
    // and caching one costs more than it saves. Draw straight through until it
    // settles, then cut the composite once and ride it.
    if (Math.abs(px - mx) > 0.002 || Math.abs(py - my) > 0.002) {
      flatFor = null;
      for (let i = 0; i < arr.length; i += 1) {
        const plateAt = arr[i];
        const depth = DEPTHS[i] ?? 0;
        if (!plateAt) continue;
        ctx.drawImage(
          plateAt.c,
          -PAD - px * depth,
          -PAD - py * depth * 0.6,
          W + PAD * 2,
          H + PAD * 2,
        );
      }
      return;
    }
    const key = `${Math.round(px * 100)}:${Math.round(py * 100)}`;
    if (!flatPlate || flatPlate.w !== W || flatPlate.h !== H) {
      const c = document.createElement('canvas');
      c.width = Math.max(1, Math.round(W * dpr));
      c.height = Math.max(1, Math.round(H * dpr));
      flatPlate = { c, g: context2d(c), w: W, h: H };
      flatFor = null;
    }
    const flat = flatPlate;
    if (flatFor !== arr || flatKey !== key) {
      const g = flat.g;
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      g.clearRect(0, 0, W, H);
      g.imageSmoothingEnabled = true;
      g.imageSmoothingQuality = 'medium';
      for (let i = 0; i < arr.length; i += 1) {
        const plateAt = arr[i];
        const depth = DEPTHS[i] ?? 0;
        if (!plateAt) continue;
        g.drawImage(
          plateAt.c,
          -PAD - px * depth,
          -PAD - py * depth * 0.6,
          W + PAD * 2,
          H + PAD * 2,
        );
      }
      flatFor = arr;
      flatKey = key;
    }
    ctx.drawImage(flat.c, 0, 0, W, H);
  }

  function withDepth(depth: number, fn: () => void) {
    ctx.save();
    ctx.translate(-px * depth, -py * depth * 0.6);
    fn();
    ctx.restore();
  }

  /* ================================================================== */
  /* CAMPFIRE                                                            */
  /* ================================================================== */

  function bakeCampfire() {
    const far = plate();
    const mid = plate();
    const near = plate();
    const fore = plate();
    const ex: SceneExtras = {};
    EX.campfire = ex;

    /* ---- far: sky, stars, moon, distant ridges -------------------- */
    const g = far.g;
    const sky = g.createLinearGradient(0, -PAD, 0, H * 0.7);
    sky.addColorStop(0, '#020408');
    sky.addColorStop(0.28, '#061224');
    sky.addColorStop(0.55, '#0b2138');
    sky.addColorStop(0.78, '#123a50');
    sky.addColorStop(0.92, '#175048');
    sky.addColorStop(1, '#0e2a20');
    g.fillStyle = sky;
    g.fillRect(-PAD, -PAD, W + PAD * 2, H + PAD * 2);

    const rnd = mulberry(0x77);
    g.save();
    g.translate(W * 0.45, H * 0.2);
    g.rotate(-0.34);
    g.translate(-W * 0.45, -H * 0.2);
    const milky = g.createLinearGradient(0, H * 0.06, 0, H * 0.34);
    milky.addColorStop(0, 'rgba(170,195,255,0)');
    milky.addColorStop(0.5, 'rgba(190,210,255,0.10)');
    milky.addColorStop(1, 'rgba(170,195,255,0)');
    g.fillStyle = milky;
    g.fillRect(-W * 0.3, H * 0.02, W * 1.6, H * 0.36);
    g.globalCompositeOperation = 'screen';
    for (let i = 0; i < 260; i += 1) {
      g.fillStyle = `rgba(216,226,255,${0.03 + rnd() * 0.09})`;
      g.beginPath();
      g.arc(rnd() * W * 1.4 - W * 0.2, H * (0.05 + rnd() * 0.3), 0.5 + rnd() * 1.4, 0, Math.PI * 2);
      g.fill();
    }
    g.restore();
    g.globalCompositeOperation = 'source-over';

    for (let i = 0; i < 240; i += 1) {
      const x = rnd() * (W + PAD * 2) - PAD;
      const y = rnd() * H * 0.48 - PAD * 0.5;
      const a = 0.14 + rnd() * 0.66;
      const r = 0.4 + rnd() * 1.2;
      g.fillStyle = `rgba(255,250,236,${a})`;
      g.beginPath();
      g.arc(x, y, r, 0, Math.PI * 2);
      g.fill();
      if (rnd() > 0.955) {
        g.strokeStyle = `rgba(255,250,236,${a * 0.5})`;
        g.lineWidth = 0.8;
        g.beginPath();
        g.moveTo(x - r * 4, y);
        g.lineTo(x + r * 4, y);
        g.moveTo(x, y - r * 4);
        g.lineTo(x, y + r * 4);
        g.stroke();
      }
    }

    const moonX = W * 0.76;
    const moonY = H * 0.13;
    const moonR = clamp(H * 0.05, 24, 46);
    ex.moon = { x: moonX, y: moonY, r: moonR };
    glow(g, moonX, moonY, moonR * 4.6, '#fff6dc', 0.13);
    glow(g, moonX, moonY, moonR * 1.7, '#fff8e4', 0.42);
    const moonGrad = g.createRadialGradient(
      moonX - moonR * 0.4,
      moonY - moonR * 0.4,
      moonR * 0.15,
      moonX,
      moonY,
      moonR,
    );
    moonGrad.addColorStop(0, '#fffef8');
    moonGrad.addColorStop(0.6, '#f2e7ca');
    moonGrad.addColorStop(1, '#cdc0a0');
    g.fillStyle = moonGrad;
    g.beginPath();
    g.arc(moonX, moonY, moonR, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = 'rgba(150,138,112,0.3)';
    (
      [
        [-0.25, 0.2, 0.2],
        [0.3, -0.28, 0.14],
        [0.16, 0.34, 0.17],
        [-0.42, -0.2, 0.1],
        [0.46, 0.18, 0.1],
      ] as const
    ).forEach(([dx, dy, r]) => {
      g.beginPath();
      g.arc(moonX + dx * moonR, moonY + dy * moonR, r * moonR, 0, Math.PI * 2);
      g.fill();
    });

    const ridge = (yBase: number, amp: number, color: string, seed: number) => {
      g.fillStyle = color;
      g.beginPath();
      g.moveTo(-PAD, H + PAD);
      g.lineTo(-PAD, yBase);
      for (let x = -PAD; x <= W + PAD; x += 22) {
        g.lineTo(x, yBase - fbm(x * 0.0016 + seed, seed, 4) * amp);
      }
      g.lineTo(W + PAD, H + PAD);
      g.closePath();
      g.fill();
    };
    ridge(H * 0.485, H * 0.13, '#0a1a2e', 3.1);
    ridge(H * 0.5, H * 0.085, '#0c2136', 8.7);

    /* ---- mid: far-shore pines + lake ------------------------------ */
    const m = mid.g;
    const LT = H * 0.505;
    const LB = H * 0.665;
    ex.lake = { top: LT, bot: LB };

    for (let x = -PAD; x <= W + PAD; x += 24) {
      const n = fbm(x * 0.004, 17, 4);
      const ph = 26 + n * 66;
      m.fillStyle = '#081420';
      m.beginPath();
      m.moveTo(x - 15, LT + 2);
      m.lineTo(x, LT + 2 - ph);
      m.lineTo(x + 15, LT + 2);
      m.closePath();
      m.fill();
      m.fillStyle = '#0a1826';
      m.beginPath();
      m.moveTo(x - 9, LT + 2 - ph * 0.34);
      m.lineTo(x, LT + 2 - ph);
      m.lineTo(x + 9, LT + 2 - ph * 0.34);
      m.closePath();
      m.fill();
    }
    m.save();
    m.globalCompositeOperation = 'screen';
    const rim = m.createLinearGradient(0, LT - 70, 0, LT);
    rim.addColorStop(0, 'rgba(62,224,160,0.09)');
    rim.addColorStop(1, 'rgba(62,224,160,0)');
    m.fillStyle = rim;
    m.fillRect(-PAD, LT - 70, W + PAD * 2, 70);
    m.restore();

    const lakeGrad = m.createLinearGradient(0, LT, 0, LB);
    lakeGrad.addColorStop(0, '#0a2334');
    lakeGrad.addColorStop(0.4, '#0e3348');
    lakeGrad.addColorStop(0.75, '#0b283c');
    lakeGrad.addColorStop(1, '#081c28');
    m.fillStyle = lakeGrad;
    m.fillRect(-PAD, LT, W + PAD * 2, LB - LT);

    m.fillStyle = 'rgba(5,10,16,0.55)';
    m.beginPath();
    m.moveTo(-PAD, LT);
    for (let x = -PAD; x <= W + PAD; x += 22) {
      m.lineTo(x, LT + 6 + fbm(x * 0.004, 17, 3) * 16);
    }
    m.lineTo(W + PAD, LT);
    m.closePath();
    m.fill();

    m.save();
    m.globalCompositeOperation = 'screen';
    const auRef = m.createLinearGradient(0, LT, 0, LB);
    auRef.addColorStop(0, 'rgba(62,224,160,0.10)');
    auRef.addColorStop(0.5, 'rgba(90,164,232,0.05)');
    auRef.addColorStop(1, 'rgba(62,224,160,0)');
    m.fillStyle = auRef;
    m.fillRect(-PAD, LT, W + PAD * 2, LB - LT);
    const pillar = m.createLinearGradient(0, LT, 0, LB);
    pillar.addColorStop(0, 'rgba(255,246,220,0.30)');
    pillar.addColorStop(0.7, 'rgba(255,246,220,0.08)');
    pillar.addColorStop(1, 'rgba(255,246,220,0)');
    m.fillStyle = pillar;
    m.fillRect(moonX - 16, LT, 32, LB - LT);
    m.restore();

    m.strokeStyle = 'rgba(40,84,116,0.4)';
    m.lineWidth = 1.1;
    for (let i = 0; i < 6; i += 1) {
      const yy = LT + 12 + i * ((LB - LT) * 0.15);
      m.beginPath();
      for (let x = -PAD; x < W + PAD; x += 14) {
        const y = yy + Math.sin(x * 0.02 + i * 2) * 2.2;
        if (x === -PAD) m.moveTo(x, y);
        else m.lineTo(x, y);
      }
      m.stroke();
    }
    const mist = m.createLinearGradient(0, LB - 22, 0, LB + 8);
    mist.addColorStop(0, 'rgba(127,192,209,0)');
    mist.addColorStop(0.55, 'rgba(127,192,209,0.13)');
    mist.addColorStop(1, 'rgba(127,192,209,0)');
    m.fillStyle = mist;
    m.fillRect(-PAD, LB - 24, W + PAD * 2, 34);

    /* ---- near: shore, grass, tent, edge pines --------------------- */
    const n = near.g;
    const shoreAt = (x: number) =>
      H * 0.645 + Math.sin(x * 0.012) * 6 + (fbm(x * 0.01, 4, 3) - 0.5) * 12;
    n.beginPath();
    n.moveTo(-PAD, H + PAD);
    n.lineTo(-PAD, shoreAt(-PAD));
    for (let x = -PAD; x <= W + PAD; x += 16) n.lineTo(x, shoreAt(x));
    n.lineTo(W + PAD, H + PAD);
    n.closePath();
    const ground = n.createLinearGradient(0, H * 0.63, 0, H + PAD);
    ground.addColorStop(0, '#172c20');
    ground.addColorStop(0.5, '#101f16');
    ground.addColorStop(1, '#070f0b');
    n.fillStyle = ground;
    n.fill();

    clipDraw(
      n,
      () => {
        n.moveTo(-PAD, H + PAD);
        n.lineTo(-PAD, shoreAt(-PAD));
        for (let x = -PAD; x <= W + PAD; x += 16) n.lineTo(x, shoreAt(x));
        n.lineTo(W + PAD, H + PAD);
        n.closePath();
      },
      () => {
        fillPat(n, tex('grass'), -PAD, H * 0.62, W + PAD * 2, H * 0.5, 0.9);
        const dirt = n.createRadialGradient(
          W * 0.5,
          H * 0.85,
          30,
          W * 0.5,
          H * 0.87,
          Math.min(W, H) * 0.5,
        );
        dirt.addColorStop(0, 'rgba(66,42,22,0.9)');
        dirt.addColorStop(0.5, 'rgba(52,34,18,0.55)');
        dirt.addColorStop(1, 'rgba(52,34,18,0)');
        n.fillStyle = dirt;
        n.fillRect(-PAD, H * 0.6, W + PAD * 2, H * 0.5 + PAD);
        const edgeShade = n.createLinearGradient(0, 0, W, 0);
        edgeShade.addColorStop(0, 'rgba(3,8,7,0.55)');
        edgeShade.addColorStop(0.28, 'rgba(3,8,7,0)');
        edgeShade.addColorStop(0.72, 'rgba(3,8,7,0)');
        edgeShade.addColorStop(1, 'rgba(3,8,7,0.55)');
        n.fillStyle = edgeShade;
        n.fillRect(-PAD, H * 0.6, W + PAD * 2, H * 0.5 + PAD);
        n.globalCompositeOperation = 'screen';
        const warmBase = n.createRadialGradient(
          W * 0.5,
          H * 0.82,
          20,
          W * 0.5,
          H * 0.84,
          Math.min(W, H) * 0.44,
        );
        warmBase.addColorStop(0, 'rgba(226,147,73,0.22)');
        warmBase.addColorStop(1, 'rgba(226,147,73,0)');
        n.fillStyle = warmBase;
        n.fillRect(-PAD, H * 0.6, W + PAD * 2, H * 0.5 + PAD);
        n.globalCompositeOperation = 'source-over';
      },
    );
    n.strokeStyle = 'rgba(180,214,224,0.16)';
    n.lineWidth = 2;
    n.beginPath();
    for (let x = -PAD; x <= W + PAD; x += 16) {
      const y = shoreAt(x) + 1.5;
      if (x === -PAD) n.moveTo(x, y);
      else n.lineTo(x, y);
    }
    n.stroke();
    n.strokeStyle = 'rgba(90,72,50,0.4)';
    n.beginPath();
    for (let x = -PAD; x <= W + PAD; x += 16) {
      const y = shoreAt(x) + 5;
      if (x === -PAD) n.moveTo(x, y);
      else n.lineTo(x, y);
    }
    n.stroke();

    /* tent on the open shore, left of the fire */
    const TXx = W * 0.245;
    const TYy = H * 0.7;
    const th = H * 0.2;
    ex.tent = { x: TXx, y: TYy, h: th };
    n.save();
    n.translate(TXx, TYy);
    ellipse(n, 4, 8, th * 0.62, th * 0.085, 'rgba(2,6,8,0.5)');
    const canL = n.createLinearGradient(-th * 0.62, 0, 0, 0);
    canL.addColorStop(0, '#153a4c');
    canL.addColorStop(1, '#1c4a5e');
    n.fillStyle = canL;
    n.beginPath();
    n.moveTo(-th * 0.64, 6);
    n.quadraticCurveTo(-th * 0.34, -th * 0.42, 0, -th);
    n.quadraticCurveTo(-th * 0.2, -th * 0.14, -th * 0.4, 6);
    n.closePath();
    n.fill();
    const canR = n.createLinearGradient(0, 0, th * 0.66, 0);
    canR.addColorStop(0, '#20586e');
    canR.addColorStop(0.7, '#2f86a1');
    canR.addColorStop(1, '#3d97b0');
    n.fillStyle = canR;
    n.beginPath();
    n.moveTo(th * 0.64, 6);
    n.quadraticCurveTo(th * 0.34, -th * 0.42, 0, -th);
    n.quadraticCurveTo(th * 0.2, -th * 0.14, th * 0.4, 6);
    n.closePath();
    n.fill();
    n.fillStyle = '#11303e';
    n.beginPath();
    n.moveTo(-th * 0.41, 6);
    n.lineTo(0, -th * 0.9);
    n.lineTo(th * 0.41, 6);
    n.closePath();
    n.fill();
    const doorGlow = n.createLinearGradient(0, -th * 0.6, 0, 6);
    doorGlow.addColorStop(0, 'rgba(244,194,122,0.5)');
    doorGlow.addColorStop(1, 'rgba(226,147,73,0.16)');
    n.fillStyle = doorGlow;
    n.beginPath();
    n.moveTo(-th * 0.2, 6);
    n.lineTo(0, -th * 0.56);
    n.lineTo(th * 0.2, 6);
    n.closePath();
    n.fill();
    n.fillStyle = '#1a4456';
    n.beginPath();
    n.moveTo(th * 0.05, -th * 0.5);
    n.quadraticCurveTo(th * 0.3, -th * 0.2, th * 0.26, 6);
    n.lineTo(th * 0.41, 6);
    n.lineTo(th * 0.06, -th * 0.62);
    n.closePath();
    n.fill();
    n.strokeStyle = 'rgba(8,20,28,0.5)';
    n.lineWidth = 1.3;
    for (let i = 1; i < 6; i += 1) {
      n.beginPath();
      n.moveTo(-th * 0.4 + i * th * 0.1, 5);
      n.quadraticCurveTo(-th * 0.1 + i * th * 0.02, -th * 0.4, 0 - i * 2, -th * 0.92);
      n.stroke();
    }
    n.strokeStyle = '#548ba0';
    n.lineWidth = 2.6;
    n.beginPath();
    n.moveTo(-th * 0.64, 6);
    n.quadraticCurveTo(0, -th * 1.16, th * 0.64, 6);
    n.stroke();
    n.strokeStyle = 'rgba(214,236,244,0.35)';
    n.lineWidth = 1.2;
    n.beginPath();
    n.moveTo(-th * 0.62, 4);
    n.lineTo(-th * 0.8, 16);
    n.moveTo(th * 0.62, 4);
    n.lineTo(th * 0.8, 16);
    n.stroke();
    n.fillStyle = '#c99b52';
    (
      [
        [-th * 0.8, 16],
        [th * 0.8, 16],
      ] as const
    ).forEach(([sx, sy]) => {
      n.fillRect(sx - 1.4, sy - 2, 2.8, 8);
    });
    n.fillStyle = '#e29349';
    n.beginPath();
    n.moveTo(0, -th * 1.02);
    n.lineTo(th * 0.14, -th * 0.96);
    n.lineTo(0, -th * 0.9);
    n.closePath();
    n.fill();
    n.restore();

    /* frame-edge pines (kept clear of the tent) */
    pine(n, W * 0.035, H * 0.88, H * 0.68, 0xa1, true, 1);
    pine(n, W * 0.1, H * 0.8, H * 0.44, 0xa2, true, 1);
    pine(n, W * 0.965, H * 0.89, H * 0.72, 0xa3, true, -1);
    pine(n, W * 0.9, H * 0.8, H * 0.46, 0xa4, true, -1);

    const rrock = mulberry(0x5e);
    for (let i = 0; i < 7; i += 1) {
      const x = W * (0.12 + rrock() * 0.76);
      const y = H * (0.68 + rrock() * 0.06);
      const r = 3 + rrock() * 6;
      ellipse(n, x, y + r * 0.4, r, r * 0.36, 'rgba(3,8,8,0.5)');
      ellipse(
        n,
        x,
        y,
        r,
        r * 0.66,
        `rgb(${(70 + rrock() * 24) | 0},${(74 + rrock() * 18) | 0},${76 | 0})`,
      );
      ellipse(n, x - r * 0.25, y - r * 0.2, r * 0.5, r * 0.3, 'rgba(226,147,73,0.25)');
    }

    /* ---- fore: the fire ring at your knees ------------------------ */
    const f = fore.g;
    const FX = W * 0.5;
    const FY = H * 0.79;
    const fs = clamp(Math.min(W, H) / 620, 0.9, 1.9);
    ex.fire = { x: FX, y: FY, s: fs };

    ellipse(f, FX, FY + 48 * fs, 175 * fs, 34 * fs, 'rgba(3,8,10,0.55)');
    /* char bed */
    ellipse(f, FX, FY + 14 * fs, 96 * fs, 26 * fs, '#120a06');
    ellipse(f, FX, FY + 12 * fs, 82 * fs, 20 * fs, '#1c0f08');

    /* burning logs */
    const burnLog = (dx: number, dy: number, len: number, thick: number, rot: number) => {
      f.save();
      f.translate(FX + dx * fs, FY + dy * fs);
      f.rotate(rot);
      clipDraw(
        f,
        () =>
          f.roundRect(-len * 0.5 * fs, -thick * 0.5 * fs, len * fs, thick * fs, thick * 0.5 * fs),
        () =>
          fillPat(f, tex('bark'), -len * 0.5 * fs, -thick * 0.6 * fs, len * fs, thick * 1.3 * fs),
      );
      const charG = f.createLinearGradient(-len * 0.5 * fs, 0, len * 0.5 * fs, 0);
      charG.addColorStop(0, 'rgba(8,4,2,0.1)');
      charG.addColorStop(0.5, 'rgba(8,4,2,0.75)');
      charG.addColorStop(1, 'rgba(8,4,2,0.1)');
      f.fillStyle = charG;
      f.beginPath();
      f.roundRect(-len * 0.5 * fs, -thick * 0.5 * fs, len * fs, thick * fs, thick * 0.5 * fs);
      f.fill();
      f.strokeStyle = 'rgba(255,138,48,0.75)';
      f.lineWidth = 1.6 * fs;
      for (let k = -2; k <= 2; k += 1) {
        f.beginPath();
        f.moveTo(k * len * 0.16 * fs, -thick * 0.24 * fs);
        f.lineTo(k * len * 0.16 * fs + 5 * fs, thick * 0.22 * fs);
        f.stroke();
      }
      f.restore();
    };
    burnLog(-16, 8, 130, 22, -0.32);
    burnLog(18, 10, 126, 21, 0.36);
    burnLog(0, 2, 110, 18, 0.02);
    glow(f, FX, FY + 6 * fs, 60 * fs, '#ff9a3c', 0.5);
    glow(f, FX - 30 * fs, FY + 12 * fs, 24 * fs, '#ffb24a', 0.5);
    glow(f, FX + 34 * fs, FY + 12 * fs, 22 * fs, '#ff8a30', 0.45);

    /* ring stones — front arc only so live flames sit behind them */
    const stoneAngles = [0.12, 0.24, 0.36, 0.48, 0.6, 0.72, 0.84, 0.96];
    stoneAngles.forEach((u, i) => {
      const a = Math.PI * u;
      const sxp = FX + Math.cos(a) * 152 * fs;
      const syp = FY + 26 * fs + Math.sin(a) * 52 * fs;
      const rx = (26 + hashi(i, 3) * 12) * fs;
      const ry = rx * (0.62 + hashi(i, 5) * 0.12);
      ellipse(f, sxp, syp + ry * 0.55, rx * 1.05, ry * 0.42, 'rgba(3,8,10,0.5)');
      const sg = f.createRadialGradient(
        sxp - rx * 0.2,
        syp - ry * 0.5,
        rx * 0.1,
        sxp,
        syp,
        rx * 1.2,
      );
      const nn = hashi(i, 9);
      sg.addColorStop(0, `rgb(${(118 + nn * 26) | 0},${(118 + nn * 18) | 0},${116 | 0})`);
      sg.addColorStop(0.6, `rgb(${(76 + nn * 20) | 0},${(80 + nn * 14) | 0},${82 | 0})`);
      sg.addColorStop(1, `rgb(${44 | 0},${48 | 0},${52 | 0})`);
      f.fillStyle = sg;
      f.beginPath();
      f.ellipse(sxp, syp, rx, ry, (nn - 0.5) * 0.3, 0, Math.PI * 2);
      f.fill();
      f.fillStyle = hex('#ffb24a', 0.24 + nn * 0.14);
      f.beginPath();
      f.ellipse(
        sxp - Math.cos(a) * rx * 0.3,
        syp - ry * 0.42,
        rx * 0.55,
        ry * 0.4,
        0,
        0,
        Math.PI * 2,
      );
      f.fill();
      f.fillStyle = hex('#3d6a3a', 0.14);
      f.beginPath();
      f.ellipse(sxp + rx * 0.3, syp + ry * 0.3, rx * 0.35, ry * 0.24, 0, 0, Math.PI * 2);
      f.fill();
    });

    /* seating logs cropping the bottom — you are sitting here */
    const seatLog = (
      cx: number,
      cy: number,
      len: number,
      thick: number,
      rot: number,
      mirror: boolean,
    ) => {
      f.save();
      f.translate(cx, cy);
      f.rotate(rot);
      ellipse(f, 0, thick * 0.66, len * 0.54, thick * 0.4, 'rgba(2,6,8,0.5)');
      clipDraw(
        f,
        () => f.roundRect(-len / 2, -thick / 2, len, thick, thick * 0.5),
        () => {
          fillPat(f, tex('bark'), -len / 2, -thick * 0.6, len, thick * 1.35, 0.95);
          const shade = f.createLinearGradient(0, -thick / 2, 0, thick / 2);
          shade.addColorStop(0, 'rgba(255,178,74,0.28)');
          shade.addColorStop(0.35, 'rgba(0,0,0,0)');
          shade.addColorStop(1, 'rgba(4,2,1,0.6)');
          f.fillStyle = shade;
          f.fillRect(-len / 2, -thick / 2, len, thick);
        },
      );
      /* worn sitting surface */
      clipDraw(
        f,
        () => f.ellipse(0, -thick * 0.34, len * 0.42, thick * 0.2, 0, 0, Math.PI * 2),
        () => {
          fillPat(f, tex('wood'), -len * 0.42, -thick * 0.56, len * 0.84, thick * 0.44, 0.95);
          f.fillStyle = 'rgba(255,205,140,0.16)';
          f.fillRect(-len * 0.42, -thick * 0.56, len * 0.84, thick * 0.44);
        },
      );
      const endX = mirror ? -len / 2 + 6 : len / 2 - 6;
      clipDraw(
        f,
        () => f.ellipse(endX, 0, thick * 0.44, thick * 0.5, 0, 0, Math.PI * 2),
        () =>
          fillPat(f, tex('endgrain'), endX - thick * 0.5, -thick * 0.52, thick, thick * 1.05, 0.98),
      );
      f.restore();
    };
    seatLog(W * 0.155, H * 0.965, W * 0.44, 62, -0.05, false);
    seatLog(W * 0.845, H * 0.975, W * 0.42, 58, 0.06, true);

    /* plaid blanket folded on the right log */
    f.save();
    f.translate(W * 0.78, H * 0.938);
    f.rotate(0.05);
    rr(f, -52, -18, 104, 30, 8, '#8a3c1c');
    f.strokeStyle = 'rgba(226,194,137,0.6)';
    f.lineWidth = 2.4;
    for (let k = -1; k <= 1; k += 1) {
      f.beginPath();
      f.moveTo(-52, k * 9);
      f.lineTo(52, k * 9);
      f.stroke();
    }
    f.strokeStyle = 'rgba(37,88,110,0.55)';
    for (let k = -2; k <= 2; k += 1) {
      f.beginPath();
      f.moveTo(k * 22, -18);
      f.lineTo(k * 22, 12);
      f.stroke();
    }
    f.fillStyle = 'rgba(255,220,170,0.12)';
    f.fillRect(-52, -18, 104, 5);
    f.restore();

    /* enamel mug on the left log */
    f.save();
    f.translate(W * 0.23, H * 0.925);
    ellipse(f, 0, 13, 15, 4.4, 'rgba(2,6,8,0.5)');
    rr(f, -11, -12, 22, 24, 4, '#2f86a1');
    const mugHi = f.createLinearGradient(-11, 0, 11, 0);
    mugHi.addColorStop(0, 'rgba(255,255,255,0.24)');
    mugHi.addColorStop(0.4, 'rgba(255,255,255,0)');
    mugHi.addColorStop(1, 'rgba(0,0,0,0.24)');
    f.fillStyle = mugHi;
    f.fillRect(-11, -12, 22, 24);
    ellipse(f, 0, -12, 11, 3.4, '#1c4a5e');
    ellipse(f, 0, -12, 8.4, 2.4, '#3a2214');
    f.strokeStyle = '#fdf6ec';
    f.lineWidth = 2.6;
    f.beginPath();
    f.arc(13, -1, 6.5, -Math.PI * 0.45, Math.PI * 0.45);
    f.stroke();
    f.restore();

    /* marshmallow stick from your seat */
    f.save();
    f.strokeStyle = '#6a4a2c';
    f.lineWidth = 4.4;
    f.lineCap = 'round';
    f.beginPath();
    f.moveTo(W * 0.63, H + 20);
    f.quadraticCurveTo(W * 0.6, H * 0.92, W * 0.552, H * 0.845);
    f.stroke();
    f.strokeStyle = 'rgba(255,205,140,0.35)';
    f.lineWidth = 1.4;
    f.beginPath();
    f.moveTo(W * 0.626, H + 20);
    f.quadraticCurveTo(W * 0.597, H * 0.92, W * 0.55, H * 0.848);
    f.stroke();
    f.save();
    f.translate(W * 0.549, H * 0.842);
    f.rotate(-0.5);
    rr(f, -7, -9, 14, 15, 5, '#fdf6ec');
    f.fillStyle = 'rgba(198,124,52,0.8)';
    f.beginPath();
    f.roundRect(-7, 2, 14, 4, 3);
    f.fill();
    f.restore();
    f.restore();

    plates.campfire = [far, mid, near, fore];
  }

  /** Narrows a baked scene's anchors, or reports the bake never ran. */
  function readyExtras<K extends keyof SceneExtras>(
    ex: SceneExtras,
    keys: readonly K[],
  ): ReadyExtras<K> | null {
    return keys.every((key) => ex[key] !== undefined) ? (ex as ReadyExtras<K>) : null;
  }

  function liveCampfire(t: number) {
    blitPlates(plates.campfire ?? []);
    const ex = readyExtras(EX.campfire, ['moon', 'lake', 'tent', 'fire'] as const);
    if (!ex) return;

    /* aurora curtains — full width, three interleaved colors */
    withDepth(DEPTHS[0], () => {
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      const step = Math.max(18, W / 70);
      const passes = [
        { spr: spr('curtG'), ph: 0, sp: 0.055, base: H * 0.34, y0: H * 0.01, aK: 0.6 },
        { spr: spr('curtB'), ph: 40, sp: 0.04, base: H * 0.27, y0: H * 0.05, aK: 0.38 },
        { spr: spr('curtP'), ph: 90, sp: 0.075, base: H * 0.2, y0: H * 0.1, aK: 0.24 },
      ];
      passes.forEach((p) => {
        for (let x = -PAD; x < W + PAD; x += step) {
          const n1 = fbm(x * 0.0038 + p.ph, t * p.sp, 3);
          const n2 = fbm(x * 0.005 + p.ph + 31, t * p.sp * 1.35, 3);
          const hgt = p.base * (0.4 + n1 * 1.05);
          const sway = Math.sin(t * 0.28 + x * 0.0022 + p.ph) * 12;
          ctx.globalAlpha = p.aK * (0.3 + n2 * 0.7);
          ctx.drawImage(p.spr, x, p.y0 + sway, step + 1.5, hgt);
        }
      });
      ctx.globalAlpha = 1;
      ctx.restore();

      twinkles.forEach((s) => {
        const tw = 0.3 + 0.7 * (0.5 + 0.5 * Math.sin(t * s.s + s.p));
        ctx.fillStyle = `rgba(255,250,236,${s.a * tw})`;
        ctx.beginPath();
        ctx.arc(s.x * W, s.y * H, s.r, 0, Math.PI * 2);
        ctx.fill();
      });
      const shoot = (delay: number, x: number, y: number) => {
        const u = ((t + delay) % 17) / 17;
        if (u < 0.045) {
          const p = u / 0.045;
          ctx.save();
          ctx.globalAlpha = 1 - p;
          ctx.translate(x, y);
          ctx.rotate(2.62);
          const streak = ctx.createLinearGradient(p * 360, 0, p * 360 + 100, 0);
          streak.addColorStop(0, 'rgba(255,250,236,0.9)');
          streak.addColorStop(1, 'rgba(255,250,236,0)');
          ctx.fillStyle = streak;
          ctx.fillRect(p * 360, -1, 100, 2);
          ctx.restore();
        }
      };
      shoot(4, W * 0.62, H * 0.1);
      shoot(11.3, W * 0.28, H * 0.06);
    });

    /* lake shimmer: moon pillar, aurora reflection, fire reflection */
    withDepth(DEPTHS[1], () => {
      const { top, bot } = ex.lake;
      ctx.save();
      ctx.beginPath();
      ctx.rect(-PAD, top, W + PAD * 2, bot - top);
      ctx.clip();
      ctx.globalCompositeOperation = 'screen';
      const mX = ex.moon.x;
      for (let i = 0; i < 7; i += 1) {
        const yy = top + 8 + i * ((bot - top) * 0.135);
        const wob = Math.sin(t * 1.3 + i * 1.8) * 9;
        const a = 0.1 + 0.1 * Math.sin(t * 2 + i * 2.4);
        ctx.fillStyle = `rgba(255,246,220,${Math.max(0, a)})`;
        ctx.fillRect(mX - 13 + wob, yy, 26 - i * 2.4, 2.4);
      }
      ctx.globalAlpha = 0.09 + 0.045 * Math.sin(t * 0.5);
      ctx.save();
      ctx.translate(0, top);
      ctx.scale(1, -0.5);
      ctx.translate(0, -(bot - top) * 2);
      ctx.drawImage(spr('curtG'), 0, (bot - top) * 0.9, W, (bot - top) * 1.1);
      ctx.restore();
      ctx.globalAlpha = 1;
      for (let i = 0; i < 5; i += 1) {
        const yy = bot - 5 - i * 8;
        const wob = Math.sin(t * 2.1 + i * 2.2) * 12;
        ctx.fillStyle = `rgba(255,160,74,${0.12 - i * 0.02 + 0.04 * Math.sin(t * 3 + i)})`;
        ctx.fillRect(W * 0.5 - 40 + wob + i * 6, yy, 80 - i * 12, 2.6);
      }
      ctx.globalCompositeOperation = 'source-over';
      ctx.strokeStyle = `rgba(160,210,230,${0.07 + 0.05 * Math.sin(t * 1.7)})`;
      ctx.lineWidth = 1.1;
      for (let i = 0; i < 3; i += 1) {
        const yy = top + 16 + i * 16 + Math.sin(t * 0.8 + i) * 2;
        ctx.beginPath();
        for (let x = -20; x < W + 20; x += 16) {
          const y = yy + Math.sin(x * 0.02 + t * 1.2 + i) * 2.2;
          if (x === -20) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
      ctx.restore();
    });

    /* fireflies + tent glow flicker */
    withDepth(DEPTHS[2], () => {
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      flies.forEach((fl) => {
        const u = 0.5 + 0.5 * Math.sin(t * (6 / fl.s) + fl.p);
        const x = (fl.x + Math.sin(t * 0.6 + fl.p) * fl.ox) * W;
        const y = (fl.y + Math.cos(t * 0.45 + fl.p) * fl.oy) * H;
        ctx.globalAlpha = 0.1 + u * 0.85;
        glow(ctx, x, y, 6, '#cede6a', 0.85);
      });
      ctx.globalAlpha = 1;
      const tn = ex.tent;
      glow(ctx, tn.x, tn.y - tn.h * 0.24, tn.h * 0.34, '#f4c27a', 0.16 + 0.05 * Math.sin(t * 2.4));
      ctx.restore();
    });

    /* the fire itself */
    withDepth(DEPTHS[3], () => {
      const { x: FX, y: FY, s: fs } = ex.fire;
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      const breathe = 0.5 + 0.5 * Math.sin(t * 2.7) * 0.5 + 0.25 * Math.sin(t * 7.3);
      glow(ctx, FX, FY - 30 * fs, 240 * fs, '#ffb24a', 0.2 + 0.05 * breathe);
      glow(ctx, FX, FY, 110 * fs, '#ffd9a0', 0.28 + 0.06 * breathe);
      ctx.restore();

      tongue(ctx, t, FX, FY + 6 * fs, 62 * fs, 205 * fs, hex('#b8431c', 0.66), 0.3, 4 * fs);
      tongue(ctx, t, FX, FY + 6 * fs, 48 * fs, 170 * fs, hex('#e26a28', 0.88), 1.3, -3 * fs);
      tongue(
        ctx,
        t,
        FX - 34 * fs,
        FY + 10 * fs,
        17 * fs,
        66 * fs,
        hex('#e29349', 0.85),
        4.1,
        -5 * fs,
      );
      tongue(
        ctx,
        t,
        FX + 36 * fs,
        FY + 10 * fs,
        15 * fs,
        58 * fs,
        hex('#e28434', 0.85),
        5.3,
        6 * fs,
      );
      tongue(
        ctx,
        t,
        FX,
        FY + 4 * fs,
        33 * fs,
        126 * fs,
        hex('#f6a94f', 0.95),
        2.2,
        2 * fs,
        'lighter',
      );
      tongue(ctx, t, FX, FY + 2 * fs, 18 * fs, 74 * fs, hex('#fff3d6', 0.95), 3.4, 0, 'lighter');

      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      embersCF.forEach((e) => {
        const u = ((t + e.delay) % e.life) / e.life;
        const x = FX + e.x * fs + Math.sin(u * 7 + e.delay) * e.sway * fs * u;
        const y = FY - u * e.lift * fs;
        const a = u < 0.12 ? u / 0.12 : 1 - (u - 0.12) / 0.88;
        ctx.globalAlpha = Math.max(0, a);
        glow(ctx, x, y, e.r * 3 * fs, u > 0.6 ? '#c96a2c' : '#ffb24a', 0.9);
      });
      ctx.globalAlpha = 1;
      for (let i = 0; i < 4; i += 1) {
        const u = (t * 0.1 + i * 0.25) % 1;
        glow(
          ctx,
          FX + Math.sin(t * 0.8 + i * 2) * 18 * fs + u * 24,
          FY - 130 * fs - u * 200 * fs,
          (26 + i * 6 + u * 30) * fs,
          '#8fa8b8',
          0.08 * (1 - u),
        );
      }
      // The firelight wash covers the whole scene and its stops only ever scale
      // together with the flicker, so the gradient is built once and the
      // flicker rides on globalAlpha instead of three new colour stops a frame.
      if (!washGradient || washFor !== `${FX}:${FY}:${W}:${H}`) {
        washGradient = ctx.createRadialGradient(FX, FY, 16, FX, FY, Math.max(W, H) * 0.66);
        washGradient.addColorStop(0, 'rgba(226,147,73,1)');
        washGradient.addColorStop(0.3, 'rgba(226,147,73,0.4)');
        washGradient.addColorStop(1, 'rgba(226,147,73,0)');
        washFor = `${FX}:${FY}:${W}:${H}`;
      }
      const flick = 0.36 + 0.05 * Math.sin(t * 3.1) + 0.03 * Math.sin(t * 8.7);
      const ambient = ctx.globalAlpha;
      ctx.globalAlpha = ambient * flick;
      ctx.fillStyle = washGradient;
      ctx.fillRect(-PAD, -PAD, W + PAD * 2, H + PAD * 2);
      ctx.globalAlpha = ambient;
      ctx.restore();
    });
  }

  /* ================================================================== */
  /* CASINO                                                              */
  /* ================================================================== */

  function bakeCasino() {
    const far = plate();
    const mid = plate();
    const near = plate();
    const fore = plate();
    const ex: SceneExtras = {};
    EX.casino = ex;
    const k = clamp(Math.min(W, H) / 820, 0.7, 1.3);

    /* ---- far: wall, sign plaque, wainscot -------------------------- */
    const g = far.g;
    const RAIL = H * 0.6;
    const WBOT = H * 0.665;
    const wall = g.createLinearGradient(0, -PAD, 0, RAIL);
    wall.addColorStop(0, '#170710');
    wall.addColorStop(0.45, '#2c1019');
    wall.addColorStop(0.8, '#3d1522');
    wall.addColorStop(1, '#2c1018');
    g.fillStyle = wall;
    g.fillRect(-PAD, -PAD, W + PAD * 2, RAIL + PAD);
    fillPat(g, tex('damask'), -PAD, -PAD, W + PAD * 2, RAIL + PAD, 0.9);
    const wallShade = g.createLinearGradient(0, 0, W, 0);
    wallShade.addColorStop(0, 'rgba(10,3,6,0.5)');
    wallShade.addColorStop(0.25, 'rgba(10,3,6,0)');
    wallShade.addColorStop(0.75, 'rgba(10,3,6,0)');
    wallShade.addColorStop(1, 'rgba(10,3,6,0.5)');
    g.fillStyle = wallShade;
    g.fillRect(-PAD, -PAD, W + PAD * 2, RAIL + PAD);
    g.save();
    g.globalCompositeOperation = 'screen';
    const warmBand = g.createLinearGradient(0, H * 0.16, 0, H * 0.56);
    warmBand.addColorStop(0, 'rgba(255,190,110,0.10)');
    warmBand.addColorStop(0.55, 'rgba(255,180,100,0.05)');
    warmBand.addColorStop(1, 'rgba(255,180,100,0)');
    g.fillStyle = warmBand;
    g.fillRect(-PAD, H * 0.14, W + PAD * 2, H * 0.44);
    g.restore();

    /* ceiling cove */
    g.fillStyle = 'rgba(8,2,5,0.62)';
    g.fillRect(-PAD, -PAD, W + PAD * 2, PAD + H * 0.05);
    const cove = g.createLinearGradient(0, H * 0.05, 0, H * 0.12);
    cove.addColorStop(0, 'rgba(8,2,5,0.4)');
    cove.addColorStop(1, 'rgba(8,2,5,0)');
    g.fillStyle = cove;
    g.fillRect(-PAD, H * 0.05, W + PAD * 2, H * 0.07);
    g.fillStyle = '#c99b52';
    g.fillRect(-PAD, H * 0.05, W + PAD * 2, 2.4);
    g.fillStyle = 'rgba(255,231,184,0.4)';
    g.fillRect(-PAD, H * 0.05, W + PAD * 2, 1);

    /* framed wall art */
    const art = (ax: number, motifPaint: (aw: number, ah: number) => void) => {
      const aw = 84 * k;
      const ah = 106 * k;
      g.save();
      g.translate(ax, H * 0.315);
      g.fillStyle = 'rgba(8,2,4,0.5)';
      g.fillRect(-aw / 2 + 4, -ah / 2 + 5, aw, ah);
      const fr = g.createLinearGradient(0, -ah / 2, 0, ah / 2);
      fr.addColorStop(0, '#e2c289');
      fr.addColorStop(0.5, '#b9884a');
      fr.addColorStop(1, '#7a542a');
      g.fillStyle = fr;
      g.fillRect(-aw / 2, -ah / 2, aw, ah);
      g.fillStyle = '#1a0a10';
      g.fillRect(-aw / 2 + 7 * k, -ah / 2 + 7 * k, aw - 14 * k, ah - 14 * k);
      motifPaint(aw, ah);
      g.restore();
    };
    art(W * 0.27, (aw: number, ah: number) => {
      const pg = g.createLinearGradient(0, -ah / 2, 0, ah / 2);
      pg.addColorStop(0, '#25586e');
      pg.addColorStop(1, '#12293a');
      g.fillStyle = pg;
      g.fillRect(-aw / 2 + 9 * k, -ah / 2 + 9 * k, aw - 18 * k, ah - 18 * k);
      g.fillStyle = '#e2c289';
      g.font = `700 ${26 * k}px "Baloo 2", sans-serif`;
      g.textAlign = 'center';
      g.fillText('♠', 0, 8 * k);
      g.strokeStyle = 'rgba(226,194,137,0.4)';
      g.strokeRect(-aw / 2 + 13 * k, -ah / 2 + 13 * k, aw - 26 * k, ah - 26 * k);
    });
    art(W * 0.73, (aw: number, ah: number) => {
      const pg = g.createLinearGradient(0, -ah / 2, 0, ah / 2);
      pg.addColorStop(0, '#6b2434');
      pg.addColorStop(1, '#33101c');
      g.fillStyle = pg;
      g.fillRect(-aw / 2 + 9 * k, -ah / 2 + 9 * k, aw - 18 * k, ah - 18 * k);
      g.fillStyle = '#f2b06a';
      g.font = `700 ${26 * k}px "Baloo 2", sans-serif`;
      g.textAlign = 'center';
      g.fillText('♥', 0, 8 * k);
      g.strokeStyle = 'rgba(226,194,137,0.4)';
      g.strokeRect(-aw / 2 + 13 * k, -ah / 2 + 13 * k, aw - 26 * k, ah - 26 * k);
    });

    /* the parlour sign plaque (text is live for flicker) */
    const SW = clamp(W * 0.32, 300, 560);
    const SY = H * 0.165;
    ex.sign = { x: W * 0.5, y: SY, w: SW };
    glow(g, W * 0.5, SY, SW * 0.42, '#e29349', 0.13);
    g.save();
    g.shadowColor = 'rgba(0,0,0,0.55)';
    g.shadowBlur = 24;
    g.shadowOffsetY = 8;
    rr(g, W * 0.5 - SW / 2, SY - SW * 0.115, SW, SW * 0.23, SW * 0.055, '#12050a');
    g.restore();
    const plaqueG = g.createLinearGradient(0, SY - SW * 0.115, 0, SY + SW * 0.115);
    plaqueG.addColorStop(0, 'rgba(60,22,34,0.9)');
    plaqueG.addColorStop(1, 'rgba(22,8,13,0.95)');
    g.fillStyle = plaqueG;
    g.beginPath();
    g.roundRect(W * 0.5 - SW / 2, SY - SW * 0.115, SW, SW * 0.23, SW * 0.055);
    g.fill();
    g.strokeStyle = '#c99b52';
    g.lineWidth = 3;
    g.beginPath();
    g.roundRect(W * 0.5 - SW / 2 + 5, SY - SW * 0.115 + 5, SW - 10, SW * 0.23 - 10, SW * 0.05);
    g.stroke();
    g.strokeStyle = 'rgba(255,231,184,0.35)';
    g.lineWidth = 1.2;
    g.beginPath();
    g.roundRect(W * 0.5 - SW / 2 + 10, SY - SW * 0.115 + 10, SW - 20, SW * 0.23 - 20, SW * 0.045);
    g.stroke();
    (
      [
        [-1, -1],
        [1, -1],
        [-1, 1],
        [1, 1],
      ] as const
    ).forEach(([qx, qy]) => {
      ellipse(g, W * 0.5 + qx * (SW / 2 - 16), SY + qy * (SW * 0.115 - 14), 4, 4, '#e2c289');
      ellipse(g, W * 0.5 + qx * (SW / 2 - 17), SY + qy * (SW * 0.115 - 15), 1.6, 1.6, '#fff3d6');
    });

    /* gold rail + wainscot */
    const gold = g.createLinearGradient(0, RAIL, 0, RAIL + 12);
    gold.addColorStop(0, '#f7dfae');
    gold.addColorStop(0.45, '#c99b52');
    gold.addColorStop(1, '#6d4a1c');
    g.fillStyle = gold;
    g.fillRect(-PAD, RAIL, W + PAD * 2, 12);
    g.fillStyle = 'rgba(255,244,214,0.5)';
    g.fillRect(-PAD, RAIL + 1, W + PAD * 2, 1.6);
    clipDraw(
      g,
      () => g.rect(-PAD, RAIL + 12, W + PAD * 2, WBOT - RAIL - 12),
      () => {
        const wgrad = g.createLinearGradient(0, RAIL + 12, 0, WBOT);
        wgrad.addColorStop(0, '#3a2010');
        wgrad.addColorStop(1, '#1c0d06');
        g.fillStyle = wgrad;
        g.fillRect(-PAD, RAIL + 12, W + PAD * 2, WBOT - RAIL);
        fillPat(g, tex('wood'), -PAD, RAIL + 12, W + PAD * 2, WBOT - RAIL, 0.6);
        for (let x = 10; x < W + PAD; x += 128) {
          g.strokeStyle = 'rgba(20,8,3,0.6)';
          g.lineWidth = 2;
          g.strokeRect(x, RAIL + 20, 108, WBOT - RAIL - 30);
          g.strokeStyle = 'rgba(226,194,137,0.22)';
          g.lineWidth = 1.2;
          g.strokeRect(x + 5, RAIL + 25, 98, WBOT - RAIL - 40);
        }
      },
    );
    g.fillStyle = 'rgba(0,0,0,0.4)';
    g.fillRect(-PAD, WBOT - 4, W + PAD * 2, 4);

    /* sconces */
    const sconces: Anchor[] = [];
    ex.sconces = sconces;
    [W * 0.055, W * 0.945].forEach((sx) => {
      glow(g, sx, H * 0.345, 52 * k, '#f2b06a', 0.15);
      rr(g, sx - 3.4, H * 0.365, 6.8, 26 * k, 3, '#6d4a1c');
      g.fillStyle = '#c99b52';
      g.beginPath();
      g.moveTo(sx, H * 0.365);
      g.quadraticCurveTo(sx - 15 * k, H * 0.345, sx - 11 * k, H * 0.3);
      g.quadraticCurveTo(sx, H * 0.33, sx + 11 * k, H * 0.3);
      g.quadraticCurveTo(sx + 15 * k, H * 0.345, sx, H * 0.365);
      g.fill();
      sconces.push({ x: sx, y: H * 0.308 });
    });

    /* ---- mid: carpet floor ---------------------------------------- */
    const m = mid.g;
    const floorG = m.createLinearGradient(0, WBOT, 0, H + PAD);
    floorG.addColorStop(0, '#222d3b');
    floorG.addColorStop(1, '#0d131c');
    m.fillStyle = floorG;
    m.fillRect(-PAD, WBOT, W + PAD * 2, H - WBOT + PAD * 2);
    fillPat(m, tex('carpet'), -PAD, WBOT, W + PAD * 2, H - WBOT + PAD * 2, 0.9);
    const floorEdge = m.createLinearGradient(0, 0, W, 0);
    floorEdge.addColorStop(0, 'rgba(4,7,12,0.55)');
    floorEdge.addColorStop(0.3, 'rgba(4,7,12,0)');
    floorEdge.addColorStop(0.7, 'rgba(4,7,12,0)');
    floorEdge.addColorStop(1, 'rgba(4,7,12,0.55)');
    m.fillStyle = floorEdge;
    m.fillRect(-PAD, WBOT, W + PAD * 2, H - WBOT + PAD * 2);
    m.save();
    m.globalCompositeOperation = 'screen';
    [W * 0.17, W * 0.5, W * 0.83].forEach((cx) => {
      const pool = m.createRadialGradient(cx, H * 0.74, 10, cx, H * 0.76, W * 0.16);
      pool.addColorStop(0, 'rgba(255,206,140,0.13)');
      pool.addColorStop(1, 'rgba(255,206,140,0)');
      m.fillStyle = pool;
      m.beginPath();
      m.ellipse(cx, H * 0.75, W * 0.17, H * 0.08, 0, 0, Math.PI * 2);
      m.fill();
    });
    m.restore();

    /* ---- near: slot machine (left) + roulette (right) -------------- */
    const n = near.g;

    const ss = clamp(Math.min(W, H) / 760, 0.75, 1.3);
    const SLX = W * 0.115;
    const SLB = H * 0.755;
    n.save();
    n.translate(SLX, SLB);
    n.scale(ss, ss);
    ellipse(n, 0, 6, 88, 15, 'rgba(2,4,8,0.55)');
    rr(n, -44, -18, 88, 22, 5, '#2b1016');
    const bodyG = n.createLinearGradient(-72, 0, 72, 0);
    bodyG.addColorStop(0, '#3a1220');
    bodyG.addColorStop(0.3, '#642236');
    bodyG.addColorStop(0.62, '#511b2c');
    bodyG.addColorStop(1, '#2c0d18');
    n.fillStyle = bodyG;
    n.beginPath();
    n.roundRect(-72, -238, 144, 224, 14);
    n.fill();
    n.strokeStyle = '#c99b52';
    n.lineWidth = 3;
    n.stroke();
    /* marquee arch */
    n.fillStyle = '#6e2438';
    n.beginPath();
    n.moveTo(-72, -226);
    n.quadraticCurveTo(0, -300, 72, -226);
    n.lineTo(72, -244);
    n.quadraticCurveTo(0, -316, -72, -244);
    n.closePath();
    n.fill();
    n.strokeStyle = '#e2c289';
    n.lineWidth = 2.4;
    n.stroke();
    n.fillStyle = '#f3d7a4';
    n.font = '800 17px "Baloo 2", sans-serif';
    n.textAlign = 'center';
    n.fillText('LUCKY', 0, -252);
    /* face */
    rr(n, -58, -222, 116, 66, 8, '#200a12');
    n.strokeStyle = 'rgba(226,194,137,0.5)';
    n.lineWidth = 1.6;
    n.beginPath();
    n.roundRect(-58, -222, 116, 66, 8);
    n.stroke();
    n.fillStyle = '#e2c289';
    n.font = '800 24px "Baloo 2", sans-serif';
    n.fillText('7 7 7', 0, -180);
    glow(n, 0, -190, 40, '#e29349', 0.2);
    /* reel window */
    rr(n, -56, -142, 112, 58, 7, '#0d0409');
    n.strokeStyle = '#e2c289';
    n.lineWidth = 2;
    n.beginPath();
    n.roundRect(-56, -142, 112, 58, 7);
    n.stroke();
    const reels: { x: number; y: number; w: number; h: number }[] = [];
    ex.reels = reels;
    [-36, 0, 36].forEach((dx) => {
      const rg = n.createLinearGradient(0, -138, 0, -88);
      rg.addColorStop(0, '#cfc4ae');
      rg.addColorStop(0.5, '#fdf6ec');
      rg.addColorStop(1, '#c9bda6');
      n.fillStyle = rg;
      n.beginPath();
      n.roundRect(dx - 15, -138, 30, 50, 3);
      n.fill();
      reels.push({ x: SLX + dx * ss, y: SLB - 113 * ss, w: 30 * ss, h: 50 * ss });
    });
    n.strokeStyle = 'rgba(189,47,58,0.65)';
    n.lineWidth = 2;
    n.beginPath();
    n.moveTo(-56, -113);
    n.lineTo(56, -113);
    n.stroke();
    /* buttons + tray */
    rr(n, -46, -74, 92, 18, 6, '#1c0810');
    (
      [
        [-28, '#bd2f3a'],
        [0, '#e2c289'],
        [28, '#2f86a1'],
      ] as const
    ).forEach(([dx, col]) => {
      ellipse(n, dx, -65, 9, 6.4, col);
      ellipse(n, dx - 2, -67, 3, 2, 'rgba(255,255,255,0.4)');
    });
    rr(n, -34, -48, 68, 20, 8, '#180710');
    ellipse(n, 0, -38, 24, 7, '#050208');
    /* lever */
    n.strokeStyle = '#c99b52';
    n.lineWidth = 5;
    n.lineCap = 'round';
    n.beginPath();
    n.moveTo(70, -120);
    n.lineTo(88, -190);
    n.stroke();
    ellipse(n, 89, -196, 9, 9, '#bd2f3a');
    ellipse(n, 86, -199, 3, 3, 'rgba(255,255,255,0.5)');
    n.restore();
    ex.marquee = [];
    for (let i = 0; i < 9; i += 1) {
      const u = i / 8;
      ex.marquee.push({
        x: SLX + (-64 + u * 128) * ss,
        y: SLB + (-252 - Math.sin(u * Math.PI) * 42) * ss,
      });
    }

    /* roulette pedestal, right */
    const rs = clamp(Math.min(W, H) / 800, 0.72, 1.25);
    const RX = W * 0.885;
    const RB = H * 0.75;
    ex.wheel = { x: RX, y: RB - 128 * rs, s: rs };
    n.save();
    n.translate(RX, RB);
    n.scale(rs, rs);
    ellipse(n, 0, 6, 120, 20, 'rgba(2,4,8,0.55)');
    const ped = n.createLinearGradient(-26, 0, 26, 0);
    ped.addColorStop(0, '#2c1810');
    ped.addColorStop(0.5, '#5e3a20');
    ped.addColorStop(1, '#241208');
    n.fillStyle = ped;
    n.beginPath();
    n.moveTo(-30, 0);
    n.lineTo(-16, -96);
    n.lineTo(16, -96);
    n.lineTo(30, 0);
    n.closePath();
    n.fill();
    ellipse(n, 0, 0, 52, 12, '#3a2412');
    ellipse(n, 0, -3, 52, 12, '#55341f');
    const tabletop = n.createLinearGradient(0, -132, 0, -96);
    tabletop.addColorStop(0, '#8a5a2c');
    tabletop.addColorStop(1, '#4a2c14');
    n.fillStyle = tabletop;
    n.beginPath();
    n.ellipse(0, -104, 118, 30, 0, 0, Math.PI * 2);
    n.fill();
    clipDraw(
      n,
      () => n.ellipse(0, -108, 118, 30, 0, 0, Math.PI * 2),
      () => fillPat(n, tex('wood'), -118, -140, 236, 66, 0.55),
    );
    n.strokeStyle = '#c99b52';
    n.lineWidth = 3;
    n.beginPath();
    n.ellipse(0, -108, 118, 30, 0, 0, Math.PI * 2);
    n.stroke();
    ellipse(n, 0, -112, 100, 24, '#241208');
    n.restore();

    /* ---- fore: the felt table in your lap --------------------------- */
    const f = fore.g;
    const TXc = W * 0.5;
    const TB = H * 1.36;
    const RXr = Math.max(W * 0.78, 620);
    const RYr = TB - H * 0.66;
    ex.table = { x: TXc, yc: TB, rx: RXr, ry: RYr };

    f.save();
    f.fillStyle = 'rgba(3,5,9,0.5)';
    f.beginPath();
    f.ellipse(TXc, TB - 14, RXr * 1.02, RYr * 1.02, 0, Math.PI, Math.PI * 2);
    f.fill();
    f.restore();

    clipDraw(
      f,
      () => f.ellipse(TXc, TB, RXr, RYr, 0, Math.PI, Math.PI * 2),
      () => {
        const wg = f.createLinearGradient(0, TB - RYr, 0, TB - RYr * 0.62);
        wg.addColorStop(0, '#e8c684');
        wg.addColorStop(0.28, '#c99552');
        wg.addColorStop(0.66, '#7c4c22');
        wg.addColorStop(1, '#402410');
        f.fillStyle = wg;
        f.fillRect(TXc - RXr, TB - RYr - 4, RXr * 2, RYr);
        fillPat(f, tex('wood'), TXc - RXr, TB - RYr - 4, RXr * 2, RYr, 0.55);
      },
    );
    f.strokeStyle = 'rgba(20,10,4,0.7)';
    f.lineWidth = 2.4;
    f.beginPath();
    f.ellipse(TXc, TB, RXr, RYr, 0, Math.PI, Math.PI * 2);
    f.stroke();
    f.strokeStyle = 'rgba(255,240,205,0.5)';
    f.lineWidth = 2;
    f.beginPath();
    f.ellipse(TXc, TB, RXr - 4, RYr - 3, 0, Math.PI * 1.15, Math.PI * 1.85);
    f.stroke();
    /* gold inlay */
    f.strokeStyle = hex('#e2c289', 0.85);
    f.lineWidth = 3;
    f.beginPath();
    f.ellipse(TXc, TB, RXr * 0.955, RYr * 0.955, 0, Math.PI, Math.PI * 2);
    f.stroke();
    f.strokeStyle = 'rgba(255,240,205,0.3)';
    f.lineWidth = 1;
    f.beginPath();
    f.ellipse(TXc, TB, RXr * 0.948, RYr * 0.948, 0, Math.PI, Math.PI * 2);
    f.stroke();

    /* felt */
    clipDraw(
      f,
      () => f.ellipse(TXc, TB, RXr * 0.9, RYr * 0.9, 0, Math.PI, Math.PI * 2),
      () => {
        const felt = f.createRadialGradient(TXc, H * 0.9, 40, TXc, H * 0.96, RXr * 0.85);
        felt.addColorStop(0, '#2f8a5e');
        felt.addColorStop(0.45, '#1d5c46');
        felt.addColorStop(1, '#113a30');
        f.fillStyle = felt;
        f.fillRect(TXc - RXr, TB - RYr, RXr * 2, RYr);
        fillPat(f, tex('felt'), TXc - RXr, TB - RYr, RXr * 2, RYr, 0.75);
        const railShadow = f.createLinearGradient(0, TB - RYr * 0.9, 0, TB - RYr * 0.9 + 42);
        railShadow.addColorStop(0, 'rgba(4,12,10,0.55)');
        railShadow.addColorStop(1, 'rgba(4,12,10,0)');
        f.fillStyle = railShadow;
        f.fillRect(TXc - RXr, TB - RYr * 0.9, RXr * 2, 60);
        /* faint watermark */
        f.fillStyle = 'rgba(253,246,236,0.05)';
        f.font = `800 ${Math.round(H * 0.16)}px "Baloo 2", sans-serif`;
        f.textAlign = 'center';
        f.fillText('♠', TXc, H * 1.02);
      },
    );
    /* inner inlay line + betting boxes */
    f.strokeStyle = hex('#e2c289', 0.5);
    f.lineWidth = 2.4;
    f.beginPath();
    f.ellipse(TXc, TB, RXr * 0.7, RYr * 0.7, 0, Math.PI * 1.08, Math.PI * 1.92);
    f.stroke();
    (
      [
        [-0.13, 0.012, -0.1],
        [0, 0, 0],
        [0.13, 0.012, 0.1],
      ] as const
    ).forEach(([ux, uy, rot]) => {
      f.save();
      f.translate(TXc + W * ux, H * (0.815 + uy));
      f.rotate(rot);
      f.strokeStyle = hex('#e2c289', 0.4);
      f.lineWidth = 2;
      f.beginPath();
      f.ellipse(0, 0, 42, 15, 0, 0, Math.PI * 2);
      f.stroke();
      f.restore();
    });

    /* chips + cards on the near felt */
    chipStack(f, W * 0.335, H * 0.93, '#bd2f3a', 5, 1.15);
    chipStack(f, W * 0.375, H * 0.955, '#e2c289', 3, 1.15);
    chipStack(f, W * 0.305, H * 0.965, '#25586e', 4, 1.15);
    chipStack(f, W * 0.665, H * 0.935, '#2f86a1', 6, 1.15);
    chipStack(f, W * 0.635, H * 0.968, '#bd2f3a', 3, 1.15);
    chipStack(f, W * 0.7, H * 0.962, '#2c6e4f', 4, 1.15);
    card(f, W * 0.468, H * 0.945, -0.2, 'A', '♠', false, 1.5);
    card(f, W * 0.527, H * 0.938, 0.12, 'K', '♥', true, 1.5);
    cardBack(f, W * 0.6, H * 0.975, 0.32, 1.4);

    plates.casino = [far, mid, near, fore];

    /* chandeliers live as sprites */
    ex.chands = [
      { x: W * 0.17, y: H * 0.055, s: 0.78 * k },
      { x: W * 0.5, y: H * 0.045, s: 1.02 * k },
      { x: W * 0.83, y: H * 0.055, s: 0.8 * k },
    ];
  }

  function liveCasino(t: number) {
    blitPlates(plates.casino ?? []);
    const ex = readyExtras(EX.casino, [
      'sign',
      'sconces',
      'reels',
      'marquee',
      'wheel',
      'table',
      'chands',
    ] as const);
    if (!ex) return;

    /* neon sign + wall glow */
    withDepth(DEPTHS[0], () => {
      const s = ex.sign;
      const fsz = Math.round(clamp(s.w * 0.19, 34, 76));
      ctx.font = `800 ${fsz}px "Baloo 2", sans-serif`;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      const word = 'parlour';
      const widths = word.split('').map((ch) => ctx.measureText(ch).width);
      const total = widths.reduce((a, b) => a + b, 0);
      let cx = s.x - total / 2;
      const seg = Math.floor(t * 2.6);
      const dip = hashi(seg, 91) > 0.8 && t * 2.6 - seg < 0.4;
      ctx.save();
      ctx.shadowColor = 'rgba(255,150,70,0.9)';
      ctx.shadowBlur = 24;
      for (let i = 0; i < word.length; i += 1) {
        const letter = word[i] ?? '';
        const isDip = dip && i === 4;
        ctx.globalAlpha = isDip ? 0.3 : 1;
        ctx.fillStyle = '#ffdcae';
        ctx.fillText(letter, cx, s.y - s.w * 0.012);
        if (!isDip) {
          ctx.shadowBlur = 0;
          ctx.fillStyle = '#fff3d6';
          ctx.fillText(letter, cx, s.y - s.w * 0.012);
          ctx.shadowBlur = 24;
        }
        cx += widths[i] ?? 0;
      }
      ctx.restore();
      ctx.globalAlpha = 1;
      ctx.textAlign = 'center';
      ctx.font = `700 ${Math.round(fsz * 0.34)}px "Baloo 2", sans-serif`;
      (
        [
          ['♠', '#9fdcef', -3],
          ['♥', '#ff9d7a', -1],
          ['♦', '#ff9d7a', 1],
          ['♣', '#9fdcef', 3],
        ] as const
      ).forEach(([ch, col, u]) => {
        ctx.fillStyle = col;
        ctx.globalAlpha = 0.55 + 0.45 * (0.5 + 0.5 * Math.sin(t * 1.8 + u * 2));
        ctx.fillText(ch, s.x + u * fsz * 0.42, s.y + s.w * 0.078);
      });
      ctx.globalAlpha = 1;
      ctx.textBaseline = 'alphabetic';
      ex.sconces.forEach((sc, i) => {
        glow(ctx, sc.x, sc.y, 15, '#f2b06a', 0.4 + 0.18 * Math.sin(t * 4.2 + i * 2));
        ellipse(ctx, sc.x, sc.y, 2.6, 4.4 + Math.sin(t * 6 + i), '#ffe1b8');
      });
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      const roomWash = ctx.createLinearGradient(0, 0, 0, H * 0.8);
      roomWash.addColorStop(0, `rgba(255,198,120,${0.07 + 0.02 * Math.sin(t * 1.2)})`);
      roomWash.addColorStop(0.5, `rgba(255,188,110,${0.08 + 0.03 * Math.sin(t * 1.5)})`);
      roomWash.addColorStop(1, 'rgba(255,188,110,0)');
      ctx.fillStyle = roomWash;
      ctx.fillRect(-PAD, 0, W + PAD * 2, H * 0.82);
      ctx.restore();
    });

    /* chandeliers: swinging sprites + cones + motes */
    withDepth(DEPTHS[1], () => {
      const hang = S.chandHang ?? [0, 0];
      const bulbs = S.chandBulbs ?? [];
      ex.chands.forEach((ch, i) => {
        const rot = Math.sin(t * 0.5 + i * 1.9) * 0.02;
        const sc = ch.s * 0.5;
        ctx.save();
        ctx.translate(ch.x, ch.y);
        ctx.rotate(rot);
        ctx.drawImage(spr('chand'), -hang[0] * 2 * sc, -hang[1] * 2 * sc, 640 * sc, 600 * sc);
        ctx.restore();
        const cosA = Math.cos(rot);
        const sinA = Math.sin(rot);
        bulbs.forEach(([bx, by], kk) => {
          const dx = bx * ch.s * 0.5 * 2 * 0.5;
          const dy = (by - 8) * ch.s * 0.5 * 2 * 0.5;
          const gx = ch.x + dx * cosA - dy * sinA;
          const gy = ch.y + dx * sinA + dy * cosA;
          glow(ctx, gx, gy, 13 * ch.s, '#ffd9a0', 0.4 + 0.2 * Math.sin(t * 5.2 + kk * 1.4 + i));
        });
        ctx.save();
        ctx.globalCompositeOperation = 'screen';
        const coneTop = ch.y + 170 * ch.s;
        const coneA = 0.1 + 0.02 * Math.sin(t * 1.1 + i);
        const cone = ctx.createLinearGradient(0, coneTop, 0, H * 0.88);
        cone.addColorStop(0, `rgba(255,214,160,${coneA})`);
        cone.addColorStop(1, 'rgba(255,214,160,0)');
        ctx.fillStyle = cone;
        ctx.beginPath();
        ctx.moveTo(ch.x - 74 * ch.s, coneTop);
        ctx.lineTo(ch.x + 74 * ch.s, coneTop);
        ctx.lineTo(ch.x + 300 * ch.s, H * 0.88);
        ctx.lineTo(ch.x - 300 * ch.s, H * 0.88);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      });
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      motes.forEach((mo) => {
        const u = (((t / mo.s + mo.p) % 1) + 1) % 1;
        const x = mo.x * W + Math.sin(t * 0.5 + mo.p * 9) * 14;
        glow(ctx, x, H * 0.8 - u * H * 0.55, mo.r * 2, '#e2c289', 0.3 * Math.sin(u * Math.PI));
      });
      ctx.restore();
    });

    /* slot marquee, reels, roulette */
    withDepth(DEPTHS[2], () => {
      ex.marquee.forEach((b, i) => {
        const phase = (t * 5 + i) % 9;
        const on = phase < 1.6 ? 1 : 0.22;
        glow(ctx, b.x, b.y, 7, '#ffe9c4', 0.5 * on);
        ellipse(ctx, b.x, b.y, 2.4, 2.4, `rgba(255,236,196,${0.4 + 0.6 * on})`);
      });
      const symbols = ['7', '♠', '♥', '★', '♦'] as const;
      const symColor = {
        7: '#bd5f20',
        '♠': '#20475c',
        '♥': '#bd3f24',
        '★': '#b9884a',
        '♦': '#bd3f24',
      };
      ex.reels.forEach((r0, i) => {
        ctx.save();
        ctx.beginPath();
        ctx.rect(r0.x - r0.w / 2, r0.y - r0.h / 2, r0.w, r0.h);
        ctx.clip();
        const speed = 0.5 + i * 0.13;
        const pos = t * speed;
        const idx = Math.floor(pos);
        const frac = pos - idx;
        ctx.font = `800 ${Math.round(r0.h * 0.44)}px "Baloo 2", sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        for (let kk = -1; kk <= 1; kk += 1) {
          const sym = symbols[(((idx + kk) % 5) + 5) % 5] ?? symbols[0]!;
          ctx.fillStyle = symColor[sym] ?? '#ffffff';
          ctx.fillText(sym, r0.x, r0.y + (kk + frac) * r0.h * 0.7);
        }
        ctx.textBaseline = 'alphabetic';
        ctx.restore();
      });
      const wh = ex.wheel;
      ctx.save();
      ctx.translate(wh.x, wh.y);
      ctx.scale(wh.s, wh.s * 0.42);
      ctx.rotate(t * 0.8);
      ctx.drawImage(spr('wheel'), -118, -118, 236, 236);
      ctx.restore();
      ctx.save();
      ctx.translate(wh.x, wh.y);
      ctx.scale(wh.s, wh.s * 0.42);
      const ba = -t * 1.5;
      ellipse(ctx, Math.cos(ba) * 88, Math.sin(ba) * 88, 5, 5, '#fdf6ec');
      ctx.restore();
      glow(ctx, wh.x, wh.y - 20 * wh.s, 60 * wh.s, '#ffd9a0', 0.08 + 0.03 * Math.sin(t * 2));
    });

    /* felt sheen */
    withDepth(DEPTHS[3], () => {
      const tb = ex.table;
      const u = (t * 0.06) % 1;
      const sx = tb.x - tb.rx * 0.9 + u * tb.rx * 1.8;
      ctx.save();
      ctx.beginPath();
      ctx.ellipse(tb.x, tb.yc, tb.rx * 0.9, tb.ry * 0.9, 0, Math.PI, Math.PI * 2);
      ctx.clip();
      ctx.globalCompositeOperation = 'screen';
      const sheen = ctx.createLinearGradient(sx - 70, 0, sx + 70, 0);
      sheen.addColorStop(0, 'rgba(255,230,186,0)');
      sheen.addColorStop(0.5, 'rgba(255,230,186,0.10)');
      sheen.addColorStop(1, 'rgba(255,230,186,0)');
      ctx.fillStyle = sheen;
      ctx.fillRect(tb.x - tb.rx, tb.yc - tb.ry, tb.rx * 2, tb.ry);
      ctx.restore();
    });
  }

  /* ================================================================== */
  /* SNUG                                                                */
  /* ================================================================== */

  function bakeSnug() {
    const far = plate();
    const mid = plate();
    const near = plate();
    const fore = plate();
    const ex: SceneExtras = {};
    EX.snug = ex;

    const RAILY = H * 0.575;
    const FLOORY = H * 0.7;

    /* ---- far: wall, wallpaper, window, wainscot --------------------- */
    const g = far.g;
    const wall = g.createLinearGradient(0, -PAD, 0, FLOORY);
    wall.addColorStop(0, '#132329');
    wall.addColorStop(0.5, '#1f3941');
    wall.addColorStop(1, '#27454c');
    g.fillStyle = wall;
    g.fillRect(-PAD, -PAD, W + PAD * 2, FLOORY + PAD);
    fillPat(g, tex('tealpaper'), -PAD, -PAD, W + PAD * 2, RAILY + PAD, 0.85);
    g.fillStyle = 'rgba(6,12,14,0.3)';
    g.fillRect(-PAD, -PAD, W + PAD * 2, PAD + H * 0.06);
    g.save();
    g.globalCompositeOperation = 'screen';
    const hearthStain = g.createRadialGradient(
      W * 0.175,
      H * 0.6,
      30,
      W * 0.175,
      H * 0.62,
      W * 0.4,
    );
    hearthStain.addColorStop(0, 'rgba(226,147,73,0.12)');
    hearthStain.addColorStop(1, 'rgba(226,147,73,0)');
    g.fillStyle = hearthStain;
    g.fillRect(-PAD, H * 0.2, W * 0.72, H * 0.55);
    g.restore();
    g.strokeStyle = 'rgba(226,194,137,0.16)';
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(-PAD, H * 0.095);
    g.lineTo(W + PAD, H * 0.095);
    g.stroke();

    /* window upper right */
    const WX0 = W * 0.705;
    const WX1 = W * 0.925;
    const WY0 = H * 0.1;
    const WY1 = H * 0.435;
    const ww = WX1 - WX0;
    const wh2 = WY1 - WY0;
    ex.window = { x: WX0, y: WY0, w: ww, h: wh2 };
    /* curtains behind casing edges */
    const drape = (dx0: number, flip: boolean) => {
      g.save();
      g.translate(dx0, WY0 - 18);
      if (flip) g.scale(-1, 1);
      const dg = g.createLinearGradient(0, 0, 46, 0);
      dg.addColorStop(0, '#152b33');
      dg.addColorStop(0.5, '#1f424d');
      dg.addColorStop(1, '#12262d');
      g.fillStyle = dg;
      g.beginPath();
      g.moveTo(-8, 0);
      g.quadraticCurveTo(34, wh2 * 0.32, 14, wh2 * 0.72);
      g.quadraticCurveTo(4, wh2 * 0.92, 24, wh2 + 34);
      g.lineTo(-24, wh2 + 34);
      g.lineTo(-24, 0);
      g.closePath();
      g.fill();
      g.strokeStyle = 'rgba(141,196,205,0.16)';
      g.lineWidth = 1.4;
      for (let i2 = 0; i2 < 3; i2 += 1) {
        g.beginPath();
        g.moveTo(-16 + i2 * 9, 4);
        g.quadraticCurveTo(6 + i2 * 8, wh2 * 0.4, -4 + i2 * 8, wh2 + 28);
        g.stroke();
      }
      g.restore();
    };
    drape(WX0 - 12, false);
    drape(WX1 + 12, true);
    g.strokeStyle = '#55341f';
    g.lineWidth = 5;
    g.beginPath();
    g.moveTo(WX0 - 42, WY0 - 20);
    g.lineTo(WX1 + 42, WY0 - 20);
    g.stroke();
    ellipse(g, WX0 - 44, WY0 - 20, 5, 5, '#8a5a35');
    ellipse(g, WX1 + 44, WY0 - 20, 5, 5, '#8a5a35');

    /* casing */
    g.save();
    g.shadowColor = 'rgba(0,0,0,0.4)';
    g.shadowBlur = 16;
    rr(g, WX0 - 16, WY0 - 14, ww + 32, wh2 + 28, 10, '#3b2417');
    g.restore();
    fillPat(g, tex('wood'), WX0 - 16, WY0 - 14, ww + 32, wh2 + 28, 0.5);
    g.strokeStyle = 'rgba(214,160,96,0.28)';
    g.lineWidth = 1.4;
    g.strokeRect(WX0 - 12, WY0 - 10, ww + 24, wh2 + 20);
    /* glass */
    clipDraw(
      g,
      () => g.roundRect(WX0, WY0, ww, wh2, 6),
      () => {
        const night = g.createLinearGradient(0, WY0, 0, WY1);
        night.addColorStop(0, '#040b14');
        night.addColorStop(0.5, '#0c1d30');
        night.addColorStop(1, '#16344a');
        g.fillStyle = night;
        g.fillRect(WX0, WY0, ww, wh2);
        const wmx = WX0 + ww * 0.24;
        const wmy = WY0 + wh2 * 0.2;
        glow(g, wmx, wmy, 30, '#fffdf0', 0.35);
        ellipse(g, wmx, wmy, 9, 9, '#fef8e6');
        g.fillStyle = 'rgba(180,200,225,0.07)';
        g.beginPath();
        g.ellipse(WX0 + ww * 0.6, WY0 + wh2 * 0.16, ww * 0.3, 9, 0.06, 0, Math.PI * 2);
        g.fill();
        /* rooftops */
        g.fillStyle = '#071019';
        g.beginPath();
        g.moveTo(WX0, WY1);
        g.lineTo(WX0, WY0 + wh2 * 0.62);
        g.lineTo(WX0 + ww * 0.13, WY0 + wh2 * 0.5);
        g.lineTo(WX0 + ww * 0.22, WY0 + wh2 * 0.62);
        g.lineTo(WX0 + ww * 0.3, WY0 + wh2 * 0.56);
        g.lineTo(WX0 + ww * 0.34, WY0 + wh2 * 0.44);
        g.lineTo(WX0 + ww * 0.4, WY0 + wh2 * 0.44);
        g.lineTo(WX0 + ww * 0.44, WY0 + wh2 * 0.58);
        g.lineTo(WX0 + ww * 0.58, WY0 + wh2 * 0.66);
        g.lineTo(WX0 + ww * 0.66, WY0 + wh2 * 0.5);
        g.lineTo(WX0 + ww * 0.78, WY0 + wh2 * 0.6);
        g.lineTo(WX0 + ww * 0.86, WY0 + wh2 * 0.52);
        g.lineTo(WX0 + ww, WY0 + wh2 * 0.62);
        g.lineTo(WX0 + ww, WY1);
        g.closePath();
        g.fill();
        /* chimneys */
        g.fillRect(WX0 + ww * 0.17, WY0 + wh2 * 0.47, ww * 0.03, wh2 * 0.09);
        g.fillRect(WX0 + ww * 0.71, WY0 + wh2 * 0.44, ww * 0.03, wh2 * 0.1);
        /* lit windows */
        (
          [
            [0.14, 0.72],
            [0.3, 0.7],
            [0.42, 0.68],
            [0.63, 0.74],
            [0.8, 0.68],
          ] as const
        ).forEach(([u, v], i2) => {
          const lx = WX0 + ww * u;
          const ly = WY0 + wh2 * v;
          glow(g, lx, ly, 8, '#f2b06a', 0.5);
          g.fillStyle = i2 % 2 ? '#eeb268' : '#d99a4e';
          g.fillRect(lx - 2.2, ly - 3, 4.4, 6);
        });
        const wetHaze = g.createLinearGradient(0, WY0, 0, WY1);
        wetHaze.addColorStop(0, 'rgba(140,180,205,0.06)');
        wetHaze.addColorStop(1, 'rgba(140,180,205,0.02)');
        g.fillStyle = wetHaze;
        g.fillRect(WX0, WY0, ww, wh2);
        /* static droplets */
        const rd = mulberry(0xd20);
        g.fillStyle = 'rgba(200,230,240,0.2)';
        for (let i2 = 0; i2 < 34; i2 += 1) {
          g.beginPath();
          g.arc(WX0 + rd() * ww, WY0 + rd() * wh2, 0.8 + rd() * 1.5, 0, Math.PI * 2);
          g.fill();
        }
      },
    );
    /* muntins + sill */
    g.fillStyle = '#3b2417';
    g.fillRect(WX0 + ww * 0.485, WY0, ww * 0.03, wh2);
    g.fillRect(WX0, WY0 + wh2 * 0.47, ww, wh2 * 0.04);
    g.fillStyle = 'rgba(214,160,96,0.25)';
    g.fillRect(WX0 + ww * 0.485, WY0, ww * 0.008, wh2);
    rr(g, WX0 - 22, WY1 + 8, ww + 44, 13, 4, '#7a5230');
    g.fillStyle = 'rgba(0,0,0,0.3)';
    g.fillRect(WX0 - 22, WY1 + 18, ww + 44, 4);
    /* potted plant on sill */
    g.save();
    g.translate(WX0 + ww * 0.13, WY1 + 8);
    rr(g, -9, -14, 18, 14, 3, '#96471c');
    g.strokeStyle = '#2c6e4f';
    g.lineWidth = 2.2;
    g.lineCap = 'round';
    (
      [
        [-6, -30, -10],
        [0, -34, 2],
        [6, -28, 10],
      ] as const
    ).forEach(([x1, y1, x2]) => {
      g.beginPath();
      g.moveTo(0, -14);
      g.quadraticCurveTo(x1, y1 * 0.7, x2, y1);
      g.stroke();
      ellipse(g, x2, y1, 3.4, 5, '#2c6e4f');
    });
    g.restore();

    /* wainscot */
    const gold = g.createLinearGradient(0, RAILY, 0, RAILY + 9);
    gold.addColorStop(0, '#c49264');
    gold.addColorStop(1, '#3b2417');
    g.fillStyle = gold;
    g.fillRect(-PAD, RAILY, W + PAD * 2, 9);
    g.fillStyle = 'rgba(255,231,184,0.3)';
    g.fillRect(-PAD, RAILY + 1, W + PAD * 2, 1.4);
    clipDraw(
      g,
      () => g.rect(-PAD, RAILY + 9, W + PAD * 2, FLOORY - RAILY - 9),
      () => {
        const wg = g.createLinearGradient(0, RAILY, 0, FLOORY);
        wg.addColorStop(0, '#4a2e18');
        wg.addColorStop(1, '#241408');
        g.fillStyle = wg;
        g.fillRect(-PAD, RAILY + 9, W + PAD * 2, FLOORY - RAILY);
        fillPat(g, tex('wood'), -PAD, RAILY + 9, W + PAD * 2, FLOORY - RAILY, 0.65);
        for (let x = 8; x < W + PAD; x += 96) {
          g.strokeStyle = 'rgba(16,8,3,0.55)';
          g.lineWidth = 2;
          g.strokeRect(x, RAILY + 16, 80, FLOORY - RAILY - 26);
          g.strokeStyle = 'rgba(214,160,96,0.2)';
          g.lineWidth = 1;
          g.strokeRect(x + 4, RAILY + 20, 72, FLOORY - RAILY - 34);
        }
      },
    );
    g.fillStyle = 'rgba(0,0,0,0.45)';
    g.fillRect(-PAD, FLOORY - 5, W + PAD * 2, 5);

    /* ---- mid: floor + rug ------------------------------------------- */
    const m = mid.g;
    const floorG = m.createLinearGradient(0, FLOORY, 0, H + PAD);
    floorG.addColorStop(0, '#4c3018');
    floorG.addColorStop(0.5, '#33200e');
    floorG.addColorStop(1, '#180d05');
    m.fillStyle = floorG;
    m.fillRect(-PAD, FLOORY, W + PAD * 2, H - FLOORY + PAD * 2);
    fillPat(m, tex('wood'), -PAD, FLOORY, W + PAD * 2, H - FLOORY + PAD * 2, 0.5);
    m.strokeStyle = 'rgba(20,10,4,0.55)';
    for (let i = 0; i < 9; i += 1) {
      const u = i / 8;
      const y = FLOORY + Math.pow(u, 1.4) * (H - FLOORY + PAD);
      m.lineWidth = 1.4 + u * 2;
      m.beginPath();
      m.moveTo(-PAD, y);
      m.lineTo(W + PAD, y);
      m.stroke();
      const rj = mulberry(0x40 + i);
      for (let kx = 0; kx < 6; kx += 1) {
        const jx = rj() * W;
        m.beginPath();
        m.moveTo(jx, y);
        m.lineTo(jx, y + (Math.pow((i + 1) / 8, 1.4) - Math.pow(u, 1.4)) * (H - FLOORY + PAD));
        m.stroke();
      }
    }
    /* cool window light on floor + warm hearth sheen */
    m.save();
    m.globalCompositeOperation = 'screen';
    m.fillStyle = 'rgba(140,180,210,0.05)';
    m.beginPath();
    m.moveTo(W * 0.72, FLOORY);
    m.lineTo(W * 0.92, FLOORY);
    m.lineTo(W * 0.99, H * 0.9);
    m.lineTo(W * 0.7, H * 0.9);
    m.closePath();
    m.fill();
    const hearthSheen = m.createRadialGradient(
      W * 0.175,
      H * 0.74,
      8,
      W * 0.175,
      H * 0.76,
      W * 0.14,
    );
    hearthSheen.addColorStop(0, 'rgba(255,178,74,0.14)');
    hearthSheen.addColorStop(1, 'rgba(255,178,74,0)');
    m.fillStyle = hearthSheen;
    m.beginPath();
    m.ellipse(W * 0.175, H * 0.77, W * 0.15, H * 0.05, 0, 0, Math.PI * 2);
    m.fill();
    m.restore();

    /* rug */
    const RGX = W * 0.44;
    const RGY = H * 0.97;
    const RRX = Math.min(W * 0.42, 560);
    const RRY = H * 0.21;
    m.save();
    m.beginPath();
    m.ellipse(RGX, RGY, RRX, RRY, 0, 0, Math.PI * 2);
    m.clip();
    const rugG = m.createRadialGradient(RGX, RGY, 20, RGX, RGY, RRX);
    rugG.addColorStop(0, '#8a4020');
    rugG.addColorStop(0.55, '#6b2e18');
    rugG.addColorStop(1, '#4a2012');
    m.fillStyle = rugG;
    m.fillRect(RGX - RRX, RGY - RRY, RRX * 2, RRY * 2);
    m.strokeStyle = 'rgba(226,194,137,0.5)';
    m.lineWidth = 7;
    m.beginPath();
    m.ellipse(RGX, RGY, RRX - 10, RRY - 5, 0, 0, Math.PI * 2);
    m.stroke();
    m.strokeStyle = 'rgba(226,194,137,0.2)';
    m.lineWidth = 2;
    m.beginPath();
    m.ellipse(RGX, RGY, RRX * 0.72, RRY * 0.72, 0, 0, Math.PI * 2);
    m.stroke();
    m.beginPath();
    m.ellipse(RGX, RGY, RRX * 0.46, RRY * 0.46, 0, 0, Math.PI * 2);
    m.stroke();
    for (let i = 0; i < 10; i += 1) {
      const a = (i / 10) * Math.PI * 2;
      const dx = Math.cos(a) * RRX * 0.6;
      const dy = Math.sin(a) * RRY * 0.6;
      m.save();
      m.translate(RGX + dx, RGY + dy);
      m.rotate(a);
      m.strokeStyle = 'rgba(37,88,110,0.4)';
      m.lineWidth = 2;
      m.beginPath();
      m.moveTo(0, -9);
      m.lineTo(7, 0);
      m.lineTo(0, 9);
      m.lineTo(-7, 0);
      m.closePath();
      m.stroke();
      m.restore();
    }
    fillPat(m, tex('grain'), RGX - RRX, RGY - RRY, RRX * 2, RRY * 2, 0.4);
    m.restore();

    /* ---- near: hearth (LEFT WALL FIXTURE), shelf, clock, console ---- */
    const n = near.g;

    /* chimney breast */
    const BX0 = W * 0.03;
    const BX1 = W * 0.315;
    const OX = (BX0 + BX1) / 2;
    const OHW = Math.min(W * 0.082, (BX1 - BX0) * 0.34);
    const OBY = H * 0.712;
    const OTY = H * 0.545;
    const MY = H * 0.452;
    ex.hearth = { ox: OX, ohw: OHW, oby: OBY, oty: OTY };

    n.save();
    n.shadowColor = 'rgba(0,0,0,0.5)';
    n.shadowBlur = 26;
    n.shadowOffsetX = 10;
    n.fillStyle = '#3a251a';
    n.fillRect(BX0, -PAD, BX1 - BX0, H * 0.745 + PAD);
    n.restore();
    clipDraw(
      n,
      () => n.rect(BX0, -PAD, BX1 - BX0, H * 0.745 + PAD),
      () => {
        fillPat(n, tex('brick'), BX0, -PAD, BX1 - BX0, H * 0.745 + PAD, 1);
        const bShade = n.createLinearGradient(BX0, 0, BX1, 0);
        bShade.addColorStop(0, 'rgba(10,5,2,0.5)');
        bShade.addColorStop(0.35, 'rgba(10,5,2,0.05)');
        bShade.addColorStop(0.75, 'rgba(10,5,2,0.12)');
        bShade.addColorStop(1, 'rgba(10,5,2,0.55)');
        n.fillStyle = bShade;
        n.fillRect(BX0, -PAD, BX1 - BX0, H * 0.745 + PAD);
        n.fillStyle = 'rgba(6,3,1,0.35)';
        n.fillRect(BX0, -PAD, BX1 - BX0, PAD + H * 0.09);
        n.save();
        n.globalCompositeOperation = 'screen';
        const bWarm = n.createRadialGradient(OX, OBY - 40, 10, OX, OBY - 30, (BX1 - BX0) * 0.75);
        bWarm.addColorStop(0, 'rgba(255,160,74,0.22)');
        bWarm.addColorStop(1, 'rgba(255,160,74,0)');
        n.fillStyle = bWarm;
        n.fillRect(BX0, H * 0.3, BX1 - BX0, H * 0.46);
        n.restore();
      },
    );

    /* mantel shelf with corbels */
    n.save();
    n.shadowColor = 'rgba(0,0,0,0.45)';
    n.shadowBlur = 10;
    n.shadowOffsetY = 6;
    rr(n, BX0 - 10, MY, BX1 - BX0 + 20, 20, 4, '#6a4228');
    n.restore();
    fillPat(n, tex('wood'), BX0 - 10, MY, BX1 - BX0 + 20, 20, 0.65);
    n.fillStyle = 'rgba(255,214,160,0.2)';
    n.fillRect(BX0 - 10, MY, BX1 - BX0 + 20, 3);
    [BX0 + 14, BX1 - 26].forEach((cx0) => {
      n.fillStyle = '#55341f';
      n.beginPath();
      n.moveTo(cx0, MY + 20);
      n.lineTo(cx0 + 14, MY + 20);
      n.lineTo(cx0 + 10, MY + 40);
      n.quadraticCurveTo(cx0 + 7, MY + 46, cx0 + 4, MY + 40);
      n.closePath();
      n.fill();
    });

    /* firebox opening: arch in the wall ABOVE the hearth slab */
    const archPath = (c: CanvasRenderingContext2D) => {
      c.moveTo(OX - OHW, OBY);
      c.lineTo(OX - OHW, OTY + (OBY - OTY) * 0.42);
      c.quadraticCurveTo(OX - OHW, OTY, OX, OTY);
      c.quadraticCurveTo(OX + OHW, OTY, OX + OHW, OTY + (OBY - OTY) * 0.42);
      c.lineTo(OX + OHW, OBY);
      c.closePath();
    };
    ex.archPath = archPath;

    /* stone surround ring */
    n.save();
    n.lineWidth = 17;
    n.strokeStyle = '#5c4a3c';
    n.beginPath();
    archPath(n);
    n.stroke();
    n.lineWidth = 13;
    n.strokeStyle = '#786250';
    n.beginPath();
    archPath(n);
    n.stroke();
    n.restore();
    /* keystone */
    n.save();
    n.translate(OX, OTY - 8);
    n.fillStyle = '#8a7460';
    n.beginPath();
    n.moveTo(-11, 18);
    n.lineTo(11, 18);
    n.lineTo(15, -6);
    n.lineTo(-15, -6);
    n.closePath();
    n.fill();
    n.strokeStyle = 'rgba(20,12,6,0.5)';
    n.lineWidth = 1.6;
    n.stroke();
    n.restore();

    /* firebox interior */
    clipDraw(
      n,
      () => archPath(n),
      () => {
        n.fillStyle = '#070302';
        n.fillRect(OX - OHW, OTY - 6, OHW * 2, OBY - OTY + 8);
        fillPat(n, tex('brick'), OX - OHW, OTY, OHW * 2, OBY - OTY, 0.3);
        const soot = n.createLinearGradient(0, OTY, 0, OBY);
        soot.addColorStop(0, 'rgba(0,0,0,0.85)');
        soot.addColorStop(0.55, 'rgba(0,0,0,0.5)');
        soot.addColorStop(1, 'rgba(20,8,2,0.25)');
        n.fillStyle = soot;
        n.fillRect(OX - OHW, OTY - 6, OHW * 2, OBY - OTY + 8);
        const inGlow = n.createRadialGradient(OX, OBY - 8, 4, OX, OBY - 8, OHW * 1.15);
        inGlow.addColorStop(0, 'rgba(255,138,48,0.55)');
        inGlow.addColorStop(0.6, 'rgba(200,80,24,0.22)');
        inGlow.addColorStop(1, 'rgba(120,40,10,0)');
        n.fillStyle = inGlow;
        n.fillRect(OX - OHW, OTY, OHW * 2, OBY - OTY);
        /* logs in the box */
        n.save();
        n.translate(OX, OBY - 9);
        n.rotate(-0.14);
        rr(n, -OHW * 0.62, -6, OHW * 1.24, 12, 6, '#2c160a');
        fillPat(n, tex('bark'), -OHW * 0.62, -7, OHW * 1.24, 15, 0.6);
        n.rotate(0.3);
        rr(n, -OHW * 0.54, -3, OHW * 1.08, 11, 5, '#38200e');
        fillPat(n, tex('bark'), -OHW * 0.54, -4, OHW * 1.08, 14, 0.55);
        n.restore();
        n.strokeStyle = 'rgba(255,150,60,0.8)';
        n.lineWidth = 1.6;
        (
          [
            [-0.4, -14],
            [-0.1, -10],
            [0.24, -13],
          ] as const
        ).forEach(([u, dy]) => {
          n.beginPath();
          n.moveTo(OX + u * OHW, OBY + dy);
          n.lineTo(OX + u * OHW + 6, OBY + dy + 5);
          n.stroke();
        });
        /* andirons */
        n.fillStyle = '#8a6a2c';
        [-OHW * 0.66, OHW * 0.66].forEach((dx) => {
          n.fillRect(OX + dx - 2, OBY - 22, 4, 22);
          ellipse(n, OX + dx, OBY - 24, 4, 4, '#c99b52');
        });
      },
    );

    /* hearth slab on the floor in front of the opening */
    n.save();
    n.beginPath();
    n.moveTo(OX - OHW - 26, OBY + 2);
    n.lineTo(OX + OHW + 26, OBY + 2);
    n.lineTo(OX + OHW + 46, H * 0.782);
    n.lineTo(OX - OHW - 46, H * 0.782);
    n.closePath();
    n.clip();
    const slab = n.createLinearGradient(0, OBY, 0, H * 0.782);
    slab.addColorStop(0, '#6e5c4c');
    slab.addColorStop(1, '#3c3028');
    n.fillStyle = slab;
    n.fillRect(OX - OHW - 46, OBY, (OHW + 46) * 2, H * 0.075);
    fillPat(n, tex('stone'), OX - OHW - 46, OBY, (OHW + 46) * 2, H * 0.075, 0.5);
    n.fillStyle = 'rgba(255,160,74,0.14)';
    n.fillRect(OX - OHW - 46, OBY, (OHW + 46) * 2, H * 0.075);
    n.restore();
    n.strokeStyle = 'rgba(255,214,160,0.22)';
    n.lineWidth = 1.6;
    n.beginPath();
    n.moveTo(OX - OHW - 46, H * 0.782);
    n.lineTo(OX + OHW + 46, H * 0.782);
    n.stroke();

    /* mantel items: candles (live flames), painting above */
    ex.candles = [
      { x: OX - OHW * 1.15, y: MY - 2, h: 17 },
      { x: OX + OHW * 1.2, y: MY - 2, h: 13 },
    ];
    ex.candles.forEach((cd) => {
      ellipse(n, cd.x, cd.y, 8.4, 2.6, 'rgba(0,0,0,0.4)');
      n.fillStyle = '#a67833';
      n.beginPath();
      n.moveTo(cd.x - 7, cd.y);
      n.lineTo(cd.x + 7, cd.y);
      n.lineTo(cd.x + 4, cd.y - 5);
      n.lineTo(cd.x - 4, cd.y - 5);
      n.closePath();
      n.fill();
      rr(n, cd.x - 3, cd.y - cd.h - 5, 6, cd.h + 2, 2, '#f6ecd8');
      n.fillStyle = 'rgba(0,0,0,0.14)';
      n.fillRect(cd.x + 0.6, cd.y - cd.h - 5, 2, cd.h + 2);
    });
    /* tiny framed heart card on the mantel */
    n.save();
    n.translate(OX + 2, MY - 15);
    n.rotate(-0.05);
    rr(n, -12, -15, 24, 30, 3, '#6d4a2c');
    rr(n, -9, -12, 18, 24, 2, '#fdf6ec');
    n.fillStyle = '#bd3f24';
    n.font = '700 13px "Baloo 2", sans-serif';
    n.textAlign = 'center';
    n.fillText('♥', 0, 5);
    n.restore();

    /* painting above the mantel */
    n.save();
    n.translate(OX, H * 0.29);
    n.shadowColor = 'rgba(0,0,0,0.45)';
    n.shadowBlur = 12;
    n.shadowOffsetY = 5;
    rr(n, -64, -46, 128, 92, 6, '#8a6a34');
    n.restore();
    n.save();
    n.translate(OX, H * 0.29);
    n.strokeStyle = '#c99b52';
    n.lineWidth = 3;
    n.strokeRect(-58, -40, 116, 80);
    clipDraw(
      n,
      () => n.rect(-56, -38, 112, 76),
      () => {
        const pSky = n.createLinearGradient(0, -38, 0, 38);
        pSky.addColorStop(0, '#0c1d30');
        pSky.addColorStop(0.6, '#25586e');
        pSky.addColorStop(1, '#12293a');
        n.fillStyle = pSky;
        n.fillRect(-56, -38, 112, 76);
        glow(n, 22, -18, 14, '#fff6dc', 0.6);
        ellipse(n, 22, -18, 5, 5, '#fef8e6');
        n.fillStyle = '#081420';
        (
          [
            [-38, 12],
            [-20, 6],
            [40, 10],
          ] as const
        ).forEach(([tx0, s0]) => {
          n.beginPath();
          n.moveTo(tx0 - s0, 38);
          n.lineTo(tx0, 2 - s0);
          n.lineTo(tx0 + s0, 38);
          n.closePath();
          n.fill();
        });
        glow(n, 6, 24, 9, '#f2b06a', 0.8);
        n.fillStyle = '#f2b06a';
        n.fillRect(4, 21, 4, 5);
      },
    );
    n.restore();

    /* log basket on the hearth end */
    n.save();
    n.translate(W * 0.298, H * 0.752);
    ellipse(n, 0, 12, 30, 7, 'rgba(0,0,0,0.4)');
    n.fillStyle = '#7a5230';
    n.beginPath();
    n.moveTo(-28, -12);
    n.quadraticCurveTo(0, -4, 28, -12);
    n.lineTo(22, 12);
    n.quadraticCurveTo(0, 17, -22, 12);
    n.closePath();
    n.fill();
    n.strokeStyle = 'rgba(36,20,8,0.6)';
    n.lineWidth = 1.6;
    for (let i = 0; i < 4; i += 1) {
      n.beginPath();
      n.moveTo(-26 + i * 2, -10 + i * 6);
      n.quadraticCurveTo(0, -3 + i * 6, 26 - i * 2, -10 + i * 6);
      n.stroke();
    }
    (
      [
        [-10, -14, -0.2],
        [6, -17, 0.24],
        [-2, -20, 0],
      ] as const
    ).forEach(([dx, dy, rot0]) => {
      n.save();
      n.translate(dx, dy);
      n.rotate(rot0);
      ellipse(n, 0, 0, 13, 5.5, '#4a2a16');
      ellipse(n, 10, 0, 3.4, 4.4, '#96693c');
      n.restore();
    });
    n.restore();

    /* bookshelf in the wall gap */
    const SX0 = W * 0.355;
    const SX1 = W * 0.505;
    const SHY = H * 0.335;
    const shw = SX1 - SX0;
    n.save();
    n.shadowColor = 'rgba(0,0,0,0.5)';
    n.shadowBlur = 18;
    n.shadowOffsetX = 8;
    rr(n, SX0, SHY, shw, H * 0.72 - SHY, 4, '#3b2417');
    n.restore();
    fillPat(n, tex('wood'), SX0, SHY, shw, H * 0.72 - SHY, 0.55);
    rr(n, SX0 - 6, SHY - 10, shw + 12, 12, 3, '#55341f');
    n.fillStyle = 'rgba(255,214,160,0.18)';
    n.fillRect(SX0 - 6, SHY - 10, shw + 12, 2.4);
    n.fillStyle = '#120a06';
    n.fillRect(SX0 + 7, SHY + 4, shw - 14, H * 0.72 - SHY - 12);
    const bookCols = [
      '#96471c',
      '#25586e',
      '#62301b',
      '#2c6e4f',
      '#bd5f20',
      '#244a5c',
      '#8a5a35',
      '#7a1f2b',
      '#3d5c4a',
    ];
    const br = mulberry(0xb00c);
    const shelfH = (H * 0.72 - SHY - 16) / 4;
    for (let shelf = 0; shelf < 4; shelf += 1) {
      const syy = SHY + 6 + (shelf + 1) * shelfH;
      n.fillStyle = '#55341f';
      n.fillRect(SX0 + 7, syy, shw - 14, 5);
      n.fillStyle = 'rgba(255,214,160,0.14)';
      n.fillRect(SX0 + 7, syy, shw - 14, 1.4);
      let bx = SX0 + 11;
      const limit = SX1 - 13;
      if (shelf === 0) {
        /* trinkets on top shelf: plant, dice, small stack */
        n.fillStyle = '#96471c';
        rr(n, bx + 4, syy - 16, 15, 16, 2, '#96471c');
        n.strokeStyle = '#2c6e4f';
        n.lineWidth = 2;
        n.beginPath();
        n.moveTo(bx + 11, syy - 16);
        n.quadraticCurveTo(bx + 4, syy - 30, bx + 1, syy - 25);
        n.moveTo(bx + 11, syy - 16);
        n.quadraticCurveTo(bx + 18, syy - 32, bx + 22, syy - 26);
        n.stroke();
        bx += 34;
        while (bx < limit - 40) {
          const bw = 9 + Math.round(br() * 6);
          const bh = shelfH * (0.5 + br() * 0.34);
          n.fillStyle = bookCols[Math.floor(br() * bookCols.length)] ?? bookCols[0]!;
          n.fillRect(bx, syy - bh, bw, bh);
          n.fillStyle = 'rgba(255,230,190,0.16)';
          n.fillRect(bx + 1.4, syy - bh + 3, 1.8, bh - 6);
          bx += bw + 1.6;
        }
        rr(n, limit - 30, syy - 9, 24, 4, 1, '#7a1f2b');
        rr(n, limit - 28, syy - 13, 22, 4, 1, '#25586e');
        rr(n, limit - 26, syy - 17, 20, 4, 1, '#bd5f20');
      } else {
        let count = 0;
        while (bx < limit - 12) {
          const bw = 9 + Math.round(br() * 6);
          const bh = shelfH * (0.52 + br() * 0.36);
          const tilt = br() > 0.88 && count > 2;
          n.save();
          if (tilt) {
            n.translate(bx + bw, syy);
            n.rotate(-0.16);
            n.translate(-(bx + bw), -syy);
          }
          n.fillStyle = bookCols[Math.floor(br() * bookCols.length)] ?? bookCols[0]!;
          n.fillRect(bx, syy - bh, bw, bh);
          n.fillStyle = 'rgba(255,230,190,0.16)';
          n.fillRect(bx + 1.4, syy - bh + 3, 1.8, bh - 6);
          n.fillStyle = 'rgba(0,0,0,0.28)';
          n.fillRect(bx + bw - 2, syy - bh, 2, bh);
          if (bh > shelfH * 0.62) {
            n.strokeStyle = 'rgba(226,194,137,0.4)';
            n.lineWidth = 1;
            n.beginPath();
            n.moveTo(bx + 1.5, syy - bh + 6);
            n.lineTo(bx + bw - 1.5, syy - bh + 6);
            n.moveTo(bx + 1.5, syy - 5);
            n.lineTo(bx + bw - 1.5, syy - 5);
            n.stroke();
          }
          n.restore();
          bx += bw + 1.6;
          count += 1;
        }
        if (shelf === 2) {
          ellipse(n, limit - 5, syy - 5, 4, 4, '#fdf6ec');
          n.fillStyle = '#bd3f24';
          n.fillRect(limit - 6.4, syy - 6.4, 1.6, 1.6);
        }
      }
    }

    /* pendulum wall clock in the gap */
    const CX = W * 0.585;
    const caseW = clamp(W * 0.052, 46, 68);
    const caseT = H * 0.33;
    const caseB = H * 0.585;
    const faceY = caseT + caseW * 0.62;
    n.save();
    n.shadowColor = 'rgba(0,0,0,0.45)';
    n.shadowBlur = 12;
    n.shadowOffsetX = 5;
    rr(n, CX - caseW / 2, caseT, caseW, caseB - caseT, 8, '#5a3a22');
    n.restore();
    fillPat(n, tex('wood'), CX - caseW / 2, caseT, caseW, caseB - caseT, 0.5);
    n.fillStyle = '#3b2417';
    n.beginPath();
    n.moveTo(CX - caseW / 2, caseT);
    n.lineTo(CX, caseT - 14);
    n.lineTo(CX + caseW / 2, caseT);
    n.closePath();
    n.fill();
    ellipse(n, CX, caseT - 15, 3.4, 3.4, '#c99b52');
    const faceR = caseW * 0.4;
    ellipse(n, CX, faceY, faceR + 4, faceR + 4, '#c99b52');
    ellipse(n, CX, faceY, faceR, faceR, '#f6ecd8');
    n.strokeStyle = '#55341f';
    n.lineWidth = 1.4;
    for (let hh = 0; hh < 12; hh += 1) {
      const a = (hh / 12) * Math.PI * 2;
      n.beginPath();
      n.moveTo(CX + Math.cos(a) * faceR * 0.8, faceY + Math.sin(a) * faceR * 0.8);
      n.lineTo(CX + Math.cos(a) * faceR * 0.9, faceY + Math.sin(a) * faceR * 0.9);
      n.stroke();
    }
    n.strokeStyle = '#241609';
    n.lineWidth = 2.4;
    n.lineCap = 'round';
    n.beginPath();
    n.moveTo(CX, faceY);
    n.lineTo(CX + faceR * 0.34, faceY - faceR * 0.4);
    n.moveTo(CX, faceY);
    n.lineTo(CX - faceR * 0.18, faceY + faceR * 0.55);
    n.stroke();
    /* pendulum window */
    const pwX = CX - caseW * 0.28;
    const pwY = faceY + faceR + 10;
    const pwW = caseW * 0.56;
    const pwH = caseB - pwY - 10;
    rr(n, pwX, pwY, pwW, pwH, 5, '#0d0704');
    n.strokeStyle = 'rgba(226,194,137,0.35)';
    n.lineWidth = 1.4;
    n.beginPath();
    n.roundRect(pwX, pwY, pwW, pwH, 5);
    n.stroke();
    ex.clock = {
      x: CX,
      pivotY: pwY - 4,
      winX: pwX,
      winY: pwY,
      winW: pwW,
      winH: pwH,
      len: pwH * 0.78,
    };

    /* record console far right */
    const KX0 = W * 0.845;
    const KX1 = W * 0.985;
    const KTY = H * 0.585;
    const kw = KX1 - KX0;
    n.save();
    n.shadowColor = 'rgba(0,0,0,0.45)';
    n.shadowBlur = 14;
    rr(n, KX0, KTY, kw, H * 0.115, 6, '#4a2e18');
    n.restore();
    fillPat(n, tex('wood'), KX0, KTY, kw, H * 0.115, 0.6);
    n.fillStyle = 'rgba(255,214,160,0.18)';
    n.fillRect(KX0, KTY, kw, 3);
    /* speaker fabric */
    rr(n, KX0 + 8, KTY + H * 0.028, kw * 0.44, H * 0.07, 4, '#241609');
    n.fillStyle = 'rgba(226,194,137,0.2)';
    for (let gx = 0; gx < 6; gx += 1) {
      n.fillRect(KX0 + 12 + (gx * (kw * 0.44 - 8)) / 6, KTY + H * 0.032, 1.6, H * 0.062);
    }
    /* legs */
    n.strokeStyle = '#3b2417';
    n.lineWidth = 5;
    n.lineCap = 'round';
    n.beginPath();
    n.moveTo(KX0 + 10, KTY + H * 0.115);
    n.lineTo(KX0 + 4, H * 0.755);
    n.moveTo(KX1 - 10, KTY + H * 0.115);
    n.lineTo(KX1 - 4, H * 0.755);
    n.stroke();
    /* deck */
    const VX = KX0 + kw * 0.72;
    const VY = KTY - 8;
    rr(n, VX - kw * 0.24, VY - 6, kw * 0.48, 14, 4, '#241609');
    ex.vinyl = { x: VX, y: VY - 6, r: kw * 0.19 };
    /* tonearm base */
    ellipse(n, VX + kw * 0.2, VY - 8, 5, 3.4, '#c9c2b4');

    /* ---- fore: armchair + cat spot, side table ---------------------- */
    const f = fore.g;

    /* side table with mug + cards */
    const STX = W * 0.475;
    const STY = H * 0.875;
    const sts = clamp(Math.min(W, H) / 700, 0.9, 1.5);
    f.save();
    f.translate(STX, STY);
    f.scale(sts, sts);
    ellipse(f, 0, 62, 56, 11, 'rgba(2,5,8,0.5)');
    f.strokeStyle = '#3b2417';
    f.lineWidth = 6;
    f.lineCap = 'round';
    f.beginPath();
    f.moveTo(-38, 8);
    f.lineTo(-46, 60);
    f.moveTo(38, 8);
    f.lineTo(46, 60);
    f.moveTo(0, 12);
    f.lineTo(0, 62);
    f.stroke();
    ellipse(f, 0, 2, 62, 17, '#2c1a0c');
    clipDraw(
      f,
      () => f.ellipse(0, -2, 62, 17, 0, 0, Math.PI * 2),
      () => {
        fillPat(f, tex('wood'), -62, -20, 124, 40, 0.95);
        const tl = f.createLinearGradient(-62, 0, 62, 0);
        tl.addColorStop(0, 'rgba(255,178,74,0.3)');
        tl.addColorStop(0.5, 'rgba(80,40,14,0.12)');
        tl.addColorStop(1, 'rgba(20,10,4,0.4)');
        f.fillStyle = tl;
        f.fillRect(-62, -20, 124, 40);
      },
    );
    f.strokeStyle = 'rgba(255,214,160,0.24)';
    f.lineWidth = 1.6;
    f.beginPath();
    f.ellipse(0, -2, 62, 17, 0, 0, Math.PI * 2);
    f.stroke();
    /* mug */
    f.save();
    f.translate(-24, -14);
    ellipse(f, 0, 10, 13, 4, 'rgba(0,0,0,0.4)');
    rr(f, -10, -12, 20, 22, 4, '#bd5f20');
    const mg = f.createLinearGradient(-10, 0, 10, 0);
    mg.addColorStop(0, 'rgba(255,255,255,0.26)');
    mg.addColorStop(0.5, 'rgba(255,255,255,0)');
    mg.addColorStop(1, 'rgba(0,0,0,0.26)');
    f.fillStyle = mg;
    f.fillRect(-10, -12, 20, 22);
    ellipse(f, 0, -12, 10, 3.2, '#96471c');
    ellipse(f, 0, -12, 7.6, 2.2, '#3a2214');
    f.strokeStyle = '#fdf6ec';
    f.lineWidth = 2.4;
    f.beginPath();
    f.arc(12, -2, 6, -Math.PI * 0.45, Math.PI * 0.45);
    f.stroke();
    f.restore();
    ex.mug = { x: STX - 24 * sts, y: STY - 26 * sts, s: sts };
    /* cards on the table */
    card(f, 16, -8, 0.14, '7', '♣', false, 0.72);
    card(f, 34, -4, -0.1, 'Q', '♦', true, 0.72);
    f.restore();

    /* armchair, bottom-right, cropping the frame */
    const AX = W * 0.71;
    const AY = H * 0.98;
    const cs = clamp(Math.min(W, H) / 420, 1.3, 2.3);
    ex.cat = { x: AX - 6 * cs, y: AY - 62 * cs, s: cs };
    f.save();
    f.translate(AX, AY);
    f.scale(cs, cs);
    ellipse(f, 0, 46, 96, 13, 'rgba(2,5,8,0.5)');
    /* back */
    clipDraw(
      f,
      () => {
        f.moveTo(-78, 46);
        f.lineTo(-78, -34);
        f.quadraticCurveTo(-78, -78, -34, -80);
        f.lineTo(34, -80);
        f.quadraticCurveTo(78, -78, 78, -34);
        f.lineTo(78, 46);
        f.closePath();
      },
      () => {
        const lg = f.createLinearGradient(-78, 0, 78, 0);
        lg.addColorStop(0, '#2e6a84');
        lg.addColorStop(0.45, '#25586e');
        lg.addColorStop(1, '#173c4e');
        f.fillStyle = lg;
        f.fillRect(-88, -90, 176, 146);
        fillPat(f, tex('leather'), -88, -90, 176, 146, 0.55);
        f.fillStyle = 'rgba(255,178,74,0.16)';
        f.fillRect(-88, -90, 34, 146);
      },
    );
    f.strokeStyle = '#14303e';
    f.lineWidth = 3.4;
    f.beginPath();
    f.moveTo(-78, 46);
    f.lineTo(-78, -34);
    f.quadraticCurveTo(-78, -78, -34, -80);
    f.lineTo(34, -80);
    f.quadraticCurveTo(78, -78, 78, -34);
    f.lineTo(78, 46);
    f.stroke();
    /* tufting */
    (
      [
        [-26, -52],
        [0, -56],
        [26, -52],
        [-26, -28],
        [0, -32],
        [26, -28],
      ] as const
    ).forEach(([dx, dy]) => {
      f.strokeStyle = 'rgba(12,32,42,0.7)';
      f.lineWidth = 1.4;
      f.beginPath();
      f.moveTo(dx - 5, dy);
      f.quadraticCurveTo(dx, dy + 4, dx + 5, dy);
      f.stroke();
      ellipse(f, dx, dy - 1, 2.4, 2.4, '#14303e');
      ellipse(f, dx - 0.7, dy - 1.7, 0.9, 0.9, 'rgba(255,255,255,0.25)');
    });
    /* seat cushion */
    const seatG = f.createLinearGradient(0, -14, 0, 22);
    seatG.addColorStop(0, '#31708c');
    seatG.addColorStop(1, '#1d4a5e');
    f.fillStyle = seatG;
    f.beginPath();
    f.roundRect(-58, -12, 116, 34, 13);
    f.fill();
    f.strokeStyle = 'rgba(12,32,42,0.5)';
    f.lineWidth = 2;
    f.stroke();
    /* arms */
    const armG = f.createLinearGradient(0, -20, 0, 40);
    armG.addColorStop(0, '#2e6a84');
    armG.addColorStop(1, '#153847');
    (
      [
        [-1, 0],
        [1, 0],
      ] as const
    ).forEach(([sgn]) => {
      f.fillStyle = armG;
      f.beginPath();
      f.moveTo(sgn * 58, -16);
      f.quadraticCurveTo(sgn * 96, -22, sgn * 96, 8);
      f.quadraticCurveTo(sgn * 96, 38, sgn * 66, 38);
      f.lineTo(sgn * 50, 38);
      f.quadraticCurveTo(sgn * 62, 10, sgn * 58, -16);
      f.closePath();
      f.fill();
      f.strokeStyle = '#14303e';
      f.lineWidth = 2.6;
      f.stroke();
      ellipse(f, sgn * 78, -6, 13, 9, 'rgba(255,255,255,0.08)');
    });
    /* skirt + feet */
    rr(f, -64, 30, 128, 18, 7, '#1a4254');
    f.fillStyle = '#3b2417';
    f.beginPath();
    f.moveTo(-58, 48);
    f.lineTo(-50, 58);
    f.lineTo(-44, 48);
    f.closePath();
    f.fill();
    /* knit blanket over left arm */
    f.save();
    f.translate(-76, -8);
    f.rotate(0.08);
    rr(f, -18, -12, 38, 44, 5, '#d98e3c');
    f.strokeStyle = 'rgba(122,58,20,0.55)';
    f.lineWidth = 2;
    for (let i = 0; i < 4; i += 1) {
      f.beginPath();
      f.moveTo(-18, -4 + i * 11);
      f.lineTo(20, -4 + i * 11);
      f.stroke();
    }
    f.fillStyle = 'rgba(255,230,190,0.2)';
    f.fillRect(-18, -12, 38, 4);
    for (let i = 0; i < 6; i += 1) {
      f.strokeStyle = '#d98e3c';
      f.lineWidth = 2.4;
      f.beginPath();
      f.moveTo(-15 + i * 6.4, 32);
      f.lineTo(-15 + i * 6.4, 39);
      f.stroke();
    }
    f.restore();
    f.restore();

    plates.snug = [far, mid, near, fore];
  }

  function liveSnug(t: number) {
    blitPlates(plates.snug ?? []);
    const ex = readyExtras(EX.snug, [
      'window',
      'hearth',
      'archPath',
      'candles',
      'clock',
      'vinyl',
      'mug',
      'cat',
    ] as const);
    if (!ex) return;

    /* rain in the window */
    withDepth(DEPTHS[0], () => {
      const win = ex.window;
      ctx.save();
      ctx.beginPath();
      ctx.roundRect(win.x, win.y, win.w, win.h, 6);
      ctx.clip();
      const bolt = (t * 0.045) % 1;
      if (bolt > 0.93 && bolt < 0.952) {
        const a = bolt < 0.938 ? 0.3 : bolt < 0.944 ? 0.08 : 0.2;
        ctx.fillStyle = `rgba(214,232,255,${a})`;
        ctx.fillRect(win.x, win.y, win.w, win.h);
      }
      ctx.lineWidth = 1.2;
      rain.forEach((d) => {
        const y = win.y + ((d.y + t * d.s * 0.55) % 1) * win.h;
        const x = win.x + ((d.x + t * 0.008) % 1) * win.w;
        ctx.strokeStyle = `rgba(190,226,236,${d.a})`;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x - 2.4, y + d.len);
        ctx.stroke();
      });
      /* two trickles running down the glass */
      for (let i = 0; i < 2; i += 1) {
        const u = (t * (0.05 + i * 0.023) + i * 0.4) % 1;
        const tx0 = win.x + win.w * (0.3 + i * 0.42) + Math.sin(u * 9 + i) * 4;
        const ty0 = win.y + u * win.h;
        ctx.fillStyle = 'rgba(214,236,244,0.4)';
        ctx.beginPath();
        ctx.ellipse(tx0, ty0, 1.4, 3.2, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = 'rgba(214,236,244,0.14)';
        ctx.beginPath();
        ctx.moveTo(tx0, win.y + u * win.h * 0.55);
        ctx.lineTo(tx0, ty0);
        ctx.stroke();
      }
      ctx.restore();
    });

    /* fire IN the firebox + candles + pendulum + vinyl */
    withDepth(DEPTHS[2], () => {
      const { ox, ohw, oby, oty } = ex.hearth;
      ctx.save();
      ctx.beginPath();
      ex.archPath(ctx);
      ctx.clip();
      const breathe = Math.sin(t * 2.9) * 0.5 + Math.sin(t * 7.7) * 0.3;
      glow(ctx, ox, oby - 6, ohw * 1.25, '#ff9a3c', 0.4 + 0.08 * breathe);
      glow(ctx, ox, oby - 10, ohw * 0.6, '#ffd9a0', 0.35 + 0.08 * breathe);
      const fh = (oby - oty) * 0.9;
      tongue(ctx, t, ox, oby - 4, ohw * 0.52, fh * 0.96, hex('#c1441e', 0.72), 0.4, 2);
      tongue(ctx, t, ox - ohw * 0.4, oby - 2, ohw * 0.2, fh * 0.44, hex('#e26a28', 0.85), 3.2, -3);
      tongue(ctx, t, ox + ohw * 0.42, oby - 2, ohw * 0.18, fh * 0.4, hex('#e29349', 0.85), 4.6, 3);
      tongue(ctx, t, ox, oby - 4, ohw * 0.34, fh * 0.72, hex('#f6a94f', 0.94), 1.6, -1, 'lighter');
      tongue(ctx, t, ox, oby - 4, ohw * 0.18, fh * 0.44, hex('#fff3d6', 0.95), 2.7, 0, 'lighter');
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      embersSN.forEach((e) => {
        const u = ((t + e.delay) % e.life) / e.life;
        const x = ox + e.x * ohw * 0.8 + Math.sin(u * 6 + e.delay) * e.sway * u;
        const y = oby - 6 - u * (oby - oty) * 0.85;
        const a = u < 0.15 ? u / 0.15 : 1 - (u - 0.15) / 0.85;
        ctx.globalAlpha = Math.max(0, a * 0.9);
        glow(ctx, x, y, e.r * 2.6, '#ffb24a', 0.9);
      });
      ctx.globalAlpha = 1;
      ctx.restore();
      ctx.restore();

      /* firelight wash centered on the OPENING */
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      const wcx = ox;
      const wcy = oby - (oby - oty) * 0.4;
      const flick = 0.2 + 0.04 * Math.sin(t * 3.2) + 0.025 * Math.sin(t * 8.1);
      const wash = ctx.createRadialGradient(wcx, wcy, 12, wcx, wcy, Math.max(W, H) * 0.62);
      wash.addColorStop(0, `rgba(226,147,73,${flick + 0.14})`);
      wash.addColorStop(0.25, `rgba(226,147,73,${flick * 0.55})`);
      wash.addColorStop(1, 'rgba(226,147,73,0)');
      ctx.fillStyle = wash;
      ctx.fillRect(-PAD, -PAD, W + PAD * 2, H + PAD * 2);
      glow(ctx, wcx, oby - 8, ohw * 2.1, '#ffb24a', 0.14 + 0.05 * Math.sin(t * 4.4));
      ctx.restore();

      /* mantel candles */
      ex.candles.forEach((cd, i) => {
        const fl = Math.sin(t * 7 + i * 2.4) * 0.5 + Math.sin(t * 13 + i) * 0.3;
        glow(ctx, cd.x, cd.y - cd.h - 9, 13, '#f2b06a', 0.4 + 0.14 * fl);
        ctx.save();
        ctx.translate(cd.x + fl * 0.8, cd.y - cd.h - 7);
        ctx.scale(1, 1 + fl * 0.12);
        const cf = ctx.createRadialGradient(0, 1, 0.4, 0, 0, 5);
        cf.addColorStop(0, '#fff3d6');
        cf.addColorStop(0.55, '#f2b06a');
        cf.addColorStop(1, 'rgba(226,106,40,0)');
        ctx.fillStyle = cf;
        ctx.beginPath();
        ctx.ellipse(0, 0, 2.6, 5, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      });

      /* pendulum */
      const ck = ex.clock;
      ctx.save();
      ctx.beginPath();
      ctx.roundRect(ck.winX + 1, ck.winY + 1, ck.winW - 2, ck.winH - 2, 4);
      ctx.clip();
      const ang = Math.sin(t * 3.05) * 0.2;
      ctx.translate(ck.x, ck.pivotY);
      ctx.rotate(ang);
      ctx.strokeStyle = '#c99b52';
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(0, ck.len);
      ctx.stroke();
      const bob = ctx.createRadialGradient(-2, ck.len + 2, 1, 0, ck.len + 5, 8);
      bob.addColorStop(0, '#f3d7a4');
      bob.addColorStop(1, '#8a6a2c');
      ctx.fillStyle = bob;
      ctx.beginPath();
      ctx.arc(0, ck.len + 5, 7, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      /* vinyl spin + notes */
      const v = ex.vinyl;
      ctx.save();
      ctx.translate(v.x, v.y);
      ctx.scale(1, 0.4);
      ctx.rotate(t * 2.2);
      ctx.drawImage(spr('vinyl'), -v.r, -v.r, v.r * 2, v.r * 2);
      ctx.restore();
      ctx.save();
      ctx.strokeStyle = '#c9c2b4';
      ctx.lineWidth = 2.4;
      ctx.beginPath();
      ctx.moveTo(v.x + v.r * 1.05, v.y - 4);
      ctx.lineTo(v.x + v.r * 0.3, v.y + v.r * 0.16);
      ctx.stroke();
      ellipse(ctx, v.x + v.r * 0.3, v.y + v.r * 0.16, 2.6, 2, '#e2c289');
      ctx.restore();
      ctx.font = '700 16px "Baloo 2", sans-serif';
      ctx.textAlign = 'center';
      for (let i = 0; i < 3; i += 1) {
        const u = (t * 0.17 + i * 0.31) % 1;
        ctx.globalAlpha = u < 0.15 ? u * 6 : 1 - u;
        ctx.fillStyle = 'rgba(242,176,106,0.85)';
        ctx.save();
        ctx.translate(v.x - 14 + i * 12 + Math.sin(u * 5 + i) * 8, v.y - 24 - u * 60);
        ctx.rotate(u * 0.6 - 0.2);
        ctx.fillText(i === 1 ? '♫' : '♪', 0, 0);
        ctx.restore();
      }
      ctx.globalAlpha = 1;
    });

    /* cat + steam, closest layer */
    withDepth(DEPTHS[3], () => {
      const cat = ex.cat;
      const cs = cat.s;
      ctx.save();
      ctx.translate(cat.x, cat.y);
      ctx.scale(cs, cs);
      /* tail: slow curl with occasional flick */
      const flick = Math.sin(t * 0.6) > 0.96 ? Math.sin(t * 14) * 0.16 : 0;
      ctx.strokeStyle = '#d97a2b';
      ctx.lineWidth = 7;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(-24, 10);
      ctx.quadraticCurveTo(-46, 8 + flick * 30, -42, -10 + flick * 40);
      ctx.stroke();
      ctx.strokeStyle = '#b85f1c';
      ctx.lineWidth = 7;
      ctx.setLineDash([5, 7]);
      ctx.beginPath();
      ctx.moveTo(-24, 10);
      ctx.quadraticCurveTo(-46, 8 + flick * 30, -42, -10 + flick * 40);
      ctx.stroke();
      ctx.setLineDash([]);
      /* body breathing */
      const br0 = 1 + Math.sin(t * 1.5) * 0.03;
      ctx.save();
      ctx.scale(1, br0);
      ellipse(ctx, 0, 6, 32, 17, '#e29349');
      const stripes = ['#d97a2b', '#d97a2b', '#d97a2b'];
      stripes.forEach((col, i) => {
        ctx.strokeStyle = col;
        ctx.lineWidth = 3.4;
        ctx.beginPath();
        ctx.arc(-6 + i * 9, 4, 14 - i * 2, -Math.PI * 0.7, -Math.PI * 0.24);
        ctx.stroke();
      });
      ellipse(ctx, -14, 12, 9, 5.4, '#eab271');
      ctx.restore();
      /* head */
      ellipse(ctx, 19, -6, 13, 11, '#eab271');
      ctx.fillStyle = '#d97a2b';
      ctx.beginPath();
      ctx.moveTo(11, -13);
      ctx.lineTo(12.5, -22);
      ctx.lineTo(20, -14);
      ctx.closePath();
      ctx.moveTo(24, -14);
      ctx.lineTo(29, -22);
      ctx.lineTo(31, -12);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#f6c48e';
      ctx.beginPath();
      ctx.moveTo(13, -14.4);
      ctx.lineTo(13.9, -19.4);
      ctx.lineTo(18.1, -14.9);
      ctx.closePath();
      ctx.fill();
      /* closed eyes + nose + whiskers */
      ctx.strokeStyle = '#3b2417';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.arc(15, -7, 2.6, 0.15, Math.PI - 0.15);
      ctx.moveTo(26.6, -7);
      ctx.arc(24, -7, 2.6, 0.15, Math.PI - 0.15);
      ctx.stroke();
      ctx.fillStyle = '#b85f1c';
      ctx.beginPath();
      ctx.moveTo(19, -3.4);
      ctx.lineTo(21, -3.4);
      ctx.lineTo(20, -1.8);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = 'rgba(59,36,23,0.5)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(28, -3);
      ctx.lineTo(35, -4.4);
      ctx.moveTo(28, -1.4);
      ctx.lineTo(35, -0.6);
      ctx.stroke();
      /* front paw tucked */
      ellipse(ctx, 12, 12, 7, 4.4, '#eab271');
      ctx.restore();
      /* z's */
      for (let i = 0; i < 2; i += 1) {
        const u = (t * 0.24 + i * 0.5) % 1;
        ctx.globalAlpha = u < 0.2 ? u * 5 : 1 - u;
        ctx.font = `700 ${(13 + i * 5) * cs * 0.55}px "Baloo 2", sans-serif`;
        ctx.fillStyle = 'rgba(190,226,236,0.85)';
        ctx.fillText(
          'z',
          cat.x + (30 + u * 22 + i * 8) * cs * 0.55,
          cat.y - (26 + u * 40 + i * 12) * cs * 0.55,
        );
      }
      ctx.globalAlpha = 1;

      /* mug steam */
      const mug = ex.mug;
      ctx.strokeStyle = 'rgba(214,236,244,0.35)';
      ctx.lineWidth = 1.8;
      for (let i = 0; i < 2; i += 1) {
        const u = (t * 0.3 + i * 0.5) % 1;
        ctx.globalAlpha = (u < 0.2 ? u * 5 : 1 - u) * 0.6;
        ctx.beginPath();
        const bx = mug.x + i * 6 - 3;
        const by = mug.y - u * 34 * mug.s;
        ctx.moveTo(bx, mug.y);
        ctx.quadraticCurveTo(
          bx + Math.sin(u * 7 + i * 2) * 6,
          (mug.y + by) / 2,
          bx + Math.sin(u * 4 + i) * 4,
          by,
        );
        ctx.stroke();
      }
      ctx.globalAlpha = 1;

      /* room motes near the hearth light */
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      motes.forEach((mo, i) => {
        if (i > 7) return;
        const u = (((t / mo.s + mo.p) % 1) + 1) % 1;
        glow(
          ctx,
          mo.x * W * 0.55 + W * 0.05,
          H * 0.78 - u * H * 0.42,
          mo.r * 2,
          '#f2b06a',
          0.26 * Math.sin(u * Math.PI),
        );
      });
      ctx.restore();
    });
  }

  /* ================================================================== */
  /* BEACH                                                               */
  /* ================================================================== */

  /**
   * Sunset tropical beach: the party scene the Wild soundtrack was written
   * for. Sky and sea burn warm behind the table while the beach bar, festoon
   * lights and tiki torches carry the party; all of the loud colour is baked,
   * and the live pass only breathes — glitter, foam, bulb pulses, torch
   * flames — so it stays as cheap as the other three scenes.
   */
  function bakeBeach() {
    const far = plate();
    const mid = plate();
    const near = plate();
    const fore = plate();
    const ex: SceneExtras = {};
    EX.beach = ex;

    const HOR = H * 0.46;
    const SEA_B = H * 0.62;
    ex.sea = { top: HOR, bot: SEA_B };

    /* ---- far: sunset sky, clouds, the sun, a distant island -------- */
    const g = far.g;
    const sky = g.createLinearGradient(0, -PAD, 0, HOR);
    sky.addColorStop(0, '#140b33');
    sky.addColorStop(0.3, '#3a1a5c');
    sky.addColorStop(0.52, '#8a2f63');
    sky.addColorStop(0.72, '#d4544e');
    sky.addColorStop(0.88, '#f08a3c');
    sky.addColorStop(1, '#ffc46a');
    g.fillStyle = sky;
    g.fillRect(-PAD, -PAD, W + PAD * 2, H + PAD * 2);

    /* early stars, only in the violet band */
    const rnd = mulberry(0x5ea);
    for (let i = 0; i < 70; i += 1) {
      const x = rnd() * (W + PAD * 2) - PAD;
      const y = rnd() * H * 0.2 - PAD * 0.5;
      g.fillStyle = `rgba(255,244,226,${0.1 + rnd() * 0.3})`;
      g.beginPath();
      g.arc(x, y, 0.4 + rnd() * 0.9, 0, Math.PI * 2);
      g.fill();
    }

    const sunX = W * 0.62;
    const sunY = H * 0.395;
    const sunR = clamp(H * 0.075, 34, 64);
    ex.sun = { x: sunX, y: sunY, r: sunR };
    glow(g, sunX, sunY, sunR * 5.2, '#ff9e4f', 0.24);
    glow(g, sunX, sunY, sunR * 2.4, '#ffcf7e', 0.4);
    const sunGrad = g.createRadialGradient(sunX, sunY - sunR * 0.2, sunR * 0.1, sunX, sunY, sunR);
    sunGrad.addColorStop(0, '#fffbe8');
    sunGrad.addColorStop(0.55, '#ffe4a4');
    sunGrad.addColorStop(1, '#ff9e4f');
    g.fillStyle = sunGrad;
    g.beginPath();
    g.arc(sunX, sunY, sunR, 0, Math.PI * 2);
    g.fill();
    /* haze band where the sun meets the water */
    g.save();
    g.globalCompositeOperation = 'screen';
    const haze = g.createLinearGradient(0, HOR - 26, 0, HOR);
    haze.addColorStop(0, 'rgba(255,196,106,0)');
    haze.addColorStop(1, 'rgba(255,196,106,0.4)');
    g.fillStyle = haze;
    g.fillRect(-PAD, HOR - 26, W + PAD * 2, 26);
    g.restore();

    /* sun-lit cloud streaks: long, soft, and warm-bellied, never blobs */
    const cloud = (cx: number, cy: number, s: number, seed: number) => {
      const rc = mulberry(seed);
      g.save();
      g.translate(cx, cy);
      for (let i = 0; i < 5; i += 1) {
        const ox = (rc() - 0.5) * 150 * s;
        const oy = (rc() - 0.5) * 20 * s + i * 3 * s;
        const rx = (52 + rc() * 66) * s;
        const streak = g.createLinearGradient(ox - rx, 0, ox + rx, 0);
        streak.addColorStop(0, 'rgba(90,35,80,0)');
        streak.addColorStop(0.5, `rgba(90,35,80,${0.22 + rc() * 0.12})`);
        streak.addColorStop(1, 'rgba(90,35,80,0)');
        g.fillStyle = streak;
        g.beginPath();
        g.ellipse(ox, oy, rx, rx * 0.085, 0, 0, Math.PI * 2);
        g.fill();
        const under = g.createLinearGradient(ox - rx * 0.8, 0, ox + rx * 0.8, 0);
        under.addColorStop(0, 'rgba(255,158,106,0)');
        under.addColorStop(0.5, `rgba(255,158,106,${0.22 + rc() * 0.1})`);
        under.addColorStop(1, 'rgba(255,158,106,0)');
        g.fillStyle = under;
        g.beginPath();
        g.ellipse(ox, oy + rx * 0.07, rx * 0.8, rx * 0.045, 0, 0, Math.PI * 2);
        g.fill();
      }
      g.restore();
    };
    cloud(W * 0.2, H * 0.15, 1.1, 0xc1);
    cloud(W * 0.74, H * 0.1, 0.9, 0xc2);
    cloud(W * 0.44, H * 0.26, 1.35, 0xc3);
    cloud(W * 0.9, H * 0.3, 0.8, 0xc4);

    /* far island, off to the left of the sun path */
    g.fillStyle = '#2c1440';
    g.beginPath();
    g.moveTo(W * 0.02, HOR + 1);
    g.quadraticCurveTo(W * 0.09, HOR - H * 0.045, W * 0.2, HOR + 1);
    g.closePath();
    g.fill();

    /* homeward birds */
    g.strokeStyle = 'rgba(30,14,42,0.8)';
    g.lineWidth = 1.6;
    (
      [
        [0.3, 0.17, 7],
        [0.34, 0.2, 5],
        [0.27, 0.22, 4],
      ] as const
    ).forEach(([bx, by, s]) => {
      g.beginPath();
      g.moveTo(W * bx - s, H * by);
      g.quadraticCurveTo(W * bx, H * by - s * 0.9, W * bx + s, H * by);
      g.stroke();
    });

    /* ---- mid: the sea --------------------------------------------- */
    const m = mid.g;
    const seaGrad = m.createLinearGradient(0, HOR, 0, SEA_B);
    seaGrad.addColorStop(0, '#c25a43');
    seaGrad.addColorStop(0.22, '#8a3a58');
    seaGrad.addColorStop(0.55, '#2e4d70');
    seaGrad.addColorStop(1, '#173a52');
    m.fillStyle = seaGrad;
    m.fillRect(-PAD, HOR, W + PAD * 2, SEA_B - HOR);

    /* baked base of the sun's glitter path; the live pass sparkles over it */
    m.save();
    m.globalCompositeOperation = 'screen';
    const path = m.createLinearGradient(0, HOR, 0, SEA_B);
    path.addColorStop(0, 'rgba(255,214,142,0.42)');
    path.addColorStop(0.75, 'rgba(255,158,79,0.1)');
    path.addColorStop(1, 'rgba(255,158,79,0)');
    m.fillStyle = path;
    m.beginPath();
    m.moveTo(sunX - sunR * 0.5, HOR);
    m.lineTo(sunX + sunR * 0.5, HOR);
    m.lineTo(sunX + sunR * 1.7, SEA_B);
    m.lineTo(sunX - sunR * 1.7, SEA_B);
    m.closePath();
    m.fill();
    m.restore();

    /* still wave bands */
    m.strokeStyle = 'rgba(20,36,54,0.5)';
    m.lineWidth = 1.2;
    for (let i = 0; i < 7; i += 1) {
      const yy = HOR + 6 + i * ((SEA_B - HOR) * 0.135);
      m.beginPath();
      for (let x = -PAD; x < W + PAD; x += 14) {
        const y = yy + Math.sin(x * 0.02 + i * 2.3) * (1.2 + i * 0.3);
        if (x === -PAD) m.moveTo(x, y);
        else m.lineTo(x, y);
      }
      m.stroke();
    }

    /* a sailboat heading home, silhouetted on the bright side */
    m.save();
    m.translate(W * 0.24, HOR + H * 0.018);
    m.fillStyle = '#241234';
    m.beginPath();
    m.moveTo(-14, 0);
    m.quadraticCurveTo(0, 7, 15, 0);
    m.closePath();
    m.fill();
    m.beginPath();
    m.moveTo(1, -2);
    m.lineTo(1, -26);
    m.lineTo(12, -4);
    m.closePath();
    m.fill();
    m.beginPath();
    m.moveTo(-2, -2);
    m.lineTo(-2, -22);
    m.lineTo(-11, -4);
    m.closePath();
    m.fill();
    m.restore();

    /* ---- near: sand, palms, string lights, bar, torches ------------ */
    const n = near.g;
    const shoreAt = (x: number) =>
      H * 0.615 + Math.sin(x * 0.012) * 6 + (fbm(x * 0.01, 9, 3) - 0.5) * 10;
    n.beginPath();
    n.moveTo(-PAD, H + PAD);
    n.lineTo(-PAD, shoreAt(-PAD));
    for (let x = -PAD; x <= W + PAD; x += 16) n.lineTo(x, shoreAt(x));
    n.lineTo(W + PAD, H + PAD);
    n.closePath();
    const sand = n.createLinearGradient(0, H * 0.6, 0, H + PAD);
    sand.addColorStop(0, '#b87c52');
    sand.addColorStop(0.35, '#96603f');
    sand.addColorStop(1, '#4c2c22');
    n.fillStyle = sand;
    n.fill();

    clipDraw(
      n,
      () => {
        n.moveTo(-PAD, H + PAD);
        n.lineTo(-PAD, shoreAt(-PAD));
        for (let x = -PAD; x <= W + PAD; x += 16) n.lineTo(x, shoreAt(x));
        n.lineTo(W + PAD, H + PAD);
        n.closePath();
      },
      () => {
        /* wet band mirroring the sky, then sand speckle and edge shade */
        const wet = n.createLinearGradient(0, H * 0.6, 0, H * 0.67);
        wet.addColorStop(0, 'rgba(255,170,102,0.5)');
        wet.addColorStop(1, 'rgba(255,170,102,0)');
        n.fillStyle = wet;
        n.fillRect(-PAD, H * 0.59, W + PAD * 2, H * 0.09);
        const rs = mulberry(0x5a2);
        for (let i = 0; i < 260; i += 1) {
          const x = rs() * (W + PAD * 2) - PAD;
          const y = H * (0.63 + rs() * 0.37);
          n.fillStyle = rs() > 0.5 ? 'rgba(64,36,26,0.35)' : 'rgba(255,208,150,0.18)';
          n.fillRect(x, y, 1.6, 1.2);
        }
        const edgeShade = n.createLinearGradient(0, 0, W, 0);
        edgeShade.addColorStop(0, 'rgba(16,6,20,0.5)');
        edgeShade.addColorStop(0.3, 'rgba(16,6,20,0)');
        edgeShade.addColorStop(0.7, 'rgba(16,6,20,0)');
        edgeShade.addColorStop(1, 'rgba(16,6,20,0.5)');
        n.fillStyle = edgeShade;
        n.fillRect(-PAD, H * 0.55, W + PAD * 2, H * 0.55 + PAD);
      },
    );
    /* shoreline highlight where the last wave reaches */
    n.strokeStyle = 'rgba(255,236,210,0.4)';
    n.lineWidth = 2;
    n.beginPath();
    for (let x = -PAD; x <= W + PAD; x += 16) {
      const y = shoreAt(x) + 1.5;
      if (x === -PAD) n.moveTo(x, y);
      else n.lineTo(x, y);
    }
    n.stroke();

    /* shells and a starfish */
    const rsh = mulberry(0x77e);
    for (let i = 0; i < 6; i += 1) {
      const x = W * (0.18 + rsh() * 0.6);
      const y = H * (0.7 + rsh() * 0.16);
      const r = 2.5 + rsh() * 3.5;
      ellipse(n, x, y + r * 0.3, r, r * 0.3, 'rgba(20,8,16,0.4)');
      ellipse(n, x, y, r, r * 0.7, i % 2 ? '#e8c9a8' : '#d98a76');
    }

    /* the two palms that hold the party lights */
    const palm = (baseX: number, baseY: number, h: number, lean: number, seed: number): Anchor => {
      const rp = mulberry(seed);
      const topX = baseX + lean * h * 0.34;
      const topY = baseY - h;
      n.save();
      /* trunk: one smooth bow, with a faint warm rim on the sun side */
      n.strokeStyle = '#241226';
      n.lineCap = 'round';
      for (let i = 0; i < 3; i += 1) {
        n.lineWidth = 6.5 - i * 1.9;
        n.beginPath();
        n.moveTo(baseX, baseY);
        n.quadraticCurveTo(
          baseX + lean * h * 0.08,
          baseY - h * 0.55,
          baseX + lean * h * 0.34,
          topY + h * (0.3 - i * 0.15),
        );
        n.stroke();
      }
      n.strokeStyle = 'rgba(240,138,60,0.24)';
      n.lineWidth = 1.4;
      n.beginPath();
      n.moveTo(baseX + lean * 2.4, baseY - 2);
      n.quadraticCurveTo(
        baseX + lean * h * 0.08 + lean * 2.4,
        baseY - h * 0.55,
        topX + lean * 1.4,
        topY + h * 0.05,
      );
      n.stroke();
      /* ring notches up the bow */
      n.strokeStyle = 'rgba(12,5,16,0.55)';
      n.lineWidth = 1.2;
      for (let i = 1; i < 9; i += 1) {
        const u = i / 9 + (rp() - 0.5) * 0.02;
        const x = baseX + lean * h * 0.34 * u * u;
        const y = baseY - h * u;
        const w = 3.4 - u * 1.4;
        n.beginPath();
        n.moveTo(x - w, y);
        n.quadraticCurveTo(x, y + 2.2, x + w, y);
        n.stroke();
      }
      /* fronds: dark arcs with a droop, rim-lit toward the sun */
      for (let i = 0; i < 8; i += 1) {
        const ang = -Math.PI * 0.92 + (i / 7) * Math.PI * 0.86;
        const len = h * (0.3 + rp() * 0.14);
        const ex1 = topX + Math.cos(ang) * len;
        const ey1 = topY + Math.sin(ang) * len * 0.62 + len * 0.34;
        n.strokeStyle = '#1d1022';
        n.lineWidth = 4.6;
        n.lineCap = 'round';
        n.beginPath();
        n.moveTo(topX, topY);
        n.quadraticCurveTo(
          topX + Math.cos(ang) * len * 0.6,
          topY + Math.sin(ang) * len * 0.5,
          ex1,
          ey1,
        );
        n.stroke();
        n.strokeStyle = 'rgba(240,138,60,0.28)';
        n.lineWidth = 1.4;
        n.stroke();
        /* leaflets hanging off the rib */
        n.strokeStyle = '#1d1022';
        n.lineWidth = 1.6;
        for (let k = 2; k < 7; k += 1) {
          const u = k / 7;
          const lx = topX + (ex1 - topX) * u;
          const ly = topY + (ey1 - topY) * u - Math.sin(u * Math.PI) * len * 0.16;
          n.beginPath();
          n.moveTo(lx, ly);
          n.lineTo(lx + Math.cos(ang) * 7, ly + 9 + u * 5);
          n.stroke();
        }
      }
      /* coconuts */
      ellipse(n, topX - 5, topY + 7, 3.4, 3.1, '#150b1a');
      ellipse(n, topX + 4, topY + 9, 3, 2.8, '#150b1a');
      n.restore();
      return { x: topX, y: topY + 6 };
    };
    const palmL = palm(W * 0.09, H * 0.78, H * 0.5, 0.9, 0xb1);
    const palmR = palm(W * 0.93, H * 0.8, H * 0.56, -0.85, 0xa7);

    /* festoon lights sagging between the palm crowns */
    const sagX = (palmL.x + palmR.x) / 2;
    const sagY = Math.max(palmL.y, palmR.y) + H * 0.13;
    n.strokeStyle = 'rgba(20,10,22,0.85)';
    n.lineWidth = 1.6;
    n.beginPath();
    n.moveTo(palmL.x, palmL.y);
    n.quadraticCurveTo(sagX, sagY, palmR.x, palmR.y);
    n.stroke();
    const bulbs: Anchor[] = [];
    for (let i = 1; i < 14; i += 1) {
      const u = i / 14;
      const x = (1 - u) * (1 - u) * palmL.x + 2 * (1 - u) * u * sagX + u * u * palmR.x;
      const y = (1 - u) * (1 - u) * palmL.y + 2 * (1 - u) * u * sagY + u * u * palmR.y;
      bulbs.push({ x, y: y + 5 });
      n.strokeStyle = 'rgba(20,10,22,0.85)';
      n.beginPath();
      n.moveTo(x, y);
      n.lineTo(x, y + 4);
      n.stroke();
      ellipse(n, x, y + 6, 2.6, 3, '#3a2436');
    }
    ex.bulbs = bulbs;

    /* the beach bar: bamboo counter, thatch roof, glowing shelf */
    const bx = W * 0.795;
    const by = H * 0.685;
    const bs = clamp(H / 720, 0.75, 1.2);
    ex.bar = { x: bx, y: by - 74 * bs, s: bs };
    n.save();
    n.translate(bx, by);
    n.scale(bs, bs);
    ellipse(n, 0, 6, 92, 12, 'rgba(20,8,16,0.42)');
    /* counter */
    n.fillStyle = '#4a2a20';
    n.fillRect(-66, -44, 132, 48);
    n.strokeStyle = 'rgba(240,170,110,0.35)';
    n.lineWidth = 1.4;
    for (let i = 0; i < 7; i += 1) {
      n.beginPath();
      n.moveTo(-62 + i * 20, -44);
      n.lineTo(-62 + i * 20, 2);
      n.stroke();
    }
    n.fillStyle = '#6b4030';
    n.fillRect(-72, -50, 144, 8);
    /* interior glow + bottles on the shelf */
    const barGlow = n.createLinearGradient(0, -86, 0, -50);
    barGlow.addColorStop(0, 'rgba(255,178,90,0.12)');
    barGlow.addColorStop(1, 'rgba(255,178,90,0.4)');
    n.fillStyle = barGlow;
    n.fillRect(-58, -86, 116, 36);
    (
      [
        [-40, '#7fe0c3'],
        [-22, '#f792c8'],
        [-4, '#ffd98e'],
        [14, '#8fb8ff'],
        [32, '#f0966f'],
      ] as const
    ).forEach(([ox, color]) => {
      n.fillStyle = color;
      n.globalAlpha = 0.85;
      n.fillRect(ox, -74, 7, 22);
      n.fillRect(ox + 2.4, -80, 2.2, 6);
      n.globalAlpha = 1;
    });
    /* thatch roof */
    n.fillStyle = '#2c1626';
    n.beginPath();
    n.moveTo(-92, -86);
    n.lineTo(0, -118);
    n.lineTo(92, -86);
    n.closePath();
    n.fill();
    n.strokeStyle = '#8a5a33';
    n.lineWidth = 2;
    for (let i = 0; i < 12; i += 1) {
      n.beginPath();
      n.moveTo(-88 + i * 16, -86 + Math.abs(i - 6) * -0.5);
      n.lineTo(-80 + i * 16, -98 - Math.abs(6 - i));
      n.stroke();
    }
    /* poles */
    n.fillStyle = '#3a2018';
    n.fillRect(-64, -86, 5, 42);
    n.fillRect(59, -86, 5, 42);
    n.restore();

    /* tiki torches planted in the sand */
    const torchesB: ScaledAnchor[] = [];
    (
      [
        [W * 0.285, H * 0.745],
        [W * 0.6, H * 0.72],
      ] as const
    ).forEach(([tx, ty]) => {
      const ts = clamp(H / 760, 0.7, 1.15);
      ellipse(n, tx, ty + 2, 10 * ts, 3 * ts, 'rgba(20,8,16,0.45)');
      n.fillStyle = '#33201a';
      n.fillRect(tx - 2.4 * ts, ty - 64 * ts, 4.8 * ts, 64 * ts);
      n.strokeStyle = 'rgba(240,170,110,0.3)';
      n.lineWidth = 1.2;
      n.beginPath();
      n.moveTo(tx - 2.4 * ts, ty - 34 * ts);
      n.lineTo(tx + 2.4 * ts, ty - 34 * ts);
      n.stroke();
      /* woven bowl */
      n.fillStyle = '#4a2a20';
      n.beginPath();
      n.moveTo(tx - 7 * ts, ty - 64 * ts);
      n.lineTo(tx + 7 * ts, ty - 64 * ts);
      n.lineTo(tx + 4 * ts, ty - 78 * ts);
      n.lineTo(tx - 4 * ts, ty - 78 * ts);
      n.closePath();
      n.fill();
      torchesB.push({ x: tx, y: ty - 80 * ts, s: ts });
    });
    ex.torchesB = torchesB;

    /* ---- fore: framing fronds, a surfboard, a drink at your elbow --- */
    const f = fore.g;
    /* oversized frond silhouettes dipping into the top corners */
    const frond = (ox: number, oy: number, ang: number, len: number) => {
      f.strokeStyle = 'rgba(14,7,18,0.92)';
      f.lineCap = 'round';
      f.lineWidth = 9;
      f.beginPath();
      f.moveTo(ox, oy);
      f.quadraticCurveTo(
        ox + Math.cos(ang) * len * 0.5,
        oy + Math.sin(ang) * len * 0.5 - len * 0.1,
        ox + Math.cos(ang) * len,
        oy + Math.sin(ang) * len + len * 0.24,
      );
      f.stroke();
      f.lineWidth = 3;
      for (let k = 1; k < 10; k += 1) {
        const u = k / 10;
        const lx = ox + Math.cos(ang) * len * u;
        const ly = oy + Math.sin(ang) * len * u + len * 0.22 * u * u;
        f.beginPath();
        f.moveTo(lx, ly);
        f.lineTo(lx + Math.cos(ang + 1.2) * 26 * (1 - u * 0.4), ly + 30 * (1 - u * 0.3));
        f.stroke();
      }
    };
    frond(-PAD * 0.5, H * 0.02, 0.5, W * 0.2);
    frond(W + PAD * 0.5, H * 0.05, Math.PI - 0.4, W * 0.24);

    /* surfboard leaning into frame on the left */
    f.save();
    f.translate(W * 0.055, H * 0.87);
    f.rotate(-0.16);
    ellipse(f, 6, 34, 30, 7, 'rgba(20,8,16,0.4)');
    const board = f.createLinearGradient(-12, 0, 14, 0);
    board.addColorStop(0, '#d4544e');
    board.addColorStop(0.5, '#f0966f');
    board.addColorStop(1, '#d4544e');
    f.fillStyle = board;
    f.beginPath();
    f.ellipse(0, 0, 15, 62, 0, 0, Math.PI * 2);
    f.fill();
    f.fillStyle = '#fff3d6';
    f.fillRect(-2.2, -56, 4.4, 112);
    f.strokeStyle = 'rgba(60,20,24,0.5)';
    f.lineWidth = 2;
    f.beginPath();
    f.ellipse(0, 0, 15, 62, 0, 0, Math.PI * 2);
    f.stroke();
    f.restore();

    /* a cocktail on a driftwood stump, bottom right */
    f.save();
    f.translate(W * 0.9, H * 0.9);
    ellipse(f, 0, 14, 26, 7, 'rgba(20,8,16,0.45)');
    f.fillStyle = '#4a2a20';
    f.fillRect(-20, -6, 40, 20);
    ellipse(f, 0, -6, 20, 6, '#6b4030');
    f.fillStyle = 'rgba(255,220,160,0.9)';
    f.beginPath();
    f.moveTo(-9, -30);
    f.lineTo(9, -30);
    f.lineTo(2.4, -12);
    f.lineTo(-2.4, -12);
    f.closePath();
    f.fill();
    f.fillStyle = '#f792c8';
    f.beginPath();
    f.moveTo(-7.4, -28);
    f.lineTo(7.4, -28);
    f.lineTo(2, -14);
    f.lineTo(-2, -14);
    f.closePath();
    f.fill();
    f.strokeStyle = '#7fe0c3';
    f.lineWidth = 2;
    f.beginPath();
    f.moveTo(4, -30);
    f.lineTo(8, -42);
    f.stroke();
    ellipse(f, 9, -44, 4, 4, '#d4544e');
    f.restore();

    plates.beach = [far, mid, near, fore];
  }

  function liveBeach(t: number) {
    blitPlates(plates.beach ?? []);
    const ex = readyExtras(EX.beach, ['sun', 'sea', 'bulbs', 'torchesB', 'bar'] as const);
    if (!ex) return;

    /* the sun breathes; the first stars blink on */
    withDepth(DEPTHS[0], () => {
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      const breathe = 0.5 + 0.5 * Math.sin(t * 0.7);
      glow(ctx, ex.sun.x, ex.sun.y, ex.sun.r * 3.4, '#ffcf7e', 0.1 + 0.05 * breathe);
      ctx.restore();
      twinkles.forEach((s, i) => {
        if (i > 9 || s.y > 0.18) return;
        const tw = 0.3 + 0.7 * (0.5 + 0.5 * Math.sin(t * s.s + s.p));
        ctx.fillStyle = `rgba(255,244,226,${s.a * 0.5 * tw})`;
        ctx.beginPath();
        ctx.arc(s.x * W, s.y * H, s.r, 0, Math.PI * 2);
        ctx.fill();
      });
    });

    /* the sea: glitter path, drifting swell, foam reaching the sand */
    withDepth(DEPTHS[1], () => {
      const { top, bot } = ex.sea;
      ctx.save();
      ctx.beginPath();
      ctx.rect(-PAD, top, W + PAD * 2, bot - top + 14);
      ctx.clip();
      ctx.globalCompositeOperation = 'screen';
      glints.forEach((sp) => {
        const y = top + sp.y * (bot - top);
        const spread = 0.5 + sp.y * 1.2;
        const x = ex.sun.x + sp.x * W * spread + Math.sin(t * 0.4 + sp.p) * 6 * spread;
        const a = Math.max(0, Math.sin(t * sp.s + sp.p)) * 0.34 * (1 - sp.y * 0.45);
        ctx.fillStyle = `rgba(255,220,150,${a})`;
        ctx.fillRect(x - sp.w / 2, y, sp.w * (0.6 + sp.y * 0.7), 2);
      });
      ctx.globalCompositeOperation = 'source-over';
      ctx.strokeStyle = `rgba(255,190,150,${0.1 + 0.05 * Math.sin(t * 1.4)})`;
      ctx.lineWidth = 1.1;
      for (let i = 0; i < 3; i += 1) {
        const yy = top + 14 + i * 14 + Math.sin(t * 0.6 + i) * 2;
        ctx.beginPath();
        for (let x = -20; x < W + 20; x += 16) {
          const y = yy + Math.sin(x * 0.02 + t * 1.1 + i * 1.7) * 2;
          if (x === -20) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
      }
      /* the last wave: a foam line breathing up the wet sand with the tide */
      const tide = Math.sin(t * 0.55);
      ctx.strokeStyle = `rgba(255,244,230,${0.3 + 0.18 * tide})`;
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      for (let x = -20; x < W + 20; x += 14) {
        const y = bot + 2 + tide * 4 + Math.sin(x * 0.012) * 5 + Math.sin(x * 0.05 + t) * 1.4;
        if (x === -20) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
      ctx.restore();
    });

    /* party lights: festoon bulbs cycling colour, bar wash swaying */
    withDepth(DEPTHS[2], () => {
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      const colors = ['#ffd98e', '#7fe0c3', '#f792c8', '#8fb8ff'];
      ex.bulbs.forEach((b, i) => {
        const pulse = 0.55 + 0.45 * Math.sin(t * 1.9 + i * 0.9);
        glow(ctx, b.x, b.y, 8, colors[i % colors.length] ?? '#ffd98e', 0.5 * pulse);
      });
      const bar = ex.bar;
      glow(ctx, bar.x, bar.y, 80 * bar.s, '#ffb25a', 0.14 + 0.04 * Math.sin(t * 2.2));
      /* two slow colour sweeps out of the bar — the party without the strobe */
      for (let i = 0; i < 2; i += 1) {
        const swing = Math.sin(t * (0.4 + i * 0.17) + i * 2.6) * 0.5;
        ctx.save();
        ctx.translate(bar.x, bar.y);
        ctx.rotate(-Math.PI / 2 + swing);
        const beam = ctx.createLinearGradient(0, 0, 0, -H * 0.34);
        const color = i === 0 ? '247,146,200' : '127,224,195';
        beam.addColorStop(0, `rgba(${color},0.13)`);
        beam.addColorStop(1, `rgba(${color},0)`);
        ctx.fillStyle = beam;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(-H * 0.055, -H * 0.34);
        ctx.lineTo(H * 0.055, -H * 0.34);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }
      ctx.restore();
    });

    /* torch flames and the warm shore wash */
    withDepth(DEPTHS[3], () => {
      ex.torchesB.forEach((torch, i) => {
        ctx.save();
        ctx.globalCompositeOperation = 'screen';
        glow(
          ctx,
          torch.x,
          torch.y - 8 * torch.s,
          52 * torch.s,
          '#ffb24a',
          0.2 + 0.06 * Math.sin(t * 3.1 + i * 2),
        );
        ctx.restore();
        tongue(
          ctx,
          t,
          torch.x,
          torch.y + 4 * torch.s,
          11 * torch.s,
          40 * torch.s,
          hex('#e26a28', 0.85),
          1.1 + i * 2.3,
          -2 * torch.s,
        );
        tongue(
          ctx,
          t,
          torch.x,
          torch.y + 2 * torch.s,
          6.5 * torch.s,
          26 * torch.s,
          hex('#ffd98e', 0.9),
          2.6 + i * 1.7,
          0,
          'lighter',
        );
      });
      /* a few sparks off each torch */
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      embersSN.forEach((e, i) => {
        const torch = ex.torchesB[i % ex.torchesB.length];
        if (!torch) return;
        const u = ((t + e.delay) % e.life) / e.life;
        const a = u < 0.15 ? u / 0.15 : 1 - (u - 0.15) / 0.85;
        ctx.globalAlpha = Math.max(0, a) * 0.8;
        glow(
          ctx,
          torch.x + e.x * 30 * torch.s + Math.sin(u * 6 + e.delay) * e.sway * 0.4,
          torch.y - u * 60 * torch.s,
          e.r * 2.4 * torch.s,
          '#ffb24a',
          0.9,
        );
      });
      ctx.globalAlpha = 1;
      ctx.restore();
    });
  }

  /* ================================================================== */
  /* frame loop + chrome                                                 */
  /* ================================================================== */

  /**
   * The grade never changes between frames — it depends only on the canvas
   * size — but it used to be rebuilt from scratch every frame: two gradients
   * constructed, two full-screen fills, plus the grain blit. Baked once per
   * resize, the whole chrome pass costs a single blit.
   */
  let vignettePlate: HTMLCanvasElement | null = null;

  function bakeVignette() {
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(W * dpr));
    c.height = Math.max(1, Math.round(H * dpr));
    const g = context2d(c);
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    // A touch deeper and tighter than it used to be: the animated props all
    // live in the periphery, and settling them into shadow keeps the scene
    // from competing with the cards while the saturated centre stays lively.
    const radial = g.createRadialGradient(W * 0.5, H * 0.55, H * 0.14, W * 0.5, H * 0.53, H * 0.74);
    radial.addColorStop(0, 'rgba(4,9,14,0)');
    radial.addColorStop(1, 'rgba(4,9,14,0.58)');
    g.fillStyle = radial;
    g.fillRect(0, 0, W, H);
    const grade = g.createLinearGradient(0, 0, 0, H);
    grade.addColorStop(0, 'rgba(30,58,80,0.07)');
    grade.addColorStop(0.5, 'rgba(0,0,0,0)');
    grade.addColorStop(1, 'rgba(20,10,4,0.1)');
    g.fillStyle = grade;
    g.fillRect(0, 0, W, H);
    if (tex('grain')) {
      g.globalAlpha = 0.07;
      g.drawImage(tex('grain'), 0, 0, W, H);
      g.globalAlpha = 1;
    }
    vignettePlate = c;
  }

  function vignette() {
    if (!vignettePlate) bakeVignette();
    if (vignettePlate) ctx.drawImage(vignettePlate, 0, 0, W, H);
  }

  function ensureBaked(id: SceneId) {
    if (plates[id]) return;
    if (id === 'campfire') bakeCampfire();
    else if (id === 'casino') bakeCasino();
    else if (id === 'beach') bakeBeach();
    else bakeSnug();
  }

  function renderScene(t: number) {
    ensureBaked(scene);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'medium';
    if (scene === 'casino') liveCasino(t);
    else if (scene === 'snug') liveSnug(t);
    else if (scene === 'beach') liveBeach(t);
    else liveCampfire(t);
    vignette();
  }

  let frameId = 0;
  let resizeTimer = 0;

  /**
   * The app targets 60fps. This scene is the thing most willing to give a frame
   * up to protect that.
   *
   * It is a slow ambient painting — drifting aurora, a flickering fire — behind
   * a card table that animates on the same thread. Measured on an emulated
   * iPhone under a 4x CPU throttle, drawing it every frame costs the table its
   * budget: the app's 99th-percentile frame goes from 17ms to 67ms and one
   * frame in fifteen misses. Drawing it every *other* frame is visually
   * indistinguishable at this speed of motion and the app holds 60fps.
   *
   * So a pointer-coarse device (a phone, where the cost lands and where the
   * parallax is meaningless anyway) paints at 30fps, a desktop paints every
   * frame, and either way the scene watches the rate the page is actually
   * delivering and gives up half its frames if that slips. Promotion needs a
   * sustained calm spell, so it settles instead of oscillating.
   */
  const HALF_RATE_MS = 1000 / 30;
  const SLIPPING_MS = 22;
  const CALM_MS = 14;
  const CALM_HOLD_MS = 10_000;
  /* Ambient time runs ~15% slower than the wall clock. The scene is set
     dressing behind a card table; at full speed its flicker and drift pulled
     the eye off the game, and slowing every oscillator at the source calms all
     three scenes at once without touching any of them individually. */
  const AMBIENT_TIME_SCALE = 0.00085;

  let frameBudgetMs = coarseQuery.matches ? HALF_RATE_MS : 0;
  let intervalEma = 16.7;
  let lastCallbackAt = 0;
  let calmSince = 0;
  let lastDrawn = -Infinity;

  function frame(now: number) {
    frameId = requestAnimationFrame(frame);
    const next = options.getScene();
    if (next !== scene) scene = next;
    reduced = options.getReducedMotion() || calmQuery.matches;
    if (reduced) {
      cancelAnimationFrame(frameId);
      frameId = 0;
      px = 0;
      py = 0;
      renderScene(2.4);
      return;
    }

    // The gap between callbacks is the rate the page is really running at —
    // including whatever the table is doing — not just this scene's own cost.
    const gap = now - lastCallbackAt;
    lastCallbackAt = now;
    if (gap > 0 && gap < 200) intervalEma = intervalEma * 0.92 + gap * 0.08;
    if (frameBudgetMs === 0 && intervalEma > SLIPPING_MS) {
      frameBudgetMs = HALF_RATE_MS;
      calmSince = 0;
    } else if (frameBudgetMs > 0 && !coarseQuery.matches && intervalEma < CALM_MS) {
      if (calmSince === 0) calmSince = now;
      else if (now - calmSince > CALM_HOLD_MS) frameBudgetMs = 0;
    } else {
      calmSince = 0;
    }

    if (now - lastDrawn < frameBudgetMs - 0.5) return;
    lastDrawn = now;
    px += (mx - px) * 0.055;
    py += (my - py) * 0.055;
    renderScene(now * AMBIENT_TIME_SCALE);
  }

  function resize() {
    // A phone's screen is dense enough that the scene's soft, painterly work
    // reads identically at 1.5x, and the fill saved there is the single
    // biggest win available on the device that needs it most.
    const next = sceneBufferSize(
      canvas.clientWidth || window.innerWidth,
      canvas.clientHeight || window.innerHeight,
      window.devicePixelRatio || 1,
      coarseQuery.matches,
    );
    const prev = {
      dpr,
      cssWidth: W,
      cssHeight: H,
      bakeDpr,
      bufferWidth: canvas.width,
      bufferHeight: canvas.height,
    };
    if (sceneBufferUnchanged(prev, next)) return;

    dpr = next.dpr;
    W = next.cssWidth;
    H = next.cssHeight;
    bakeDpr = next.bakeDpr;
    canvas.width = next.bufferWidth;
    canvas.height = next.bufferHeight;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    seedFields();
    plates.campfire = null;
    plates.casino = null;
    plates.snug = null;
    plates.beach = null;
    vignettePlate = null;
    flatPlate = null;
    flatFor = null;
    washGradient = null;
    scene = options.getScene();
    // Setting width/height clears the bitmap. Paint now — waiting for the next
    // rAF (or skipping it on the half-rate budget) leaves a dark empty frame.
    renderScene(reduced || lastDrawn < 0 ? 2.4 : lastDrawn * AMBIENT_TIME_SCALE);
    if (!reduced && !frameId) frameId = requestAnimationFrame(frame);
  }

  const onPointerMove = (event: PointerEvent) => {
    // Parallax follows a hovering cursor. A touch pointer only reports where a
    // finger already landed, so on a phone it buys nothing and costs a full
    // re-composite of the scene every time you tap a card.
    if (reduced || coarseQuery.matches) return;
    mx = event.clientX / Math.max(W, 1) - 0.5;
    my = event.clientY / Math.max(H, 1) - 0.5;
  };

  const onResize = () => {
    window.clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(resize, 120);
  };

  window.addEventListener('pointermove', onPointerMove, { passive: true });
  window.addEventListener('resize', onResize);
  const ro = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(onResize);
  ro?.observe(canvas);

  buildTextures();
  buildSprites();

  const boot = () => {
    resize();
    if (!reduced) frameId = requestAnimationFrame(frame);
  };
  if (document.fonts && document.fonts.ready) void document.fonts.ready.then(boot);
  else boot();

  return () => {
    cancelAnimationFrame(frameId);
    frameId = 0;
    window.clearTimeout(resizeTimer);
    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('resize', onResize);
    ro?.disconnect();
  };
}
