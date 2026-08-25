import { applyPreset } from '@parlour/engine';
import { dailySeed, pyramidConfig, type PyramidRules } from '@parlour/game-pyramid';

export type PyramidModeId = 'daily' | 'classic' | 'relaxed';

export interface PyramidModeDef {
  id: PyramidModeId;
  name: string;
  tagline: string;
  description: string;
  facts: readonly string[];
  accent: string;
  shade: string;
}

export const PYRAMID_MODES: readonly PyramidModeDef[] = [
  {
    id: 'daily',
    name: 'Daily',
    tagline: 'One pyramid for everyone',
    description:
      'The same UTC-dated Classic pyramid for every player. Replay it without changing the table.',
    facts: ['two recycles', 'same daily deal', 'lower leftover wins'],
    accent: '#e2b049',
    shade: '#8a6a1c',
  },
  {
    id: 'classic',
    name: 'Classic',
    tagline: 'Three passes',
    description:
      'A fresh seeded pyramid. The waste may be recycled twice — three trips through the stock.',
    facts: ['two recycles', 'fresh deal', 'three passes'],
    accent: '#b8593f',
    shade: '#6e2a1a',
  },
  {
    id: 'relaxed',
    name: 'Relaxed',
    tagline: 'Unlimited passes',
    description: 'The same pairing table, but the waste may be flipped back as often as you like.',
    facts: ['unlimited recycles', 'fresh deal', 'no pass limit'],
    accent: '#4ba1ba',
    shade: '#25586e',
  },
] as const;

const BY_ID = new Map(PYRAMID_MODES.map((mode) => [mode.id, mode]));

export function getPyramidMode(id: PyramidModeId): PyramidModeDef {
  const mode = BY_ID.get(id);
  if (!mode) throw new Error(`unknown pyramid mode id: ${id}`);
  return mode;
}

export function isPyramidModeId(value: unknown): value is PyramidModeId {
  return typeof value === 'string' && BY_ID.has(value as PyramidModeId);
}

export function rulesForPyramidMode(mode: PyramidModeId): PyramidRules {
  return applyPreset(pyramidConfig, mode === 'relaxed' ? 'relaxed' : 'classic');
}

/** UTC keeps the daily pyramid identical across locales and DST boundaries. */
export function utcDailyKey(now: Date): string {
  return now.toISOString().slice(0, 10);
}

export interface PyramidRun {
  id: string;
  mode: PyramidModeId;
  seed: number;
  dailyKey: string | null;
}

export function makePyramidRun(
  mode: PyramidModeId,
  options: { now?: Date; randomSeed?: number; id?: string } = {},
): PyramidRun {
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
