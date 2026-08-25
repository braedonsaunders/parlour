import { applyPreset } from '@parlour/engine';
import { dailySeed, freecellConfig, type FreecellRules } from '@parlour/game-freecell';

export type FreecellModeId = 'daily' | 'classic' | 'relaxed';

export interface FreecellModeDef {
  id: FreecellModeId;
  name: string;
  tagline: string;
  description: string;
  facts: readonly string[];
  accent: string;
  shade: string;
}

export const FREECELL_MODES: readonly FreecellModeDef[] = [
  {
    id: 'daily',
    name: 'Daily',
    tagline: 'One table for everyone',
    description:
      'The same UTC-dated Classic deal for every player. Replay it without changing the table.',
    facts: ['four cells', 'same daily deal', 'any card to empty'],
    accent: '#e2b049',
    shade: '#8a6a1c',
  },
  {
    id: 'classic',
    name: 'Classic',
    tagline: 'Four free cells',
    description: 'A fresh seeded table with four one-card free cells.',
    facts: ['four cells', 'fresh deal', 'any card to empty'],
    accent: '#4ba1ba',
    shade: '#25586e',
  },
  {
    id: 'relaxed',
    name: 'Relaxed',
    tagline: 'Six free cells',
    description: 'A gentler fresh table: two extra cells make longer runs easier to move.',
    facts: ['six cells', 'fresh deal', 'any card to empty'],
    accent: '#3f7d62',
    shade: '#1f4b3a',
  },
] as const;

const BY_ID = new Map(FREECELL_MODES.map((mode) => [mode.id, mode]));

export function getFreecellMode(id: FreecellModeId): FreecellModeDef {
  const mode = BY_ID.get(id);
  if (!mode) throw new Error(`unknown freecell mode id: ${id}`);
  return mode;
}

export function isFreecellModeId(value: unknown): value is FreecellModeId {
  return typeof value === 'string' && BY_ID.has(value as FreecellModeId);
}

export function rulesForFreecellMode(mode: FreecellModeId): FreecellRules {
  return applyPreset(freecellConfig, mode === 'relaxed' ? 'relaxed' : 'classic');
}

/** UTC keeps the daily table identical across locales and DST boundaries. */
export function utcDailyKey(now: Date): string {
  return now.toISOString().slice(0, 10);
}

export interface FreecellRun {
  id: string;
  mode: FreecellModeId;
  seed: number;
  dailyKey: string | null;
}

export function makeFreecellRun(
  mode: FreecellModeId,
  options: { now?: Date; randomSeed?: number; id?: string } = {},
): FreecellRun {
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
