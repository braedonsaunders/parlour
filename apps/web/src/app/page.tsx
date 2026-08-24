'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { motion } from 'motion/react';
import { AvatarBadge } from '@/components/AvatarBadge';
import { MainMenuMuteButton } from '@/components/MainMenuMuteButton';
import { PwaInstall } from '@/components/PwaInstall';
import { ScenePicker } from '@/components/backgrounds/ScenePicker';
import { useAudioManager } from '@/stores/audio';
import { useProfileStore } from '@/stores/profile';
import { getAvatar } from '@/lib/avatars';

const EASE_POP = [0.34, 1.56, 0.64, 1] as const;

const rise = {
  hidden: { opacity: 0, y: 26, scale: 0.96 },
  shown: (delay: number) => ({
    opacity: 1,
    y: 0,
    scale: 1,
    transition: { delay, duration: 0.24, ease: EASE_POP },
  }),
};

export default function TitlePage() {
  const router = useRouter();
  useAudioManager();
  const name = useProfileStore((s) => s.name);
  const avatarId = useProfileStore((s) => s.avatarId);

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-5 px-6 text-center">
      <MainMenuMuteButton />

      <Link
        href="/profile"
        aria-label="Open your profile"
        className="pill-soft chrome-ne fixed z-30 flex items-center gap-2 transition-transform duration-150 ease-pop hover:-translate-y-0.5"
      >
        <AvatarBadge avatarId={avatarId} size={28} />
        <span className="max-w-[9rem] truncate text-sm font-semibold text-dusk-100">
          {name || 'Profile'}
        </span>
      </Link>

      <motion.p
        variants={rise}
        initial="hidden"
        animate="shown"
        custom={0}
        className="pill-soft font-display text-xs uppercase tracking-[0.35em] text-dusk-200"
      >
        pull up a chair
      </motion.p>

      <h1 aria-label="parlour" className="-my-8">
        {/* eslint-disable-next-line @next/next/no-img-element -- static asset with baked-in SVG animation; next/image would proxy it needlessly */}
        <img
          src="/parlour-logo-home.svg"
          alt=""
          draggable={false}
          className="pointer-events-none w-[min(84vw,27rem)] select-none"
        />
      </h1>

      <motion.p
        variants={rise}
        initial="hidden"
        animate="shown"
        custom={0.12}
        className="max-w-md text-balance text-dusk-100/90"
      >
        A cozy card game engine for quick rounds and loud victories.
      </motion.p>

      <motion.div
        variants={rise}
        initial="hidden"
        animate="shown"
        custom={0.18}
        className="mt-3 flex flex-col items-center gap-3"
      >
        <button
          type="button"
          onClick={() => router.push('/games')}
          className="btn-fat w-64 text-lg"
          data-testid="play"
        >
          Play
        </button>
        <Link
          href="/join"
          className="pill-soft text-sm font-bold text-dusk-100 transition-transform duration-150 ease-pop hover:-translate-y-0.5 hover:text-hearth-200"
        >
          Have a room code? Join a table →
        </Link>
        <PwaInstall />
        <span className="pill-soft mt-1 cursor-default select-none text-xs uppercase tracking-[0.25em] text-dusk-200">
          a growing shelf of card games
        </span>
      </motion.div>

      <ScenePicker />

      <span className="sr-only">{getAvatar(avatarId).name}</span>
    </main>
  );
}
