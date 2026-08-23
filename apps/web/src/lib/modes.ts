export type ModeId = 'classic' | 'fast' | 'timed';

export type PreviewKind = 'lives' | 'snap' | 'clock';

export interface ModeDef {
  id: ModeId;
  name: string;
  tagline: string;
  description: string;
  /** Short param lines shown on the tile — mirrors the spec §5.3 star defaults. */
  facts: readonly string[];
  accent: string;
  shade: string;
  preview: PreviewKind;
}

/**
 * The three first-class match formats (spec §5.3 / §6.2). Rule values live in
 * @parlour/game-blitz's config schema; this catalog is presentation only.
 */
export const MODES: readonly ModeDef[] = [
  {
    id: 'classic',
    name: 'Classic',
    tagline: 'Lives on the line',
    description:
      'Lose a round, lose a life. Knock early or chase the perfect 31 — last player with chips takes the match.',
    facts: ['3 lives each', 'last one standing', '~5–10 min'],
    accent: '#e29349',
    shade: '#96471c',
    preview: 'lives',
  },
  {
    id: 'fast',
    name: 'Fast',
    tagline: 'One round at a time',
    description:
      'Self-contained rounds, instant redeal. Highest hand wins the pot — first to three wins the match.',
    facts: ['first to 3 wins', 'no eliminations', '~2–4 min'],
    accent: '#5fae7b',
    shade: '#2f6b48',
    preview: 'snap',
  },
  {
    id: 'timed',
    name: 'Timed',
    tagline: 'Race the buzzer',
    description:
      'A three-minute match clock and quick-draw turn timers. Most round wins when the bell rings takes it.',
    facts: ['3:00 match clock', '7 s turn timer', 'sudden-death ties'],
    accent: '#4ba1ba',
    shade: '#25586e',
    preview: 'clock',
  },
];

const BY_ID = new Map(MODES.map((mode) => [mode.id, mode]));

export function getMode(id: ModeId): ModeDef {
  const mode = BY_ID.get(id);
  if (!mode) throw new Error(`unknown mode id: ${id}`);
  return mode;
}

export function isModeId(value: unknown): value is ModeId {
  return typeof value === 'string' && BY_ID.has(value as ModeId);
}
