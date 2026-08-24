import type { BotTier } from '@/stores/setup';

export const BOT_DIFFICULTIES: readonly { tier: BotTier; label: string }[] = [
  { tier: 1, label: 'Easy' },
  { tier: 2, label: 'Medium' },
  { tier: 3, label: 'Hard' },
];

export function BotDifficultyPicker({
  value,
  onChange,
  label = 'Bot skill',
}: {
  value: BotTier;
  onChange: (tier: BotTier) => void;
  label?: string;
}) {
  return (
    <div data-testid="bot-difficulty-picker">
      <p className="text-xs font-bold uppercase tracking-[0.2em] text-dusk-200">{label}</p>
      <div className="mt-1.5 flex items-center gap-2" role="group" aria-label={label}>
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
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}
