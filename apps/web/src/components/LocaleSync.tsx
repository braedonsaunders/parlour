'use client';

import { useEffect } from 'react';
import { LOCALE_META } from '@/lib/i18n';
import { useLocaleStore } from '@/stores/locale';

/**
 * Keeps the document's language in step with the player's choice.
 *
 * `<html lang>` is not decoration: it is what a screen reader picks a voice
 * from and what the browser hyphenates by. The static export is emitted with
 * `lang="en"`, so this corrects it once the persisted choice has hydrated.
 *
 * It also adopts the browser's language on a first visit — but only then. Once
 * someone has picked a language it is theirs, even on a device set to something
 * else, which is the case for anyone playing on a borrowed or shared machine.
 */
export function LocaleSync() {
  const locale = useLocaleStore((state) => state.locale);
  const adoptBrowserLocale = useLocaleStore((state) => state.adoptBrowserLocale);

  useEffect(() => {
    adoptBrowserLocale(navigator.languages ?? [navigator.language]);
  }, [adoptBrowserLocale]);

  useEffect(() => {
    const meta = LOCALE_META[locale];
    document.documentElement.lang = meta.tag;
    document.documentElement.dir = meta.dir;
  }, [locale]);

  return null;
}
