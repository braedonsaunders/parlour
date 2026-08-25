import { applyPreset } from '@parlour/engine';
import { dailySeed, golfConfig, type GolfRules } from '@parlour/game-golf';

export type GolfModeId = 'daily' | 'classic' | 'fairway';

export interface GolfModeDef {
  id: GolfModeId;
  name: string;
  tagline: string;
  description: string;
  facts: readonly string[];
  accent: string;
  shade: string;
}

export const GOLF_MODES: readonly GolfModeDef[] = [
  {
    id: 'daily',
    name: 'Daily',
    tagline: 'One hole for everyone',
    description:
      'The same UTC-dated Classic hole for every player. Replay it without changing the table.',
    facts: ['no wrap', 'same daily deal', 'lower score wins'],
    accent: '#e2b049',
    shade: '#8a6a1c',
  },
  {
    id: 'classic',
    name: 'Classic',
    tagline: 'Ace and King stop you',
    description: 'A fresh seeded hole. Ace and King are dead ends; the stock never comes back.',
    facts: ['no wrap', 'fresh deal', 'no recycle'],
    accent: '#3f7d62',
    shade: '#1f4b3a',
  },
  {
    id: 'fairway',
    name: 'Fairway',
    tagline: 'Ace wraps King',
    description: 'The same fast hole, but Ace and King play onto each other so chains run longer.',
    facts: ['wraps A–K', 'fresh deal', 'no recycle'],
    accent: '#4ba1ba',
    shade: '#25586e',
  },
] as const;

const BY_ID = new Map(GOLF_MODES.map((mode) => [mode.id, mode]));

export function getGolfMode(id: GolfModeId): GolfModeDef {
  const mode = BY_ID.get(id);
  if (!mode) throw new Error(`unknown golf mode id: ${id}`);
  return mode;
}

export function isGolfModeId(value: unknown): value is GolfModeId {
  return typeof value === 'string' && BY_ID.has(value as GolfModeId);
}

export function rulesForGolfMode(mode: GolfModeId): GolfRules {
  return applyPreset(golfConfig, mode === 'fairway' ? 'fairway' : 'classic');
}

/** UTC keeps the daily hole identical across locales and DST boundaries. */
export function utcDailyKey(now: Date): string {
  return now.toISOString().slice(0, 10);
}

export interface GolfRun {
  id: string;
  mode: GolfModeId;
  seed: number;
  dailyKey: string | null;
}

export function makeGolfRun(
  mode: GolfModeId,
  options: { now?: Date; randomSeed?: number; id?: string } = {},
): GolfRun {
  const dailyKey = mode === 'daily' ? utcDailyKey(options.now ?? new Date()) : null;
  const randomSeed = options.randomSeed ?? randomInt32();
  return {
    id: options.id ?? randomRunId(),
    mode,
    seed: dailyKey ? dailySeed(dailyKey) : randomSeed | 0,
    dailyKey,
  };
}

function randomInt32(): number {
  const value = new Int32Array(1);
  globalThis.crypto.getRandomValues(value);
  return value[0] ?? 1;
}

function randomRunId(): string {
  return globalThis.crypto.randomUUID();
}
