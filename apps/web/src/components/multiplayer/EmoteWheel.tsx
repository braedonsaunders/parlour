'use client';

import { EMOTES, type Emote } from '@/lib/multiplayer';

const LABELS: Record<Emote, string> = {
  hello: '👋 Hello!',
  nice: '✨ Nice!',
  oops: '🙈 Oops',
  wow: '🤯 Wow!',
  hurry: '⏳ Your turn',
  gg: '🤝 Good game',
};

export function EmoteWheel({
  onEmote,
  disabled = false,
}: {
  onEmote: (emote: Emote) => void;
  disabled?: boolean;
}) {
  return (
    <div className="panel-soft grid grid-cols-2 gap-2 p-3 sm:grid-cols-3" aria-label="Quick emotes">
      {EMOTES.map((emote) => (
        <button
          key={emote}
          className="pill-soft transition-transform hover:scale-105 active:scale-95"
          type="button"
          disabled={disabled}
          onClick={() => onEmote(emote)}
        >
          {LABELS[emote]}
        </button>
      ))}
    </div>
  );
}
