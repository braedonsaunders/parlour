import { describe, expect, it } from 'vitest';
import type { GameCatalogEntry } from '@parlour/engine';
import { GAMES } from '@/lib/games/shelf';
import { ES_GAMES } from './es';
import { localizeGame } from './localize';
import type { GameCopy } from './types';

/**
 * The overlay's completeness check.
 *
 * Game copy lives in the packs and is translated by an overlay keyed to it (see
 * `types.ts` for why). The cost of that choice is staleness: a pack can add a
 * section, a mode or a house rule and the overlay will keep translating the
 * shape it knew. Nothing in the type system can see that, because the overlay
 * is deliberately all-optional so a partial locale degrades gracefully at
 * runtime rather than failing to build.
 *
 * So the guarantee is enforced here instead: every string a pack shows a player
 * must have a translation, and every array must be the same length as the one
 * it replaces. A pack edit fails this test until the translation catches up.
 */

const LOCALES: readonly { id: string; book: Record<string, GameCopy> }[] = [
  { id: 'es', book: ES_GAMES as Record<string, GameCopy> },
];

/**
 * Strings that are the same word in both languages.
 *
 * Kept explicit rather than inferred: "Blitz" and "Scopa" are the games' own
 * names and "Poker" is spelled the same, but an *accidental* untranslated
 * sentence is a bug. Anything not listed here has to differ from the English.
 */
const SHARED_WORDS = new Set(
  [
    'Blitz',
    'Scopa',
    'Wild',
    'Klondike',
    'Cribbage',
    'Euchre',
    'Gin',
    'Oh Hell',
    'Spite & Malice',
    'Poker',
    'Casino',
    'Classic',
    'Nil',
    'Marathon',
  ].map((word) => word.toLowerCase()),
);

/** A string long enough that leaving it in English would be a visible bug. */
function isSentence(value: string): boolean {
  return value.trim().length > 24 && value.includes(' ');
}

function expectTranslated(where: string, english: string, translated: string | undefined): void {
  expect(translated, `${where} is missing a translation`).toBeTruthy();
  if (!translated) return;
  if (SHARED_WORDS.has(english.trim().toLowerCase())) return;
  if (!isSentence(english)) return;
  expect(translated, `${where} was left in English`).not.toBe(english);
}

function expectSameLength(
  where: string,
  english: readonly unknown[],
  translated: readonly unknown[] | undefined,
): void {
  expect(translated, `${where} is missing a translation`).toBeDefined();
  expect(
    translated?.length,
    `${where} has ${translated?.length} entries but English has ${english.length}`,
  ).toBe(english.length);
}

function checkGame(locale: string, entry: GameCatalogEntry, copy: GameCopy | undefined): void {
  const at = (part: string) => `${locale}/${entry.id}.${part}`;
  expect(copy, `${locale} has no copy for "${entry.id}"`).toBeDefined();
  if (!copy) return;

  expectTranslated(at('name'), entry.name, copy.name);
  expectTranslated(at('subtitle'), entry.subtitle, copy.subtitle);
  expectTranslated(at('tagline'), entry.tagline, copy.tagline);
  expectTranslated(at('description'), entry.description, copy.description);
  expectSameLength(at('facts'), entry.facts, copy.facts);

  // --- how to play ---------------------------------------------------------
  const doc = entry.howToPlay;
  const docCopy = copy.howToPlay;
  expect(docCopy, `${at('howToPlay')} is missing`).toBeDefined();
  if (docCopy) {
    expectTranslated(at('howToPlay.summary'), doc.summary, docCopy.summary);
    expectTranslated(at('howToPlay.objective'), doc.objective, docCopy.objective);
    expectSameLength(at('howToPlay.sections'), doc.sections, docCopy.sections);

    doc.sections.forEach((section, index) => {
      const sectionCopy = docCopy.sections?.[index];
      const where = at(`howToPlay.sections[${index}]`);
      expect(sectionCopy, `${where} is missing`).toBeDefined();
      if (!sectionCopy) return;
      expectTranslated(`${where}.heading`, section.heading, sectionCopy.heading);
      if (section.body) {
        expectSameLength(`${where}.body`, section.body, sectionCopy.body);
        section.body.forEach((line, i) =>
          expectTranslated(`${where}.body[${i}]`, line, sectionCopy.body?.[i]),
        );
      }
      if (section.bullets) {
        expectSameLength(`${where}.bullets`, section.bullets, sectionCopy.bullets);
        section.bullets.forEach((bullet, i) => {
          expectTranslated(
            `${where}.bullets[${i}].label`,
            bullet.label,
            sectionCopy.bullets?.[i]?.label,
          );
          expectTranslated(
            `${where}.bullets[${i}].text`,
            bullet.text,
            sectionCopy.bullets?.[i]?.text,
          );
        });
      }
    });
  }

  // --- modes ---------------------------------------------------------------
  for (const mode of entry.modes) {
    const where = at(`modes.${mode.id}`);
    const modeCopy = copy.modes?.[mode.id];
    expect(modeCopy, `${where} is missing`).toBeDefined();
    if (!modeCopy) continue;
    expectTranslated(`${where}.name`, mode.name, modeCopy.name);
    expectTranslated(`${where}.tagline`, mode.tagline, modeCopy.tagline);
    expectTranslated(`${where}.description`, mode.description, modeCopy.description);
    expectSameLength(`${where}.facts`, mode.facts, modeCopy.facts);
  }

  // --- rule settings -------------------------------------------------------
  for (const field of entry.configSchema.fields) {
    const where = at(`fields.${field.key}`);
    const fieldCopy = copy.fields?.[field.key];
    expect(fieldCopy, `${where} is missing`).toBeDefined();
    if (!fieldCopy) continue;
    expectTranslated(`${where}.label`, field.label, fieldCopy.label);
    if (field.help) expectTranslated(`${where}.help`, field.help, fieldCopy.help);
    if (field.kind === 'enum') {
      for (const option of field.options) {
        const key = String(option.value);
        expectTranslated(`${where}.options.${key}`, option.label, fieldCopy.options?.[key]);
      }
    }
  }

  for (const preset of entry.configSchema.presets) {
    expectTranslated(at(`presets.${preset.id}`), preset.label, copy.presets?.[preset.id]);
  }
}

