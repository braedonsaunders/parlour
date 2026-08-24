import { describe, expect, it } from 'vitest';
import { interpolate, interpolateParts, translatorFor } from './index';
import { LOCALES, LOCALE_META, preferredLocale, isLocale } from './locales';
import { en } from './messages/en';
import { es } from './messages/es';

const CATALOGUES = { en, es } as const;
const PLACEHOLDER = /\{(\w+)\}/g;

function placeholdersOf(template: string): string[] {
  return [...template.matchAll(PLACEHOLDER)].map((match) => match[1] as string).sort();
}

describe('catalogue completeness', () => {
  // The type system already refuses an incomplete locale. This is the runtime
  // half of the same promise: a key present but left as the English string is
  // something the compiler cannot see and a player very much can.
  it.each(LOCALES)('%s has every key English has', (locale) => {
    const catalogue = CATALOGUES[locale] as Record<string, string>;
    const missing = Object.keys(en).filter((key) => !(key in catalogue));
    expect(missing).toEqual([]);
  });

  it.each(LOCALES)('%s has no keys English does not', (locale) => {
    const catalogue = CATALOGUES[locale] as Record<string, string>;
    const extra = Object.keys(catalogue).filter((key) => !(key in en));
    expect(extra).toEqual([]);
  });

  it.each(LOCALES)('%s has no empty messages', (locale) => {
    const catalogue = CATALOGUES[locale] as Record<string, string>;
    const blank = Object.entries(catalogue)
      .filter(([, value]) => value.trim().length === 0)
      .map(([key]) => key);
    expect(blank).toEqual([]);
  });

  /**
   * A translation that drops `{code}` renders a sentence with a hole in it, and
   * one that invents `{name}` renders the braces verbatim. Neither is a type
   * error, so both are checked here.
   */
  it.each(LOCALES.filter((locale) => locale !== 'en'))(
    '%s uses exactly the placeholders English does',
    (locale) => {
      const catalogue = CATALOGUES[locale] as Record<string, string>;
      const mismatched = Object.entries(en)
        .filter(([key, english]) => {
          const translated = catalogue[key] ?? '';
          return placeholdersOf(english).join() !== placeholdersOf(translated).join();
        })
        .map(([key]) => key);
      expect(mismatched).toEqual([]);
    },
  );

  it('gives every plural key both an _one and an _other form in every locale', () => {
    const pluralBases = new Set(
      Object.keys(en)
        .filter((key) => key.endsWith('_other'))
        .map((key) => key.slice(0, -'_other'.length)),
    );
    expect(pluralBases.size).toBeGreaterThan(0);
    for (const locale of LOCALES) {
      const catalogue = CATALOGUES[locale] as Record<string, string>;
      for (const base of pluralBases) {
        expect(catalogue[`${base}_one`], `${locale}:${base}_one`).toBeTruthy();
        expect(catalogue[`${base}_other`], `${locale}:${base}_other`).toBeTruthy();
      }
    }
  });

  it('lists metadata for every locale it offers', () => {
    for (const locale of LOCALES) {
      const meta = LOCALE_META[locale];
      expect(meta.id).toBe(locale);
      expect(meta.nativeName.length).toBeGreaterThan(0);
      expect(meta.short).toMatch(/^[A-Z]{2}$/);
    }
  });
});

describe('interpolate', () => {
  it('substitutes named placeholders', () => {
    expect(interpolate('Room code, {entered} of {total} entered', { entered: 2, total: 4 })).toBe(
      'Room code, 2 of 4 entered',
    );
  });

  it('leaves an unknown placeholder visible rather than blanking it', () => {
    expect(interpolate('Table {code}', {})).toBe('Table {code}');
  });

  it('returns the template untouched when there is nothing to fill', () => {
    expect(interpolate('Play')).toBe('Play');
  });
});

describe('interpolateParts', () => {
  it('splits a sentence around its placeholders in message order', () => {
    expect(interpolateParts('Tap {add} or {install}.', { add: 1, install: 2 })).toEqual([
      'Tap ',
      1,
      ' or ',
      2,
      '.',
    ]);
  });

  it('honours a translation that reorders the placeholders', () => {
    expect(interpolateParts('{install} o {add}.', { add: 1, install: 2 })).toEqual([
      2,
      ' o ',
      1,
      '.',
    ]);
  });
});

describe('translatorFor', () => {
  it('reads the requested locale', () => {
    expect(translatorFor('es')('home.play')).toBe('Jugar');
    expect(translatorFor('en')('home.play')).toBe('Play');
  });

  it('picks the plural form the locale asks for', () => {
    const t = translatorFor('es');
    expect(t.count('setup.seatCount', 1)).toBe('1 silla');
    expect(t.count('setup.seatCount', 4)).toBe('4 sillas');
    expect(t.count('setup.seatCount', 0)).toBe('0 sillas');
  });

  it('falls back to English for a locale it does not carry', () => {
    // Not reachable through the typed API; this is the guard for a persisted
    // locale from a build that offered a language this one no longer does.
    const t = translatorFor('de' as never);
    expect(t('home.play')).toBe('Play');
  });
});

describe('preferredLocale', () => {
  it('matches on the primary subtag so regional Spanish still lands on Spanish', () => {
    expect(preferredLocale(['es-419'])).toBe('es');
    expect(preferredLocale(['es-MX', 'en-US'])).toBe('es');
  });

  it('takes the first language it actually offers', () => {
    expect(preferredLocale(['de', 'fr', 'es'])).toBe('es');
  });

  it('falls back when nothing matches', () => {
    expect(preferredLocale(['de', 'fr'])).toBe('en');
    expect(preferredLocale(undefined)).toBe('en');
  });
});

describe('isLocale', () => {
  it('accepts what the app offers and nothing else', () => {
    expect(isLocale('es')).toBe(true);
    expect(isLocale('de')).toBe(false);
    expect(isLocale(null)).toBe(false);
  });
});
