'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { GAMES, type GameDef, type GamePreviewKind } from '@/lib/games';
import modeStyles from '@/styles/modes.module.css';
import gameStyles from '@/styles/games.module.css';

export default function GameSelectPage() {
  const router = useRouter();

  return (
    <main className="flex min-h-dvh flex-col">
      <header className="flex items-center justify-between px-6 pt-5">
        <Link href="/" className="pill-soft text-sm font-bold text-dusk-100 hover:text-hearth-200">
          ← Back
        </Link>
        <h1 className="font-display text-xl font-extrabold tracking-tight text-hearth-50">
          Choose your game
        </h1>
        <span className="w-16" aria-hidden="true" />
      </header>

      <div className={`${modeStyles.carousel} ${gameStyles.shelf}`} role="group" aria-label="Games">
        {GAMES.map((game) => (
          <GameTile
            key={game.id}
            def={game}
            onSelect={game.href ? () => router.push(game.href!) : undefined}
          />
        ))}
        <div className={gameStyles.shelfHint}>
          <span className={gameStyles.shelfHintMark} aria-hidden="true">
            ♠ ♦
          </span>
          <p className="text-sm font-bold">More games join the shelf soon</p>
          <p className="text-xs">One engine, many tables.</p>
        </div>
      </div>

      <p className="mx-auto mb-auto max-w-md px-6 pb-8 text-center text-sm text-dusk-100/80">
        parlour is one warm room with a growing shelf of card games. Pick one, then choose how you
        want to play it.
      </p>
    </main>
  );
}

function GameTile({ def, onSelect }: { def: GameDef; onSelect?: () => void }) {
  const shelved = !onSelect;
  return (
    <button
      type="button"
      aria-disabled={shelved}
      data-shelved={shelved}
      data-testid={`game-${def.id}`}
      onClick={onSelect}
      className={`${modeStyles.tile} ${gameStyles.tile}`}
      style={{
        ['--tile-accent' as string]: def.accent,
        ['--tile-accent-soft' as string]: `${def.accent}44`,
        ['--tile-shade' as string]: def.shade,
      }}
    >
      {shelved && <span className={gameStyles.soonRibbon}>Soon</span>}
      <Preview kind={def.preview} />
      <span className={modeStyles.tagline}>{def.tagline}</span>
      <h2 className={modeStyles.modeName}>
        {def.name} <span className="text-base font-bold text-dusk-100/80">· {def.subtitle}</span>
      </h2>
      <span className={modeStyles.facts}>
        {def.facts.map((fact) => (
          <span key={fact} className={modeStyles.fact}>
            {fact}
          </span>
        ))}
      </span>
      <p className={modeStyles.description}>{def.description}</p>
    </button>
  );
}

function Preview({ kind }: { kind: GamePreviewKind }) {
  return (
    <span className={modeStyles.preview}>
      {kind === 'blitz-fan' && (
        <>
          <span className={gameStyles.fanCard}>A♠</span>
          <span className={gameStyles.fanCard}>31</span>
          <span className={gameStyles.fanCard}>K♠</span>
        </>
      )}
      {kind === 'wild-fan' && (
        <>
          <span className={gameStyles.wildCard}>7</span>
          <span className={gameStyles.wildCard}>⤺</span>
          <span className={gameStyles.wildCard}>⊘</span>
          <span className={gameStyles.wildCard}>+4</span>
        </>
      )}
      {kind === 'president-fan' && (
        <>
          <span className={gameStyles.presCard}>3</span>
          <span className={gameStyles.presCard}>♛</span>
          <span className={gameStyles.presCard}>2</span>
        </>
      )}
    </span>
  );
}
