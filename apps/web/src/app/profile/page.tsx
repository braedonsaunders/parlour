'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { AVATARS } from '@/lib/avatars';
import { knockSuccessRate, winRate, useProfileStore } from '@/stores/profile';
import { useAudioStore } from '@/stores/audio';
import type { AudioChannel } from '@/lib/audio/AudioManager';
import { AvatarBadge } from '@/components/AvatarBadge';
import { LOCALES, LOCALE_META, useLocale, useT } from '@/lib/i18n';
import { headToHead, useHistoryStore, type HeadToHead } from '@/stores/history';

export default function ProfilePage() {
  const t = useT();
  const name = useProfileStore((s) => s.name);
  const avatarId = useProfileStore((s) => s.avatarId);
  const stats = useProfileStore((s) => s.stats);
  const settings = useProfileStore((s) => s.settings);
  const setName = useProfileStore((s) => s.setName);
  const setAvatarId = useProfileStore((s) => s.setAvatarId);
  const updateSettings = useProfileStore((s) => s.updateSettings);
  const resetStats = useProfileStore((s) => s.resetStats);
  const [confirmingReset, setConfirmingReset] = useState(false);
  const [confirmingHistoryReset, setConfirmingHistoryReset] = useState(false);
  const records = useHistoryStore((s) => s.records);
  const clearHistory = useHistoryStore((s) => s.clearHistory);
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

  useEffect(() => {
    if (confirmingHistoryReset) {
      const timer = window.setTimeout(() => setConfirmingHistoryReset(false), 2500);
      return () => window.clearTimeout(timer);
    }
  }, [confirmingHistoryReset]);

  const rate = Math.round(winRate(stats) * 100);
  const knockRate = Math.round(knockSuccessRate(stats) * 100);
  const standings = useMemo(() => headToHead(records), [records]);

  return (
    <main className="safe-page mx-auto flex min-h-dvh w-full max-w-4xl flex-col gap-6">
      <header className="flex items-center justify-between">
        <Link href="/" className="pill-soft text-sm font-bold text-dusk-100 hover:text-hearth-200">
          {t('common.backArrow')}
        </Link>
        <h1 className="font-display text-2xl font-extrabold tracking-tight text-hearth-50">
          {t('profile.heading')}
        </h1>
      </header>

      <section
        className="panel-soft flex flex-wrap items-center gap-5 p-5"
        aria-label={t('profile.identity')}
      >
        <AvatarBadge avatarId={avatarId} size={72} />
        <label className="flex-1">
          <span className="text-xs font-bold uppercase tracking-[0.2em] text-dusk-200">
            {t('profile.yourName')}
          </span>
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            maxLength={16}
            placeholder={t('profile.namePlaceholder')}
            className="mt-1.5 w-full rounded-chunky border-2 border-dusk-700/60 bg-dusk-950/70 px-4 py-2.5 font-display text-lg font-bold text-hearth-50 outline-none transition-colors focus:border-hearth-400"
          />
        </label>
      </section>

      <section aria-label={t('profile.pickAvatar')} className="panel-soft p-5">
        <h2 className="text-xs font-bold uppercase tracking-[0.2em] text-dusk-200">
          {t('profile.character')}
        </h2>
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

      <section aria-label={t('profile.lifetimeLabel')} className="panel-soft p-5">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-xs font-bold uppercase tracking-[0.2em] text-dusk-200">
            {t('profile.lifetime')}
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
            {confirmingReset ? t('profile.confirmReset') : t('profile.resetStats')}
          </button>
        </div>
        <dl className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <Stat label={t('stats.games')} value={stats.games} />
          <Stat label={t('stats.wins')} value={stats.wins} />
          <Stat label={t('stats.winRate')} value={`${rate}%`} />
          <Stat label={t('stats.blitzes')} value={stats.blitzes} />
          <Stat label={t('stats.knockSuccess')} value={`${knockRate}%`} />
          <Stat label={t('stats.bestStreak')} value={stats.bestStreak} />
        </dl>
      </section>

      <section aria-label={t('profile.regularsLabel')} className="panel-soft p-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-xs font-bold uppercase tracking-[0.2em] text-dusk-200">
              {t('profile.regulars')}
            </h2>
            <p className="mt-1 text-xs text-dusk-200/75">{t('profile.regularsHint')}</p>
          </div>
          {standings.length > 0 && (
            <button
              type="button"
              onClick={() => {
                if (confirmingHistoryReset) {
                  clearHistory();
                  setConfirmingHistoryReset(false);
                } else {
                  setConfirmingHistoryReset(true);
                }
              }}
              className={`rounded-pill border px-3 py-1 text-xs font-bold transition-colors ${
                confirmingHistoryReset
                  ? 'border-rust bg-rust/30 text-hearth-100'
                  : 'border-dusk-700/60 text-dusk-200 hover:text-hearth-200'
              }`}
            >
              {confirmingHistoryReset ? t('profile.confirmForget') : t('profile.clearHistory')}
            </button>
          )}
        </div>
        {standings.length === 0 ? (
          <p className="mt-4 rounded-chunky border border-dashed border-dusk-700/60 px-4 py-5 text-center text-sm text-dusk-200/80">
            {t('profile.noRegulars')}
          </p>
        ) : (
          <ul className="mt-4 grid gap-3 sm:grid-cols-2">
            {standings.slice(0, 8).map((standing) => (
              <Standing key={standing.key} standing={standing} />
            ))}
          </ul>
        )}
      </section>

      <section aria-label={t('sound.heading')} className="panel-soft p-5">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-xs font-bold uppercase tracking-[0.2em] text-dusk-200">
            {t('sound.heading')}
          </h2>
          <span className="text-xs text-dusk-200/75">
            {audioUnlocked ? t('sound.playing') : t('sound.waiting')}
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

      <LanguageSection />

      <section aria-label={t('profile.comfortLabel')} className="panel-soft p-5">
        <h2 className="text-xs font-bold uppercase tracking-[0.2em] text-dusk-200">
          {t('profile.comfort')}
        </h2>
        <ToggleRow
          label={t('profile.reduceMotion')}
          hint={t('profile.reduceMotionHint')}
          checked={settings.reducedMotion}
          onChecked={(checked) => updateSettings({ reducedMotion: checked })}
        />
      </section>
    </main>
  );
}

