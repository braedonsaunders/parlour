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
  /** Fixed. Read by the styling layer; there is no setter and no picker. */
  appColorMode: AppColorMode;
  setDropEffects: (level: DropEffectLevel) => void;
};

/**
 * Per-client presentation. Card-drop flourishes are a look, not a rule, so they
 * live beside the scene picker rather than in game config.
 *
 * The app palette used to be a choice here too. It is now fixed: one palette,
 * chosen deliberately, applied everywhere. `appColorMode` stays in the store
 * because the styling layer reads it, but nothing sets it.
 */
export const useTableFxStore = create<TableFxState>()(
  persist(
    (set) => ({
      dropEffects: DEFAULT_DROP_EFFECTS,
      appColorMode: DEFAULT_APP_COLOR_MODE,
      setDropEffects: (dropEffects) => set({ dropEffects }),
    }),
    {
      name: TABLE_FX_STORAGE_KEY,
      version: 5,
      migrate: (persisted) => {
        const state = persisted as Partial<TableFxState> | undefined;
        return {
          dropEffects: isDropEffectLevel(state?.dropEffects)
            ? state.dropEffects
            : DEFAULT_DROP_EFFECTS,
          // The palette is no longer a choice, so a client that saved the older
          // one is moved onto the current look rather than kept on a setting
          // nothing can change any more. That is the whole reason for the
          // version bump.
          appColorMode: DEFAULT_APP_COLOR_MODE,
        };
      },
      // `appColorMode` is deliberately not persisted: it is fixed, so writing it
      // would only create a value a future change has to migrate again.
      partialize: (state) => ({ dropEffects: state.dropEffects }),
    },
  ),
);
