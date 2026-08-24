import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { DEFAULT_LOCALE, isLocale, preferredLocale, type Locale } from '@/lib/i18n/locales';

export const LOCALE_STORAGE_KEY = 'parlour.locale.v1';

type LocaleState = {
  locale: Locale;
  /**
   * False until the player has picked a language themselves. While it is false
   * the app follows the browser; once they choose, that choice sticks even if
   * they later open parlour on a device set to something else.
   */
  chosen: boolean;
  setLocale: (locale: Locale) => void;
  /** Adopts the browser's language, but never over an explicit choice. */
  adoptBrowserLocale: (languages: readonly string[] | undefined) => void;
};

export const useLocaleStore = create<LocaleState>()(
  persist(
    (set, get) => ({
      locale: DEFAULT_LOCALE,
      chosen: false,
      setLocale: (locale) => set({ locale, chosen: true }),
      adoptBrowserLocale: (languages) => {
        if (get().chosen) return;
        set({ locale: preferredLocale(languages, DEFAULT_LOCALE) });
      },
    }),
    {
      name: LOCALE_STORAGE_KEY,
      version: 1,
      migrate: (persisted) => {
        const state = persisted as Partial<LocaleState> | undefined;
        return {
          locale: isLocale(state?.locale) ? state.locale : DEFAULT_LOCALE,
          chosen: state?.chosen === true,
        };
      },
      partialize: (state) => ({ locale: state.locale, chosen: state.chosen }),
    },
  ),
);
