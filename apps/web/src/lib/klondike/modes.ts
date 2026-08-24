import { applyPreset } from '@parlour/engine';
import { dailySeed, klondikeConfig, type KlondikeRules } from '@parlour/game-klondike';

export type KlondikeModeId = 'daily' | 'classic' | 'relaxed';

export interface KlondikeModeDef {
  id: KlondikeModeId;
  name: string;
  tagline: string;
  description: string;
  facts: readonly string[];
  accent: string;
  shade: string;
}

export const KLONDIKE_MODES: readonly KlondikeModeDef[] = [
  {
    id: 'daily',
    name: 'Daily',
    tagline: 'One table for everyone',
    description:
      'The same UTC-dated Draw Three deal for every player. Replay it without changing the table.',
    facts: ['draw three', 'same daily deal', 'unlimited passes'],
    accent: '#e2b049',
    shade: '#8a6a1c',
  },
  {
    id: 'classic',
    name: 'Classic',
    tagline: 'Turn three',
    description: 'A fresh seeded table with three cards turned from the stock at a time.',
    facts: ['draw three', 'fresh deal', 'unlimited passes'],
    accent: '#3f7d62',
    shade: '#1f4b3a',
  },
  {
    id: 'relaxed',
    name: 'Relaxed',
    tagline: 'Turn one',
    description: 'A gentler fresh table: every stock card arrives one at a time.',
    facts: ['draw one', 'fresh deal', 'unlimited passes'],
    accent: '#4ba1ba',
    shade: '#25586e',
  },
] as const;

const BY_ID = new Map(KLONDIKE_MODES.map((mode) => [mode.id, mode]));

export function getKlondikeMode(id: KlondikeModeId): KlondikeModeDef {
  const mode = BY_ID.get(id);
  if (!mode) throw new Error(`unknown klondike mode id: ${id}`);
  return mode;
}

export function isKlondikeModeId(value: unknown): value is KlondikeModeId {
  return typeof value === 'string' && BY_ID.has(value as KlondikeModeId);
}

export function rulesForKlondikeMode(mode: KlondikeModeId): KlondikeRules {
  return applyPreset(klondikeConfig, mode === 'relaxed' ? 'relaxed' : 'classic');
}

/** UTC keeps the daily table identical across locales and DST boundaries. */
export function utcDailyKey(now: Date): string {
  return now.toISOString().slice(0, 10);
}

export interface KlondikeRun {
  id: string;
  mode: KlondikeModeId;
  seed: number;
  dailyKey: string | null;
}

export function makeKlondikeRun(
  mode: KlondikeModeId,
  options: { now?: Date; randomSeed?: number; id?: string } = {},
): KlondikeRun {
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
