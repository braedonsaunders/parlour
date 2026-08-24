'use client';

import { useEffect, useRef, useState } from 'react';
import { LOCALES, LOCALE_META, useLocale, useT } from '@/lib/i18n';

/**
 * The home-screen language button, sitting beside the mute button.
 *
 * Deliberately the same `btn-fat--ghost` chrome pill as its neighbour, and
 * pinned to the same corner group, so the pair reads as one control cluster
 * rather than a new piece of furniture. It collapses to the two-letter badge on
 * a narrow screen exactly as the mute button collapses to its icon.
 */
export function MainMenuLanguageButton() {
  const t = useT();
  const { locale, setLocale } = useLocale();
  const [open, setOpen] = useState(false);
  const container = useRef<HTMLDivElement>(null);
  const current = LOCALE_META[locale];

  // Dismiss on Escape or on a click outside — the same two exits every other
  // transient surface in the app offers.
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    const onPointer = (event: PointerEvent) => {
      if (!container.current?.contains(event.target as Node)) setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('pointerdown', onPointer);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('pointerdown', onPointer);
    };
  }, [open]);

  return (
    <div ref={container} className="relative">
      <button
        type="button"
        className="btn-fat btn-fat--ghost h-12 min-w-12 px-3"
        aria-label={t('language.change')}
        aria-haspopup="listbox"
        aria-expanded={open}
        data-testid="language-button"
        onClick={() => setOpen((value) => !value)}
      >
        <GlobeIcon />
        <span className="hidden sm:inline">{current.nativeName}</span>
        <span className="sm:hidden">{current.short}</span>
      </button>

      {open && (
        <ul
          role="listbox"
          aria-label={t('language.label')}
          className="panel-soft absolute left-0 top-14 z-40 min-w-44 overflow-hidden p-1"
        >
          {LOCALES.map((id) => {
            const meta = LOCALE_META[id];
            const active = id === locale;
            return (
              <li key={id}>
                <button
                  type="button"
                  role="option"
                  aria-selected={active}
                  lang={meta.tag}
                  data-testid={`language-option-${id}`}
                  onClick={() => {
                    setLocale(id);
                    setOpen(false);
                  }}
                  className={`flex w-full items-center justify-between gap-3 rounded-chunky px-3 py-2 text-left text-sm font-bold transition-colors ${
                    active
                      ? 'bg-hearth-400/20 text-hearth-100'
                      : 'text-dusk-100 hover:text-hearth-200'
                  }`}
                >
                  <span>{meta.nativeName}</span>
                  <span className="text-xs uppercase tracking-[0.2em] text-dusk-200">
                    {meta.short}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function GlobeIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5 fill-none stroke-current">
      <circle cx="12" cy="12" r="9" strokeWidth="2" />
      <path d="M3 12h18" strokeWidth="2" strokeLinecap="round" />
      <path d="M12 3a15 15 0 0 1 0 18a15 15 0 0 1 0-18Z" strokeWidth="2" strokeLinejoin="round" />
    </svg>
  );
}
