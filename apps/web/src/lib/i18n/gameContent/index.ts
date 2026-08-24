'use client';

import { useMemo } from 'react';
import type { ConfigSchema, GameCatalogEntry, RuleValues } from '@parlour/engine';
import { GAMES, getGame } from '@/lib/games/shelf';
import { useLocaleStore } from '@/stores/locale';
import type { Locale } from '../locales';
import { ES_GAMES } from './es';
import { FR_GAMES } from './fr';
import { PT_GAMES } from './pt';
import { ZH_GAMES } from './zh';
import { localizeGame, localizeModeList, localizeSchema } from './localize';
import type { GameCopyBook } from './types';
import type { LocalizableMode } from './localize';

export type { GameCopy, GameCopyBook, HowToPlayCopy, ModeCopy, SectionCopy } from './types';
export {
  localizeGame,
  localizeHowToPlay,
  localizeModeList,
  localizeSchema,
  type LocalizableMode,
} from './localize';

/**
 * Per-language game copy.
 *
 * English is deliberately absent: it lives in the packs, which are the source
 * of truth for their own words. A locale with no book here simply renders the
 * packs unchanged.
 */
export const GAME_COPY: Readonly<Partial<Record<Locale, GameCopyBook>>> = {
  es: ES_GAMES,
  fr: FR_GAMES,
  pt: PT_GAMES,
  zh: ZH_GAMES,
};

export function gameCopyFor(locale: Locale): GameCopyBook | undefined {
  return GAME_COPY[locale];
}

/** One game's shelf entry in a language, outside a React render. */
export function localizedGame(id: string, locale: Locale): GameCatalogEntry {
  return localizeGame(getGame(id), gameCopyFor(locale)?.[id]);
}

/** Every shelf entry in a language, in the order the shelf lists them. */
export function localizedGames(locale: Locale): readonly GameCatalogEntry[] {
  const book = gameCopyFor(locale);
  if (!book) return GAMES;
  return GAMES.map((entry) => localizeGame(entry, book[entry.id]));
}

/**
 * The shelf in the player's language.
 *
 * Memoised on the locale: the entries are rebuilt objects, and a picker that
 * re-created them every render would remount every tile on every keystroke of
 * the search box.
 */
export function useLocalizedGames(): readonly GameCatalogEntry[] {
  const locale = useLocaleStore((state) => state.locale);
  return useMemo(() => localizedGames(locale), [locale]);
}

/** One game in the player's language. */
export function useLocalizedGame(id: string): GameCatalogEntry {
  const locale = useLocaleStore((state) => state.locale);
  return useMemo(() => localizedGame(id, locale), [id, locale]);
}

/**
 * A setup screen's mode tiles in the player's language.
 *
 * The app keeps its own mode list per game (`lib/<game>/modes.ts`) alongside the
 * pack's catalog modes, and the two carry the same ids and the same words. One
 * translation therefore covers both — this overlays it onto whichever list the
 * caller holds, so a setup page adopts it by wrapping its constant.
 */
export function useLocalizedModes<T extends LocalizableMode>(
  gameId: string,
  modes: readonly T[],
): readonly T[] {
  const locale = useLocaleStore((state) => state.locale);
  return useMemo(
    () => localizeModeList(modes, gameCopyFor(locale)?.[gameId]),
    [gameId, locale, modes],
  );
}

/** A game's rule-settings panel in the player's language. */
export function useLocalizedSchema<C extends RuleValues>(
  gameId: string,
  schema: ConfigSchema<C>,
): ConfigSchema<C> {
  const locale = useLocaleStore((state) => state.locale);
  return useMemo(
    () => localizeSchema(schema, gameCopyFor(locale)?.[gameId]),
    [gameId, locale, schema],
  );
}
