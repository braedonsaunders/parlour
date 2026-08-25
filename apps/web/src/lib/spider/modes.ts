import { applyPreset } from '@parlour/engine';
import { dailySeed, spiderConfig, type SpiderRules } from '@parlour/game-spider';

export type SpiderModeId = 'daily' | 'relaxed' | 'classic' | 'hard';

export interface SpiderModeDef {
  id: SpiderModeId;
  name: string;
  tagline: string;
  description: string;
  facts: readonly string[];
  accent: string;
  shade: string;
}

export const SPIDER_MODES: readonly SpiderModeDef[] = [
  {
    id: 'daily',
    name: 'Daily',
    tagline: 'One table for everyone',
    description:
      'The same UTC-dated two-suit deal for every player. Replay it without changing the table.',
    facts: ['two suits', 'same daily deal', 'five stock rows'],
    accent: '#e2b049',
    shade: '#8a6a1c',
  },
  {
    id: 'relaxed',
    name: 'Relaxed',
    tagline: 'All spades',
    description: 'A gentler fresh table: every card is a spade, so packed runs assemble freely.',
    facts: ['one suit', 'fresh deal', 'five stock rows'],
    accent: '#4ba1ba',
    shade: '#25586e',
  },
  {
    id: 'classic',
    name: 'Classic',
    tagline: 'Two suits',
    description: 'A fresh seeded table painted in spades and hearts — the Microsoft default.',
    facts: ['two suits', 'fresh deal', 'five stock rows'],
    accent: '#6b4c8a',
    shade: '#2d1f3d',
  },
  {
    id: 'hard',
    name: 'Hard',
    tagline: 'Four suits',
    description:
      'The full two-deck deal. Packed same-suit runs are scarce and every peel is earned.',
    facts: ['four suits', 'fresh deal', 'five stock rows'],
    accent: '#8a3a4a',
    shade: '#3d1a22',
  },
] as const;

const BY_ID = new Map(SPIDER_MODES.map((mode) => [mode.id, mode]));

export function getSpiderMode(id: SpiderModeId): SpiderModeDef {
  const mode = BY_ID.get(id);
  if (!mode) throw new Error(`unknown spider mode id: ${id}`);
  return mode;
}

export function isSpiderModeId(value: unknown): value is SpiderModeId {
  return typeof value === 'string' && BY_ID.has(value as SpiderModeId);
}

export function rulesForSpiderMode(mode: SpiderModeId): SpiderRules {
  const preset = mode === 'relaxed' ? 'relaxed' : mode === 'hard' ? 'hard' : 'classic';
  return applyPreset(spiderConfig, preset);
}

/** UTC keeps the daily table identical across locales and DST boundaries. */
export function utcDailyKey(now: Date): string {
  return now.toISOString().slice(0, 10);
}

export interface SpiderRun {
  id: string;
  mode: SpiderModeId;
  seed: number;
  dailyKey: string | null;
}

export function makeSpiderRun(
  mode: SpiderModeId,
  options: { now?: Date; randomSeed?: number; id?: string } = {},
): SpiderRun {
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
