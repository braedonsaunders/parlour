/**
 * Translated game copy, as an overlay on the packs' own English.
 *
 * ## Why an overlay rather than keys in the packs
 *
 * A game pack owns its player-facing text: `spadesCatalog.tagline` and
 * `spadesHowToPlay` are part of the pack, not of the app, and that is what lets
 * a pack be read, tested and published on its own. Replacing those strings with
 * message keys would move the copy into the app and leave the packs holding
 * identifiers that mean nothing without it.
 *
 * So the packs stay in English and the app carries a per-locale overlay keyed
 * to them. English is not duplicated here — it is read from the pack — which
 * means there is exactly one copy of the original text and no way for the two
 * to disagree about what the English *is*.
 *
 * The hazard that buys is staleness: a pack can change a sentence and the
 * overlay will quietly keep translating the old one. `gameContent.test.ts`
 * closes it by walking every pack and asserting the overlay covers the current
 * shape — a new section or bullet fails the build until it has been translated.
 *
 * Every field is optional. A missing one falls back to the pack's English, so a
 * half-finished locale degrades to mixed language rather than to blank cards.
 */

export interface HowToPlayCopy {
  summary?: string;
  objective?: string;
  /**
   * Positional, matching `HowToPlayDoc.sections`. Sections have no ids to key
   * on, and inventing them would mean changing the engine's public doc type for
   * the app's convenience. The shape test is what makes the position safe.
   */
  sections?: readonly SectionCopy[];
}

export interface SectionCopy {
  heading?: string;
  body?: readonly string[];
  bullets?: readonly { label?: string; text?: string }[];
}

export interface ModeCopy {
  name?: string;
  tagline?: string;
  description?: string;
  facts?: readonly string[];
}

export interface FieldCopy {
  label?: string;
  help?: string;
  group?: string;
  /** Keyed by the option's `value` as written in the pack's config schema. */
  options?: Readonly<Record<string, string>>;
}

/** One game's copy in one language. */
export interface GameCopy {
  name?: string;
  subtitle?: string;
  tagline?: string;
  description?: string;
  facts?: readonly string[];
  howToPlay?: HowToPlayCopy;
  /** Keyed by mode id. */
  modes?: Readonly<Record<string, ModeCopy>>;
  /** Keyed by config field key. */
  fields?: Readonly<Record<string, FieldCopy>>;
  /** Keyed by config preset id. */
  presets?: Readonly<Record<string, string>>;
}

/** Every game's copy in one language, keyed by shelf id. */
export type GameCopyBook = Readonly<Record<string, GameCopy>>;
