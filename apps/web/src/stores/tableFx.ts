import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export const TABLE_FX_STORAGE_KEY = 'parlour.tablefx.v1';

export const DROP_EFFECT_LEVELS = ['off', 'subtle', 'full'] as const;
export const APP_COLOR_MODES = ['richer', 'original'] as const;

export type DropEffectLevel = (typeof DROP_EFFECT_LEVELS)[number];
export type AppColorMode = (typeof APP_COLOR_MODES)[number];

export const DROP_EFFECT_LABELS: Record<DropEffectLevel, string> = {
  off: 'Off',
  subtle: 'Subtle',
  full: 'Full',
};

export const DEFAULT_DROP_EFFECTS: DropEffectLevel = 'full';
export const DEFAULT_APP_COLOR_MODE: AppColorMode = 'richer';

export const APP_COLOR_LABELS: Record<AppColorMode, string> = {
  richer: 'Richer',
  original: 'Original',
};

export function isDropEffectLevel(value: unknown): value is DropEffectLevel {
  return typeof value === 'string' && (DROP_EFFECT_LEVELS as readonly string[]).includes(value);
}

export function isAppColorMode(value: unknown): value is AppColorMode {
  return typeof value === 'string' && (APP_COLOR_MODES as readonly string[]).includes(value);
}

/** Multiplier applied to every burst's intensity at the chosen level. */
export function dropEffectScale(level: DropEffectLevel): number {
  return level === 'off' ? 0 : level === 'subtle' ? 0.5 : 1;
}

type TableFxState = {
  dropEffects: DropEffectLevel;
  appColorMode: AppColorMode;
  setDropEffects: (level: DropEffectLevel) => void;
  setAppColorMode: (mode: AppColorMode) => void;
};

/**
 * Per-client presentation. App colors and card-drop flourishes are looks, not
 * rules, so they live beside the scene picker rather than in game config.
 */
export const useTableFxStore = create<TableFxState>()(
  persist(
    (set) => ({
      dropEffects: DEFAULT_DROP_EFFECTS,
      appColorMode: DEFAULT_APP_COLOR_MODE,
      setDropEffects: (dropEffects) => set({ dropEffects }),
      setAppColorMode: (appColorMode) => set({ appColorMode }),
    }),
    {
      name: TABLE_FX_STORAGE_KEY,
      version: 4,
      migrate: (persisted, version) => {
        const state = persisted as
          (Partial<TableFxState> & { cardColorMode?: unknown }) | undefined;
        const persistedColorMode =
          version < 4 ? DEFAULT_APP_COLOR_MODE : (state?.appColorMode ?? state?.cardColorMode);
        return {
          dropEffects: isDropEffectLevel(state?.dropEffects)
            ? state.dropEffects
            : DEFAULT_DROP_EFFECTS,
          appColorMode: isAppColorMode(persistedColorMode)
            ? persistedColorMode
            : DEFAULT_APP_COLOR_MODE,
        };
      },
      partialize: (state) => ({
        dropEffects: state.dropEffects,
        appColorMode: state.appColorMode,
      }),
    },
  ),
);
