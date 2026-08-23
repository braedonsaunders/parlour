'use client';

import Link from 'next/link';

export default function CreateRoomPage() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-5 px-6 text-center">
      <Link
        href="/"
        className="pill-soft absolute left-5 top-5 text-sm font-bold text-dusk-100 hover:text-hearth-200"
      >
        ← Back
      </Link>

      <span className="text-5xl" aria-hidden="true">
        🚪
      </span>
      <h1 className="font-display text-3xl font-extrabold tracking-tight text-hearth-50">
        Friend tables are still setting up
      </h1>
      <p className="max-w-md text-balance text-dusk-100/90">
        Rooms with shareable codes arrive with parlour&apos;s multiplayer update. The table is warm
        right now, though — the bots are shuffling.
      </p>

      <div className="mt-2 flex flex-wrap items-center justify-center gap-3">
        <Link href="/play" className="btn-fat">
          Play solo instead
        </Link>
        <Link href="/join" className="btn-fat btn-fat--ghost">
          I have a code anyway
        </Link>
      </div>
    </main>
  );
}
