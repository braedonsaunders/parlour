'use client';

import { useT } from '@/lib/i18n';
import { useAudioManager, useAudioStore } from '@/stores/audio';

/**
 * Positioning lives on the {@link MainMenuChrome} cluster rather than here, so
 * the language button can sit beside this one instead of over it.
 */
export function MainMenuMuteButton() {
  const t = useT();
  useAudioManager();
  const muted = useAudioStore((state) => state.channels.master.muted);
  const toggleMuted = useAudioStore((state) => state.toggleMuted);

  return (
    <button
      type="button"
      className="btn-fat btn-fat--ghost h-12 min-w-12 px-3"
      aria-label={muted ? t('sound.unmute') : t('sound.mute')}
      aria-pressed={muted}
      onClick={() => toggleMuted('master')}
    >
      {muted ? <MutedIcon /> : <SoundIcon />}
      <span className="hidden sm:inline">{muted ? t('sound.off') : t('sound.on')}</span>
    </button>
  );
}

function SoundIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5 fill-none stroke-current">
      <path d="M4 9v6h4l5 4V5L8 9H4Z" strokeWidth="2" strokeLinejoin="round" />
      <path
        d="M16 9.5a4 4 0 0 1 0 5M18.5 7a7.5 7.5 0 0 1 0 10"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

function MutedIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5 fill-none stroke-current">
      <path d="M4 9v6h4l5 4V5L8 9H4Z" strokeWidth="2" strokeLinejoin="round" />
      <path d="m17 9 5 5m0-5-5 5" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}
