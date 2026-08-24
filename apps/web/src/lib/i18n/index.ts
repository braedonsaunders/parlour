'use client';

import { useMemo } from 'react';
import { useLocaleStore } from '@/stores/locale';
import { DEFAULT_LOCALE, LOCALE_META, type Locale } from './locales';
import { en, type MessageKey, type Messages, type PluralKey } from './messages/en';
import { es } from './messages/es';

export type { Locale } from './locales';
export { LOCALES, LOCALE_META, DEFAULT_LOCALE, isLocale, preferredLocale } from './locales';
export type { MessageKey, Messages, PluralKey } from './messages/en';

/**
 * Every catalogue, loaded eagerly.
 *
 * Lazy-loading a locale would mean the first paint after a language change is
 * untranslated, and parlour ships as a static export that must work offline —
 * a language the service worker has not cached is a language that fails on a
 * plane. The catalogues are a few kilobytes of strings each; the whole set
 * costs less than one card texture.
 */
const CATALOGUES: Readonly<Record<Locale, Messages>> = { en, es };

const PLACEHOLDER = /\{(\w+)\}/g;

export type MessageValues = Readonly<Record<string, string | number>>;

/**
 * Substitutes `{name}` placeholders.
 *
 * An unmatched placeholder is left as written rather than blanked: a visible
 * `{count}` in a screenshot is a bug report, an empty gap is a mystery.
 */
export function interpolate(template: string, values?: MessageValues): string {
  if (!values) return template;
  return template.replace(PLACEHOLDER, (whole, name: string) => {
    const value = values[name];
    return value === undefined ? whole : String(value);
  });
}

/**
 * Splits a message around its `{name}` placeholders so a caller can put React
 * nodes in them.
 *
 * Some sentences need a word emphasised mid-clause — "Tap **Add** or
 * **Install**." — and slicing the English by hand puts the word order in the
 * component instead of the catalogue, which is exactly what a translator needs
 * to be able to change. This keeps the whole sentence in the message and lets
 * the component decide only how each named piece is *drawn*.
 */
export function interpolateParts<T>(
  template: string,
  parts: Readonly<Record<string, T>>,
): (string | T)[] {
  const out: (string | T)[] = [];
  let cursor = 0;
  for (const match of template.matchAll(PLACEHOLDER)) {
    const name = match[1] as string;
    if (!(name in parts)) continue;
    if (match.index > cursor) out.push(template.slice(cursor, match.index));
    out.push(parts[name] as T);
    cursor = match.index + match[0].length;
  }
  if (cursor < template.length) out.push(template.slice(cursor));
  return out;
}

export interface Translator {
  (key: MessageKey, values?: MessageValues): string;
  /**
   * A message that varies with a count. Looks up `${key}_one` / `${key}_other`
   * through the locale's own plural rules, and passes `count` through as a
   * placeholder so the message can read "{count} sillas" without the call site
   * knowing where the number goes.
   */
  count(key: PluralKey, count: number, values?: MessageValues): string;
  locale: Locale;
}

/**
 * Builds a translator for a locale. Exported for tests and for the few places
 * that need to translate outside a React render.
 */
export function translatorFor(locale: Locale): Translator {
  const catalogue = CATALOGUES[locale] ?? CATALOGUES[DEFAULT_LOCALE];
  const fallback = CATALOGUES[DEFAULT_LOCALE];
  const plurals = new Intl.PluralRules(LOCALE_META[locale]?.tag ?? 'en');

  const lookup = (key: string): string =>
    (catalogue as Record<string, string>)[key] ??
    (fallback as Record<string, string>)[key] ??
    // A key that exists in neither catalogue cannot happen through the typed
    // API, so surfacing it verbatim is the most useful thing to render.
    key;

  const translate = ((key: MessageKey, values?: MessageValues) =>
    interpolate(lookup(key), values)) as Translator;

  translate.count = (key: PluralKey, count: number, values?: MessageValues) => {
    const category = plurals.select(count);
    const exact = `${key}_${category}`;
    const template =
      (catalogue as Record<string, string>)[exact] ??
      (catalogue as Record<string, string>)[`${key}_other`] ??
      lookup(key);
    return interpolate(template, { count, ...values });
  };

  translate.locale = locale;
  return translate;
}

/**
 * The translator for the player's chosen language.
 *
 * Memoised on the locale, so a table re-rendering sixty times a second is not
 * rebuilding an `Intl.PluralRules` each frame.
 */
export function useT(): Translator {
  const locale = useLocaleStore((state) => state.locale);
  return useMemo(() => translatorFor(locale), [locale]);
}

/** The current locale and a setter, for the language pickers. */
export function useLocale(): {
  locale: Locale;
  setLocale: (locale: Locale) => void;
} {
  const locale = useLocaleStore((state) => state.locale);
  const setLocale = useLocaleStore((state) => state.setLocale);
  return { locale, setLocale };
}
