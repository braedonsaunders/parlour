import type {
  ConfigField,
  ConfigSchema,
  GameCatalogEntry,
  GameMode,
  HowToPlayDoc,
  HowToPlaySection,
  RuleValues,
} from '@parlour/engine';
import type { GameCopy, HowToPlayCopy, ModeCopy, SectionCopy } from './types';

/**
 * Applies a language's copy over a pack's English, field by field.
 *
 * Everything here falls back rather than replaces: an untranslated field keeps
 * the pack's own words. That is deliberate — a shelf tile with an English
 * tagline is legible, and a blank one is a bug report.
 *
 * The result is structurally a `GameCatalogEntry`, so every screen that already
 * renders one needs no changes at all. Art, accents, seat counts, hrefs and the
 * config schema's *behaviour* are carried through untouched; only the words
 * move.
 */

function pick<T>(translated: T | undefined, original: T): T {
  return translated === undefined ? original : translated;
}

/** Arrays are replaced whole, but only if the translation has the same length. */
function pickList(
  translated: readonly string[] | undefined,
  original: readonly string[],
): readonly string[] {
  if (!translated || translated.length !== original.length) return original;
  return translated;
}

function localizeSection(
  section: HowToPlaySection,
  copy: SectionCopy | undefined,
): HowToPlaySection {
  if (!copy) return section;
  const next: HowToPlaySection = { heading: pick(copy.heading, section.heading) };
  if (section.body) next.body = pickList(copy.body, section.body);
  if (section.bullets) {
    next.bullets = section.bullets.map((bullet, index) => {
      const bulletCopy = copy.bullets?.[index];
      return {
        label: pick(bulletCopy?.label, bullet.label),
        text: pick(bulletCopy?.text, bullet.text),
      };
    });
  }
  return next;
}

export function localizeHowToPlay(
  doc: HowToPlayDoc,
  copy: HowToPlayCopy | undefined,
): HowToPlayDoc {
  if (!copy) return doc;
  return {
    summary: pick(copy.summary, doc.summary),
    objective: pick(copy.objective, doc.objective),
    // Positional: a copy list shorter than the doc leaves the tail in English
    // rather than dropping the sections it does not reach.
    sections: doc.sections.map((section, index) =>
      localizeSection(section, copy.sections?.[index]),
    ),
  };
}

function localizeMode(mode: GameMode, copy: ModeCopy | undefined): GameMode {
  if (!copy) return mode;
  return {
    ...mode,
    name: pick(copy.name, mode.name),
    tagline: pick(copy.tagline, mode.tagline),
    description: pick(copy.description, mode.description),
    facts: pickList(copy.facts, mode.facts),
  };
}

function localizeField(field: ConfigField, copy: GameCopy['fields']): ConfigField {
  const fieldCopy = copy?.[field.key];
  if (!fieldCopy) return field;

  const base = {
    ...field,
    label: pick(fieldCopy.label, field.label),
    help: pick(fieldCopy.help, field.help),
    group: pick(fieldCopy.group, field.group),
  };

  // Only enum fields carry options, and their `value` is the rule value the
  // engine stores — so options are keyed by value and never by label.
  if (base.kind === 'enum') {
    return {
      ...base,
      options: base.options.map((option) => ({
        ...option,
        label: fieldCopy.options?.[String(option.value)] ?? option.label,
      })),
    };
  }
  return base;
}

/**
 * A config schema with translated labels and the original behaviour.
 *
 * `defaults` and `resolve` are carried through by reference: they decide what a
 * rule value *is*, which no translation may touch. Only `fields` and the preset
 * labels are rebuilt.
 */
function localizeConfigSchema<C extends RuleValues>(
  schema: ConfigSchema<C>,
  copy: GameCopy,
): ConfigSchema<C> {
  if (!copy.fields && !copy.presets) return schema;
  return {
    ...schema,
    fields: schema.fields.map((field) => localizeField(field, copy.fields)),
    presets: schema.presets.map((preset) => ({
      ...preset,
      label: copy.presets?.[preset.id] ?? preset.label,
    })),
  };
}

/** The shelf entry a player in this language should see. */
export function localizeGame(
  entry: GameCatalogEntry,
  copy: GameCopy | undefined,
): GameCatalogEntry {
  if (!copy) return entry;
  return {
    ...entry,
    name: pick(copy.name, entry.name),
    subtitle: pick(copy.subtitle, entry.subtitle),
    tagline: pick(copy.tagline, entry.tagline),
    description: pick(copy.description, entry.description),
    facts: pickList(copy.facts, entry.facts),
    howToPlay: localizeHowToPlay(entry.howToPlay, copy.howToPlay),
    modes: entry.modes.map((mode) => localizeMode(mode, copy.modes?.[mode.id])),
    configSchema: localizeConfigSchema(entry.configSchema, copy),
  };
}

/** The shape a mode tile needs, shared by the pack's `GameMode` and the app's own. */
export interface LocalizableMode {
  id: string;
  name: string;
  tagline: string;
  description: string;
  facts: readonly string[];
}

/**
 * Overlays mode copy onto any list keyed by mode id.
 *
 * Generic over the element type so it works on both the pack's `GameMode` and
 * the app's per-game `…ModeDef`, which carry the same words under the same ids
 * and differ only in the presentation fields this does not touch.
 */
export function localizeModeList<T extends LocalizableMode>(
  modes: readonly T[],
  copy: GameCopy | undefined,
): readonly T[] {
  if (!copy?.modes) return modes;
  return modes.map((mode) => {
    const modeCopy = copy.modes?.[mode.id];
    if (!modeCopy) return mode;
    return {
      ...mode,
      name: pick(modeCopy.name, mode.name),
      tagline: pick(modeCopy.tagline, mode.tagline),
      description: pick(modeCopy.description, mode.description),
      facts: pickList(modeCopy.facts, mode.facts),
    };
  });
}

/** A config schema with translated labels; see {@link localizeGame}. */
export function localizeSchema<C extends RuleValues>(
  schema: ConfigSchema<C>,
  copy: GameCopy | undefined,
): ConfigSchema<C> {
  return copy ? localizeConfigSchema(schema, copy) : schema;
}