describe.each(LOCALES)('$id game copy', ({ id, book }) => {
  it('covers every game on the shelf', () => {
    const missing = GAMES.filter((entry) => !book[entry.id]).map((entry) => entry.id);
    expect(missing).toEqual([]);
  });

  it('has no copy for a game the shelf does not carry', () => {
    const shelved = new Set(GAMES.map((entry) => entry.id));
    const orphans = Object.keys(book).filter((key) => !shelved.has(key));
    expect(orphans).toEqual([]);
  });

  it.each(GAMES.map((entry) => [entry.id, entry] as const))(
    'translates every string %s shows a player',
    (_id, entry) => {
      checkGame(id, entry, book[entry.id]);
    },
  );
});

describe('localizeGame', () => {
  const spades = GAMES.find((entry) => entry.id === 'spades');

  it('leaves an untranslated game exactly as the pack wrote it', () => {
    expect(spades).toBeDefined();
    expect(localizeGame(spades!, undefined)).toBe(spades);
  });

  it('falls back per field rather than blanking what is missing', () => {
    expect(spades).toBeDefined();
    const partial = localizeGame(spades!, { tagline: 'Canta tus bazas' });
    expect(partial.tagline).toBe('Canta tus bazas');
    // Everything the copy did not mention keeps the pack's own words.
    expect(partial.name).toBe(spades!.name);
    expect(partial.howToPlay).toEqual(spades!.howToPlay);
  });

  it('refuses a facts list of the wrong length rather than dropping a chip', () => {
    expect(spades).toBeDefined();
    const wrong = localizeGame(spades!, { facts: ['solo uno'] });
    expect(wrong.facts).toEqual(spades!.facts);
  });

  it('keeps the config schema behaving while translating its labels', () => {
    expect(spades).toBeDefined();
    const localized = localizeGame(spades!, {
      fields: { nil: { label: 'Permitir nil' } },
    });
    const field = localized.configSchema.fields.find((f) => f.key === 'nil');
    expect(field?.label).toBe('Permitir nil');
    // Rule values are not copy and must survive untouched.
    expect(localized.configSchema.defaults()).toEqual(spades!.configSchema.defaults());
  });

  it('keys enum option labels by value, not by position', () => {
    expect(spades).toBeDefined();
    const localized = localizeGame(spades!, {
      fields: { targetScore: { options: { '500': '500 — estándar' } } },
    });
    const field = localized.configSchema.fields.find((f) => f.key === 'targetScore');
    expect(field?.kind).toBe('enum');
    if (field?.kind !== 'enum') return;
    expect(field.options.find((o) => o.value === 500)?.label).toBe('500 — estándar');
    // An option the copy did not mention keeps its English label.
    expect(field.options.find((o) => o.value === 250)?.label).toBe(
      spades!.configSchema.fields
        .flatMap((f) => (f.kind === 'enum' ? f.options : []))
        .find((o) => o.value === 250)?.label,
    );
  });
});
