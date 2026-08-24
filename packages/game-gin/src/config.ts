import { defineConfig } from '@parlour/engine';
import type { RuleValues } from '@parlour/engine';

/**
 * Gin Rummy house rules. Only knobs the engine actually enforces live here —
 * every field is load-bearing in play (spec §4.1: room settings UI is
 * generated from this schema).
 */
export interface GinConfig extends RuleValues {
  /** maximum deadwood a knocker may hold (classic 10) */
  knockCap: number;
  /** bonus for going gin — zero deadwood on the normal ten cards */
  ginBonus: number;
  /** big gin allowed at all (eleventh card melding completely) */
  bigGin: boolean;
  /** bonus for big gin */
  bigGinBonus: number;
  /** match ends when a seat crosses this many points */
  matchTarget: number;
  /** +25 per hand won, settled into the final total (the "line/box" bonus) */
  boxBonus: boolean;
}

export const BOX_BONUS_POINTS = 25;
export const UNDERCUT_BONUS_POINTS = 25;

export const DEFAULT_KNOCK_CAP = 10;
export const DEFAULT_GIN_BONUS = 25;
export const DEFAULT_BIG_GIN_BONUS = 31;
export const DEFAULT_MATCH_TARGET = 100;

export const ginConfigSchema = defineConfig<GinConfig>(
  [
    {
      key: 'knockCap',
      kind: 'int',
      label: 'Knock cap',
      help: 'Highest deadwood you can knock with',
      group: 'Table',
      min: 5,
      max: 15,
      default: DEFAULT_KNOCK_CAP,
    },
    {
      key: 'matchTarget',
      kind: 'int',
      label: 'Match to',
      help: 'First seat past this many points wins the match',
      group: 'Table',
      min: 50,
      max: 300,
      default: DEFAULT_MATCH_TARGET,
    },
    {
      key: 'ginBonus',
      kind: 'int',
      label: 'Gin bonus',
      group: 'Bonuses',
      advanced: true,
      min: 10,
      max: 40,
      default: DEFAULT_GIN_BONUS,
    },
    {
      key: 'bigGin',
      kind: 'toggle',
      label: 'Big gin',
      help: 'Draw an eleventh card that melds completely',
      group: 'Bonuses',
      advanced: true,
      default: true,
    },
    {
      key: 'bigGinBonus',
      kind: 'int',
      label: 'Big gin bonus',
      group: 'Bonuses',
      advanced: true,
      min: 20,
      max: 50,
      default: DEFAULT_BIG_GIN_BONUS,
    },
    {
      key: 'boxBonus',
      kind: 'toggle',
      label: 'Box bonus',
      help: '+25 per hand won, added to the final total',
      group: 'Bonuses',
      advanced: true,
      default: false,
    },
  ],
  [
    { id: 'classic', label: 'Classic', values: {} },
    { id: 'quick', label: 'Quick Game', values: { matchTarget: 50 } },
    {
      id: 'purist',
      label: 'Purist',
      values: { bigGin: false, boxBonus: false },
    },
  ],
);
