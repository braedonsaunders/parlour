import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export const TABLE_FX_STORAGE_KEY = 'parlour.tablefx.v1';

export const DROP_EFFECT_LEVELS = ['off', 'subtle', 'full'] as const;

export type DropEffectLevel = (typeof DROP_EFFECT_LEVELS)[number];

export const DROP_EFFECT_LABELS: Record<DropEffectLevel, string> = {
  off: 'Off',
  subtle: 'Subtle',
  full: 'Full',
};

export const DEFAULT_DROP_EFFECTS: DropEffectLevel = 'full';

export function isDropEffectLevel(value: unknown): value is DropEffectLevel {
  return typeof value === 'string' && (DROP_EFFECT_LEVELS as readonly string[]).includes(value);
}

/** Multiplier applied to every burst's intensity at the chosen level. */
export function dropEffectScale(level: DropEffectLevel): number {
  return level === 'off' ? 0 : level === 'subtle' ? 0.5 : 1;
}

type TableFxState = {
  dropEffects: DropEffectLevel;
  setDropEffects: (level: DropEffectLevel) => void;
};

/**
 * Per-client table presentation. Card-drop flourishes are a look, not a rule,
 * so they live beside the scene picker rather than in the game's config schema.
 */
export const useTableFxStore = create<TableFxState>()(
  persist(
    (set) => ({
      dropEffects: DEFAULT_DROP_EFFECTS,
      setDropEffects: (dropEffects) => set({ dropEffects }),
    }),
    {
      name: TABLE_FX_STORAGE_KEY,
      version: 1,
      migrate: (persisted) => {
        const state = persisted as Partial<TableFxState> | undefined;
        return {
          dropEffects: isDropEffectLevel(state?.dropEffects)
            ? state.dropEffects
            : DEFAULT_DROP_EFFECTS,
        };
      },
      partialize: (state) => ({ dropEffects: state.dropEffects }),
    },
  ),
);
