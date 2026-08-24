'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import type { GameArtCard, HowToPlayDoc } from '@parlour/engine';
import { GameArt } from '@/components/GameArt';
import { HowToPlayButton } from '@/components/HowToPlay';
import { useCenteredCarousel } from '@/hooks/useCenteredCarousel';
import styles from '@/styles/modes.module.css';
import gameStyles from '@/styles/games.module.css';

/**
 * The pre-game screen every game shares.
 *
 * A setup page is the same program eleven times over: a header with the way
 * back and the rules sheet, a carousel of modes to choose between, and a footer
 * holding whatever that game needs to settle before it deals. Every page had
 * its own copy, and the copies drifted — most of them framed the screen as a
 * document that starts at `pt-5`, which on an iPhone in portrait tucks the back
 * link underneath the status bar, where it cannot be tapped. Blitz was the one
 * page that had been moved onto the fixed app frame, so Blitz was the one page
 * that worked.
 *
 * Only four things ever genuinely differed — the copy, whether the game has a
 * rules sheet, what a tile draws for artwork, and what sits in the footer — and
 * those are the props. The frame itself, `modes.module.css`'s `fit*` block, is
 * now written once: safe-area insets on the header, the carousel taking the
 * slack, and a footer that scrolls inside itself instead of shoving the header
 * off the top of the screen.
 */

/** The tile presentation every game's mode list already shares. */
export interface SetupMode {
  id: string;
  name: string;
  tagline: string;
  description: string;
  facts: readonly string[];
  accent: string;
  art?: readonly GameArtCard[];
  motif?: string;
}

export interface SetupHelp {
  doc: HowToPlayDoc;
  /** The trailing qualifier on the rules sheet — "the pegging race". */
  subtitle: string;
}

export interface GameSetupScreenProps<TMode extends SetupMode> {
  /** The game's name, as the heading and the rules sheet title. */
  title: string;
  /** The second half of the heading — "pick your table", "claim the crown". */
  eyebrow: string;
  /** The rules sheet. Also hangs a help chip on every mode tile. */
  help?: SetupHelp;
  modes: readonly TMode[];
  /** What the carousel is choosing between, for screen readers. */
  modesLabel: string;
  selected: string;
  onSelect(id: string): void;
  /**
   * Artwork for a game whose tiles draw something other than the pack's card
   * fan — Gin's bespoke previews, Solitaire's clock face.
   */
  renderArt?(mode: TMode): ReactNode;
  /** Test id for a tile, for pages whose tests pick a mode by name. */
  modeTestId?(mode: TMode): string;
  /** Seats, bot skill, house rules and the actions. */
  children: ReactNode;
}

export function GameSetupScreen<TMode extends SetupMode>({
  title,
  eyebrow,
  help,
  modes,
  modesLabel,
  selected,
  onSelect,
  renderArt,
  modeTestId,
  children,
}: GameSetupScreenProps<TMode>) {
  const carouselRef = useCenteredCarousel(selected);

  return (
    <main className={styles.fitScreen}>
      <header className={styles.fitHeader}>
        <Link
          href="/games"
          className="pill-soft text-sm font-bold text-dusk-100 hover:text-hearth-200"
        >
          ← Games
        </Link>
        <h1
          className={`${styles.fitHeading} font-display font-extrabold tracking-tight text-hearth-50`}
        >
          {title} <span className={`${styles.fitEyebrow} text-dusk-100/80`}>· {eyebrow}</span>
        </h1>
        {help ? (
          <HowToPlayButton doc={help.doc} title={title} subtitle={help.subtitle} />
        ) : (
          <span className={styles.fitHeaderSpacer} aria-hidden="true" />
        )}
      </header>

      <div
        ref={carouselRef}
        className={`${styles.carousel} ${styles.centeredCarousel} ${styles.fitCarousel}`}
        role="radiogroup"
        aria-label={modesLabel}
      >
        {modes.map((mode) => (
          <ModeTile
            key={mode.id}
            mode={mode}
            game={title}
            help={help}
            selected={mode.id === selected}
            onSelect={() => onSelect(mode.id)}
            art={renderArt ? renderArt(mode) : <GameArt cards={mode.art} motif={mode.motif} />}
            testId={modeTestId?.(mode)}
          />
        ))}
      </div>

      <section className={styles.fitFooter} aria-label="Table setup">
        <div className={styles.fitFooterInner}>{children}</div>
      </section>
    </main>
  );
}

function ModeTile<TMode extends SetupMode>({
  mode,
  game,
  help,
  selected,
  onSelect,
  art,
  testId,
}: {
  mode: TMode;
  game: string;
  help?: SetupHelp;
  selected: boolean;
  onSelect: () => void;
  art: ReactNode;
  testId?: string;
}) {
  return (
    <div className={gameStyles.tileWrap}>
      {help && (
        <HowToPlayButton
          doc={help.doc}
          title={mode.name}
          subtitle={`${game} · ${mode.tagline}`}
          variant="chip"
          className={gameStyles.tileHelp}
        />
      )}
      <button
        type="button"
        role="radio"
        aria-checked={selected}
        data-selected={selected}
        data-testid={testId}
        onClick={onSelect}
        className={styles.tile}
        style={{
          ['--tile-accent' as string]: mode.accent,
          ['--tile-accent-soft' as string]: `${mode.accent}44`,
        }}
      >
        <span className={styles.tileGlow} />
        {art}
        <span className={styles.tagline}>{mode.tagline}</span>
        <h2 className={styles.modeName}>{mode.name}</h2>
        <span className={styles.facts}>
          {mode.facts.map((fact) => (
            <span key={fact} className={styles.fact}>
              {fact}
            </span>
          ))}
        </span>
        <p className={styles.description}>{mode.description}</p>
      </button>
    </div>
  );
}
