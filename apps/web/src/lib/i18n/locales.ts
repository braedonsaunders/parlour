/**
 * The languages parlour speaks.
 *
 * A locale is listed here only once its catalogue is *complete* — the message
 * type is derived from English, so a half-translated locale is a type error
 * rather than a table with English words scattered through it. That is the
 * whole reason the catalogue is typed the way it is: a card game read at a
 * glance cannot afford a settings panel that switches language halfway down.
 */

export const LOCALES = ['en', 'es', 'fr', 'pt', 'zh'] as const;

export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = 'en';

export interface LocaleMeta {
  id: Locale;
  /** The language's name in that language — what a speaker looks for. */
  nativeName: string;
  /** The language's name in English, for the accessible label. */
  englishName: string;
  /**
   * Short badge for the compact home-screen button. Latin languages use two
   * letters; a language whose readers do not read Latin uses its own script.
   */
  short: string;
  dir: 'ltr' | 'rtl';
  /**
   * BCP 47 tag for `Intl` and `<html lang>`. Kept separate from `id` so a
   * regional variant (pt-BR) can be added without renaming the catalogue.
   */
  tag: string;
}

export const LOCALE_META: Readonly<Record<Locale, LocaleMeta>> = {
  en: {
    id: 'en',
    nativeName: 'English',
    englishName: 'English',
    short: 'EN',
    dir: 'ltr',
    tag: 'en',
  },
  es: {
    id: 'es',
    nativeName: 'Español',
    englishName: 'Spanish',
    short: 'ES',
    dir: 'ltr',
    tag: 'es',
  },
  fr: {
    id: 'fr',
    nativeName: 'Français',
    englishName: 'French',
    short: 'FR',
    dir: 'ltr',
    tag: 'fr',
  },
  pt: {
    id: 'pt',
    nativeName: 'Português',
    englishName: 'Portuguese',
    short: 'PT',
    dir: 'ltr',
    // Brazilian, which is the larger audience and the variant the copy is
    // written in. A European-Portuguese split would be a separate locale
    // rather than a retune of this one.
    tag: 'pt-BR',
  },
  zh: {
    id: 'zh',
    nativeName: '简体中文',
    englishName: 'Simplified Chinese',
    // Two Han characters rather than a Latin abbreviation: the compact button
    // shows this, and "ZH" means nothing to the reader it is for.
    short: '中文',
    dir: 'ltr',
    tag: 'zh-Hans',
  },
};

export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (LOCALES as readonly string[]).includes(value);
}

/**
 * The best locale for a browser's language list.
 *
 * Matches on the primary subtag, so `es-419` and `es-MX` both land on Spanish
 * rather than falling back to English over a region code parlour does not
 * distinguish.
 */
export function preferredLocale(
  languages: readonly string[] | undefined,
  fallback: Locale = DEFAULT_LOCALE,
): Locale {
  for (const language of languages ?? []) {
    const primary = language.toLowerCase().split('-')[0];
    if (isLocale(primary)) return primary;
  }
  return fallback;
}
