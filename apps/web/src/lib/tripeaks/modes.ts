import { applyPreset } from '@parlour/engine';
import { dailySeed, tripeaksConfig, type TripeaksRules } from '@parlour/game-tripeaks';

export type TripeaksModeId = 'daily' | 'classic' | 'relaxed';

export interface TripeaksModeDef {
  id: TripeaksModeId;
  name: string;
  tagline: string;
  description: string;
  facts: readonly string[];
  accent: string;
  shade: string;
}

export const TRIPEAKS_MODES: readonly TripeaksModeDef[] = [
  {
    id: 'daily',
    name: 'Daily',
    tagline: 'One deal for everyone',
    description:
      'The same UTC-dated Classic deal for every player. Replay it without changing the table.',
    facts: ['no wrap', 'same daily deal', 'lower leftover wins'],
    accent: '#e2b049',
    shade: '#8a6a1c',
  },
  {
    id: 'classic',
    name: 'Classic',
    tagline: 'Ace and King stop you',
    description: 'A fresh seeded deal. Ace and King are dead ends; the stock never comes back.',
    facts: ['no wrap', 'fresh deal', 'no recycle'],
    accent: '#4ba1ba',
    shade: '#25586e',
  },
  {
    id: 'relaxed',
    name: 'Relaxed',
    tagline: 'Ace wraps King',
    description:
      'The same three peaks, but Ace and King play onto each other and the hole may be recycled once.',
    facts: ['wraps A–K', 'fresh deal', 'one recycle'],
    accent: '#3f7d62',
    shade: '#1f4b3a',
  },
] as const;

const BY_ID = new Map(TRIPEAKS_MODES.map((mode) => [mode.id, mode]));

export function getTripeaksMode(id: TripeaksModeId): TripeaksModeDef {
  const mode = BY_ID.get(id);
  if (!mode) throw new Error(`unknown tripeaks mode id: ${id}`);
  return mode;
}

export function isTripeaksModeId(value: unknown): value is TripeaksModeId {
  return typeof value === 'string' && BY_ID.has(value as TripeaksModeId);
}

export function rulesForTripeaksMode(mode: TripeaksModeId): TripeaksRules {
  return applyPreset(tripeaksConfig, mode === 'relaxed' ? 'relaxed' : 'classic');
}

/** UTC keeps the daily deal identical across locales and DST boundaries. */
export function utcDailyKey(now: Date): string {
  return now.toISOString().slice(0, 10);
}

export interface TripeaksRun {
  id: string;
  mode: TripeaksModeId;
  seed: number;
  dailyKey: string | null;
}

export function makeTripeaksRun(
  mode: TripeaksModeId,
  options: { now?: Date; randomSeed?: number; id?: string } = {},
): TripeaksRun {
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
