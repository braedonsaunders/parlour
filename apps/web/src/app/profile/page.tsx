'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { AVATARS } from '@/lib/avatars';
import { knockSuccessRate, winRate, useProfileStore } from '@/stores/profile';
import { useAudioStore } from '@/stores/audio';
import type { AudioChannel } from '@/lib/audio/AudioManager';
import { AvatarBadge } from '@/components/AvatarBadge';

export default function ProfilePage() {
  const name = useProfileStore((s) => s.name);
  const avatarId = useProfileStore((s) => s.avatarId);
  const stats = useProfileStore((s) => s.stats);
  const settings = useProfileStore((s) => s.settings);
  const setName = useProfileStore((s) => s.setName);
  const setAvatarId = useProfileStore((s) => s.setAvatarId);
  const updateSettings = useProfileStore((s) => s.updateSettings);
  const resetStats = useProfileStore((s) => s.resetStats);
  const [confirmingReset, setConfirmingReset] = useState(false);
  const audioChannels = useAudioStore((s) => s.channels);
  const audioUnlocked = useAudioStore((s) => s.unlocked);
  const setVolume = useAudioStore((s) => s.setVolume);
  const toggleMuted = useAudioStore((s) => s.toggleMuted);

  useEffect(() => {
    if (confirmingReset) {
      const timer = window.setTimeout(() => setConfirmingReset(false), 2500);
      return () => window.clearTimeout(timer);
    }
  }, [confirmingReset]);

  const rate = Math.round(winRate(stats) * 100);
  const knockRate = Math.round(knockSuccessRate(stats) * 100);

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-4xl flex-col gap-6 px-6 py-8">
      <header className="flex items-center justify-between">
        <Link href="/" className="pill-soft text-sm font-bold text-dusk-100 hover:text-hearth-200">
          ← Back
        </Link>
        <h1 className="font-display text-2xl font-extrabold tracking-tight text-hearth-50">
          Profile
        </h1>
      </header>

      <section className="panel-soft flex flex-wrap items-center gap-5 p-5" aria-label="Identity">
        <AvatarBadge avatarId={avatarId} size={72} />
        <label className="flex-1">
          <span className="text-xs font-bold uppercase tracking-[0.2em] text-dusk-200">
            Your name
          </span>
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            maxLength={16}
            placeholder="Anonymous regular"
            className="mt-1.5 w-full rounded-chunky border-2 border-dusk-700/60 bg-dusk-950/70 px-4 py-2.5 font-display text-lg font-bold text-hearth-50 outline-none transition-colors focus:border-hearth-400"
          />
        </label>
      </section>

      <section aria-label="Pick an avatar" className="panel-soft p-5">
        <h2 className="text-xs font-bold uppercase tracking-[0.2em] text-dusk-200">Character</h2>
        <div className="mt-3 grid grid-cols-4 gap-3 sm:grid-cols-8">
          {AVATARS.map((avatar) => (
            <button
              key={avatar.id}
              type="button"
              onClick={() => setAvatarId(avatar.id)}
              aria-pressed={avatar.id === avatarId}
              title={avatar.name}
              className={`flex flex-col items-center gap-1 rounded-fat border-2 p-2 transition-transform duration-150 ease-pop hover:-translate-y-0.5 ${
                avatar.id === avatarId ? 'border-hearth-300 bg-hearth-400/15' : 'border-transparent'
              }`}
            >
              <AvatarBadge avatarId={avatar.id} size={44} />
              <span className="text-xs font-bold text-dusk-100">{avatar.name}</span>
            </button>
          ))}
        </div>
      </section>

      <section aria-label="Lifetime stats" className="panel-soft p-5">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-xs font-bold uppercase tracking-[0.2em] text-dusk-200">
            Lifetime at the table
          </h2>
          <button
            type="button"
            data-testid="reset-stats"
            onClick={() => {
              if (confirmingReset) {
                resetStats();
                setConfirmingReset(false);
              } else {
                setConfirmingReset(true);
              }
            }}
            className={`rounded-pill border px-3 py-1 text-xs font-bold transition-colors ${
              confirmingReset
                ? 'border-rust bg-rust/30 text-hearth-100'
                : 'border-dusk-700/60 text-dusk-200 hover:text-hearth-200'
            }`}
          >
            {confirmingReset ? 'Tap again to confirm' : 'Reset stats'}
          </button>
        </div>
        <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <Stat label="Games" value={stats.games} />
          <Stat label="Wins" value={stats.wins} />
          <Stat label="Win rate" value={`${rate}%`} />
          <Stat label="Blitzes" value={stats.blitzes} />
          <Stat label="Knock success" value={`${knockRate}%`} />
          <Stat label="Best streak" value={stats.bestStreak} />
        </dl>
      </section>

      <section aria-label="Audio settings" className="panel-soft p-5">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-xs font-bold uppercase tracking-[0.2em] text-dusk-200">Sound</h2>
          <span className="text-xs text-dusk-200/75">
            {audioUnlocked ? 'playing at the table' : 'starts on your first tap'}
          </span>
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          {(['master', 'music', 'sfx'] as const).map((channel) => (
            <AudioControl
              key={channel}
              channel={channel}
              volume={audioChannels[channel].volume}
              muted={audioChannels[channel].muted}
              onVolume={(volume) => setVolume(channel, volume)}
              onToggle={() => toggleMuted(channel)}
            />
          ))}
        </div>
      </section>

      <section aria-label="Accessibility" className="panel-soft p-5">
        <h2 className="text-xs font-bold uppercase tracking-[0.2em] text-dusk-200">Comfort</h2>
        <ToggleRow
          label="Reduce motion"
          hint="Calms celebrations and ambient movement everywhere."
          checked={settings.reducedMotion}
          onChecked={(checked) => updateSettings({ reducedMotion: checked })}
        />
      </section>
    </main>
  );
}

