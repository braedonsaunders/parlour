'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { GameArt } from '@/components/GameArt';
import { HowToPlayButton } from '@/components/HowToPlay';
import { GAMES, type GameCatalogEntry } from '@/lib/games';
import { filterGames } from '@/lib/gameSearch';
import modeStyles from '@/styles/modes.module.css';
import gameStyles from '@/styles/games.module.css';

export default function GameSelectPage() {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const visibleGames = useMemo(() => filterGames(GAMES, query), [query]);
  const hasQuery = query.trim().length > 0;
  const resultLabel = hasQuery
    ? `${visibleGames.length} ${visibleGames.length === 1 ? 'game' : 'games'} found`
    : `${GAMES.length} games ready to play`;

  return (
    <main className={gameStyles.page}>
      <header className={gameStyles.header}>
        <Link
          href="/"
          className={`${gameStyles.backLink} pill-soft text-sm font-bold text-dusk-100 hover:text-hearth-200`}
        >
          ← Back
        </Link>
        <div className={gameStyles.heading}>
          <span className={gameStyles.eyebrow}>The game shelf</span>
          <h1 className="font-display text-2xl font-extrabold tracking-tight text-hearth-50">
            Choose your game
          </h1>
        </div>

        <form
          role="search"
          className={gameStyles.search}
          onSubmit={(event) => event.preventDefault()}
        >
          <label htmlFor="game-search" className="sr-only">
            Search games
          </label>
          <svg viewBox="0 0 24 24" aria-hidden="true" className={gameStyles.searchIcon}>
            <circle cx="10.8" cy="10.8" r="6.2" />
            <path d="m15.5 15.5 4.1 4.1" />
          </svg>
          <input
            id="game-search"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search games…"
            autoComplete="off"
            spellCheck={false}
            className={gameStyles.searchInput}
          />
          {hasQuery ? (
            <button
              type="button"
              className={gameStyles.searchClear}
              aria-label="Clear game search"
              onClick={() => setQuery('')}
            >
              ×
            </button>
          ) : null}
        </form>
      </header>

      <section className={gameStyles.library} aria-labelledby="game-library-title">
        <div className={gameStyles.libraryBar}>
          <div>
            <h2 id="game-library-title" className={gameStyles.libraryTitle}>
              Pick a table
            </h2>
            <p className={gameStyles.libraryCopy}>
              Solo, with bots, or around the room with friends.
            </p>
          </div>
          <p className={gameStyles.resultCount} role="status" aria-live="polite">
            {resultLabel}
          </p>
        </div>

        {visibleGames.length > 0 ? (
          <div className={gameStyles.gameGrid} role="list" aria-label="Games">
            {visibleGames.map((game) => (
              <GameTile
                key={game.id}
                def={game}
                onSelect={game.href ? () => router.push(game.href!) : undefined}
              />
            ))}
          </div>
        ) : (
          <div className={gameStyles.emptyState} data-testid="game-search-empty" role="status">
            <span className={gameStyles.emptyMark} aria-hidden="true">
              ♣
            </span>
            <h2>No game on the shelf matches “{query.trim()}”</h2>
            <p>Try a style like trick-taking, shedding, rummy, or slap.</p>
            <button type="button" className="pill-soft" onClick={() => setQuery('')}>
              Show every game
            </button>
          </div>
        )}
      </section>

      <footer className={gameStyles.shelfNote}>
        <span className={gameStyles.shelfHintMark} aria-hidden="true">
          ♠ ♦
        </span>
        <span>
          <strong>More games join the shelf soon.</strong> One engine, many tables.
        </span>
      </footer>
    </main>
  );
}

function GameTile({ def, onSelect }: { def: GameCatalogEntry; onSelect?: () => void }) {
  const shelved = !onSelect;
  return (
    // The rules button is a sibling of the tile, not a child: a tile is itself
    // a button, and nesting one inside another is invalid and unclickable.
    <div className={gameStyles.tileWrap} role="listitem">
      <HowToPlayButton
        doc={def.howToPlay}
        title={def.name}
        subtitle={def.subtitle}
        variant="chip"
        className={gameStyles.tileHelp}
      />
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
        <div className={gameStyles.tileArt}>
          <GameArt cards={def.art} />
        </div>
        <span className={`${modeStyles.tagline} ${gameStyles.tileTagline}`}>{def.tagline}</span>
        <h2 className={`${modeStyles.modeName} ${gameStyles.tileTitle}`}>
          {def.name} <span className={gameStyles.tileSubtitle}>{def.subtitle}</span>
        </h2>
        <span className={`${modeStyles.facts} ${gameStyles.tileFacts}`}>
          {def.facts.map((fact) => (
            <span key={fact} className={modeStyles.fact}>
              {fact}
            </span>
          ))}
        </span>
        <p className={`${modeStyles.description} ${gameStyles.tileDescription}`}>
          {def.description}
        </p>
      </button>
    </div>
  );
}
