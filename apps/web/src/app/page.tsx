export default function Home() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-6 px-6 text-center">
      <p className="pill-soft font-display text-xs uppercase tracking-[0.35em] text-dusk-200">
        pull up a chair
      </p>

      <h1 className="text-warm-glow font-display text-7xl font-extrabold leading-none tracking-tight text-hearth-50 sm:text-8xl">
        parlour
      </h1>

      <p className="max-w-md text-balance text-dusk-100/90">
        A cozy little table in a small warm world. Blitz deals first — thirty-one, knocks, and one
        very loud celebration.
      </p>

      <div className="mt-2 flex flex-wrap items-center justify-center gap-3">
        <span className="btn-fat cursor-default select-none">Opening soon</span>
        <span className="btn-fat btn-fat--ghost cursor-default select-none">Blitz · 31</span>
      </div>
    </main>
  );
}
