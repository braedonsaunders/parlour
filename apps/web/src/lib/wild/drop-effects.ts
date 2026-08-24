import { wildpileFace } from '@parlour/game-wildpile';
import { registerDropEffectPack, type DropEffectPack } from '@/lib/table/drop-effects';

/** The deck's four colors, matched to the card faces. */
const COLOR: Record<string, string> = {
  red: '#e0685c',
  yellow: '#f2c45c',
  green: '#6cbb87',
  blue: '#58acc7',
};

const WILD_TINT = '#f0e2ff';

/**
 * Wild's card-drop pack. Every action card lands with its own flourish so the
 * pile reads at a glance: a reverse spins, a skip cuts, a draw card throws
 * sparks, and the wilds open into the deck's four colors.
 */
export const WILD_DROP_EFFECTS: DropEffectPack = {
  id: 'wildpile',
  label: 'Wild Pile',
  effectFor(card) {
    const face = wildpileFace(card);
    const tint = face.color ? (COLOR[face.color] ?? WILD_TINT) : WILD_TINT;

    switch (face.meta.kind) {
      case 'reverse':
        return { shape: 'swirl', color: tint, intensity: 0.75, glyph: '↻' };
      case 'skip':
        return { shape: 'slash', color: tint, intensity: 0.75, glyph: '⊘' };
      case 'draw-two':
        return { shape: 'sparks', color: tint, intensity: 0.85, glyph: '+2' };
      case 'discard-all':
        return { shape: 'shockwave', color: tint, intensity: 1, glyph: 'ALL' };
      case 'wild-draw-four':
        return { shape: 'sparks', color: WILD_TINT, intensity: 1, glyph: '+4' };
      case 'wild':
        return { shape: 'prism', color: WILD_TINT, intensity: 0.9 };
      case 'wild-swap':
        return { shape: 'trade', color: WILD_TINT, intensity: 0.9, glyph: '⇄' };
      case 'wild-shuffle':
        return { shape: 'prism', color: WILD_TINT, intensity: 1, glyph: '↻↻' };
      case 'number':
        // Zeroes and sevens carry weight under the 7-0 rule, so they land harder.
        return face.meta.value === 0 || face.meta.value === 7
          ? { shape: 'shockwave', color: tint, intensity: 0.55 }
          : { shape: 'ripple', color: tint, intensity: 0.35 };
      default:
        return null;
    }
  },
};

registerDropEffectPack(WILD_DROP_EFFECTS);