function AudioControl({
  channel,
  volume,
  muted,
  onVolume,
  onToggle,
}: {
  channel: AudioChannel;
  volume: number;
  muted: boolean;
  onVolume: (volume: number) => void;
  onToggle: () => void;
}) {
  const label = channel === 'sfx' ? 'Effects' : `${channel[0]!.toUpperCase()}${channel.slice(1)}`;
  return (
    <div className="rounded-chunky border border-dusk-700/40 bg-dusk-950/60 p-3">
      <div className="flex items-center justify-between gap-2">
        <label htmlFor={`volume-${channel}`} className="font-display font-bold text-hearth-50">
          {label}
        </label>
        <button
          type="button"
          onClick={onToggle}
          aria-pressed={muted}
          className="rounded-pill border border-dusk-700 px-2.5 py-1 text-xs font-bold text-dusk-100 hover:text-hearth-200"
        >
          {muted ? 'Muted' : 'On'}
        </button>
      </div>
      <input
        id={`volume-${channel}`}
        type="range"
        min="0"
        max="1"
        step="0.05"
        value={volume}
        onChange={(event) => onVolume(event.currentTarget.valueAsNumber)}
        aria-label={`${label} volume`}
        className="mt-3 w-full accent-hearth-400"
      />
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-chunky border border-dusk-700/40 bg-dusk-950/60 px-3 py-2.5 text-center">
      <dt className="text-[0.65rem] font-bold uppercase tracking-[0.18em] text-dusk-200">
        {label}
      </dt>
      <dd className="font-display text-xl font-extrabold text-hearth-100">{value}</dd>
    </div>
  );
}

function ToggleRow({
  label,
  hint,
  checked,
  onChecked,
}: {
  label: string;
  hint: string;
  checked: boolean;
  onChecked: (checked: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChecked(!checked)}
      className="mt-3 flex w-full items-center justify-between gap-4 text-left"
    >
      <span>
        <span className="block font-display font-bold text-hearth-50">{label}</span>
        <span className="block text-xs text-dusk-200/85">{hint}</span>
      </span>
      <span
        className={`relative h-7 w-12 flex-none rounded-pill border-2 transition-colors ${
          checked ? 'border-hearth-600 bg-hearth-400' : 'border-dusk-700 bg-dusk-950'
        }`}
      >
        <span
          className={`absolute top-0.5 h-5 w-5 rounded-full bg-hearth-50 shadow transition-all duration-150 ease-pop ${
            checked ? 'left-6' : 'left-0.5'
          }`}
        />
      </span>
    </button>
  );
}
