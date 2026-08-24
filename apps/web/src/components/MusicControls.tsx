'use client';

import { getMusicTrack } from '@/lib/audio/music';
import { useAudioManager, useMusicController, useMusicStore } from '@/stores/audio';

/** Transport + soundtrack picker shown inside the settings modal. */
export function MusicControls() {
  useAudioManager();
  const controller = useMusicController();
  const status = useMusicStore((state) => state.status);
  const trackId = useMusicStore((state) => state.trackId);
  const shuffle = useMusicStore((state) => state.shuffle);
  const packId = useMusicStore((state) => state.packId);

  const track = getMusicTrack(trackId);
  const playing = status === 'playing';
  const packs = controller.listPacks();

  return (
    <div className="flex flex-col gap-2" data-testid="music-controls">
      <div className="flex items-center justify-center gap-1">
        <button
          type="button"
          aria-label="Previous song"
          title="Previous song"
          onClick={() => controller.previous()}
          className={iconButtonClass}
        >
          <PrevIcon />
        </button>
        <button
          type="button"
          aria-label={playing ? 'Pause music' : 'Play music'}
          title={playing ? 'Pause' : 'Play'}
          aria-pressed={playing}
          data-testid="music-toggle"
          onClick={() => controller.toggle()}
          className={iconButtonClass}
        >
          {playing ? <PauseIcon /> : <PlayIcon />}
        </button>
        <button
          type="button"
          aria-label="Next song"
          title="Next song"
          onClick={() => controller.next()}
          className={iconButtonClass}
        >
          <NextIcon />
        </button>
        <button
          type="button"
          aria-label={shuffle ? 'Shuffle on' : 'Shuffle off'}
          title="Shuffle"
          aria-pressed={shuffle}
          onClick={() => controller.toggleShuffle()}
          className={iconButtonClass}
        >
          <ShuffleIcon active={shuffle} />
        </button>
      </div>

      <p
        className="text-center text-xs font-bold text-dusk-100"
        data-testid="music-track-title"
        aria-live="polite"
      >
        {track?.title ?? 'parlour'}
      </p>

      {packs.length > 1 ? (
        <div
          role="radiogroup"
          aria-label="Soundtrack"
          className="flex items-center justify-center gap-1"
        >
          {packs.map((pack) => {
            const active = pack.id === packId;
            return (
              <button
                key={pack.id}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => controller.setPack(pack.id)}
                className={`rounded-full px-2.5 py-1 text-xs font-semibold transition-all duration-150 ease-pop ${
                  active
                    ? 'bg-hearth-400/25 text-hearth-100'
                    : 'text-dusk-200/70 hover:-translate-y-0.5 hover:text-dusk-100'
                }`}
              >
                {pack.label}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

const iconButtonClass =
  'flex h-8 w-8 items-center justify-center rounded-full text-dusk-200 transition-all duration-150 ease-pop hover:-translate-y-0.5 hover:text-dusk-100';

function PlayIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4 fill-current">
      <path d="M8 5.5v13l11-6.5L8 5.5Z" />
    </svg>
  );
}

function PauseIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4 fill-current">
      <path d="M7 5h3.5v14H7zM13.5 5H17v14h-3.5z" />
    </svg>
  );
}

function NextIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4 fill-current">
      <path d="M6 5.5v13l9-6.5-9-6.5ZM16.5 5H19v14h-2.5z" />
    </svg>
  );
}

function PrevIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4 fill-current">
      <path d="M18 5.5v13l-9-6.5 9-6.5ZM7.5 5H5v14h2.5z" />
    </svg>
  );
}

function ShuffleIcon({ active }: { active: boolean }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className={`h-4 w-4 fill-none stroke-current ${active ? 'text-hearth-300' : ''}`}
    >
      <path
        d="M3 7h3.5c5.5 0 8 10 13.5 10M20 17l-2-2m2 2-2 2M3 17h3.5c1.7 0 3-1.1 4.2-2.5M20 7l-2-2m2 2-2 2m2-2h-3.5c-1.7 0-3 1.1-4.2 2.5"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