/**
 * The language picker in the options menu.
 *
 * The home screen carries a quick switch for the common case; this is where
 * someone goes looking when they have already left the title screen, and it
 * says out loud that the choice is stored on this device rather than synced.
 */
function LanguageSection() {
  const t = useT();
  const { locale, setLocale } = useLocale();

  return (
    <section aria-label={t('language.heading')} className="panel-soft p-5">
      <h2 className="text-xs font-bold uppercase tracking-[0.2em] text-dusk-200">
        {t('language.heading')}
      </h2>
      <p className="mt-1 text-xs text-dusk-200/75">{t('language.hint')}</p>
      <div className="mt-3 flex flex-wrap gap-2" role="radiogroup" aria-label={t('language.label')}>
        {LOCALES.map((id) => {
          const meta = LOCALE_META[id];
          const active = id === locale;
          return (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={active}
              lang={meta.tag}
              data-testid={`language-choice-${id}`}
              onClick={() => setLocale(id)}
              className={`rounded-pill border-2 px-4 py-2 text-sm font-bold transition-colors ${
                active
                  ? 'border-hearth-300 bg-hearth-400/15 text-hearth-50'
                  : 'border-dusk-700/60 text-dusk-100 hover:text-hearth-200'
              }`}
            >
              {meta.nativeName}
            </button>
          );
        })}
      </div>
    </section>
  );
}

function Standing({ standing }: { standing: HeadToHead }) {
  const decided = standing.wins + standing.losses;
  const rate = decided === 0 ? 0 : Math.round((standing.wins / decided) * 100);
  return (
    <li className="flex items-center gap-3 rounded-chunky border border-dusk-700/40 bg-dusk-950/60 p-3">
      <AvatarBadge avatarId={standing.avatarId} size={44} />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <span className="truncate font-display font-bold text-hearth-50">{standing.name}</span>
          <span className="text-[0.65rem] font-bold uppercase tracking-[0.16em] text-dusk-300">
            {standing.kind === 'friend' ? 'friend' : 'house bot'}
          </span>
        </div>
        <p className="mt-0.5 text-sm font-bold text-dusk-100">
          {standing.wins} W · {standing.losses} L · {standing.ties} T
        </p>
        <p className="text-xs text-dusk-200/75">
          {standing.games} {standing.games === 1 ? 'match' : 'matches'} · {rate}% head-to-head
        </p>
      </div>
    </li>
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
