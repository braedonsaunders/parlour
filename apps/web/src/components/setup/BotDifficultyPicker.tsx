'use client';

import { useT, type MessageKey } from '@/lib/i18n';
import type { BotTier } from '@/stores/setup';

/**
 * The tiers, keyed rather than labelled.
 *
 * The label used to live on this constant, which meant it was resolved once at
 * module load — before any language was known, and never again. Holding the
 * message key instead lets the component read the label at render time, which
 * is the only moment the player's language is a fact.
 */
export const BOT_DIFFICULTIES: readonly { tier: BotTier; labelKey: MessageKey }[] = [
  { tier: 1, labelKey: 'setup.easy' },
  { tier: 2, labelKey: 'setup.medium' },
  { tier: 3, labelKey: 'setup.hard' },
];

export function BotDifficultyPicker({
  value,
  onChange,
  label,
}: {
  value: BotTier;
  onChange: (tier: BotTier) => void;
  label?: string;
}) {
  const t = useT();
  const heading = label ?? t('setup.botSkill');

  return (
    <div data-testid="bot-difficulty-picker">
      <p className="text-xs font-bold uppercase tracking-[0.2em] text-dusk-200">{heading}</p>
      <div className="mt-1.5 flex items-center gap-2" role="group" aria-label={heading}>
        {BOT_DIFFICULTIES.map((option) => (
          <button
            key={option.tier}
            type="button"
            aria-pressed={option.tier === value}
            onClick={() => onChange(option.tier)}
            className={`rounded-fat border-2 px-3.5 py-1.5 font-display text-sm font-extrabold transition-transform duration-150 ease-pop hover:-translate-y-0.5 ${
              option.tier === value
                ? 'border-hearth-700 bg-gradient-to-b from-hearth-300 to-hearth-500 text-hearth-900'
                : 'border-dusk-700/60 bg-dusk-950/70 text-dusk-100'
            }`}
          >
            {t(option.labelKey)}
          </button>
        ))}
      </div>
    </div>
  );
}
