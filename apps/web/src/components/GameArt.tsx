import type { CSSProperties, ReactNode } from 'react';
import type { GameArtCard } from '@parlour/engine';
import modeStyles from '@/styles/modes.module.css';
import gameStyles from '@/styles/games.module.css';

export type GameArtProps = {
  /** Faces to fan, front to back. Comes from the pack's catalog entry. */
  cards?: readonly GameArtCard[];
  /** A named illustration to draw instead of the fan, if the app knows it. */
  motif?: string;
};

/**
 * Illustrations a pack can ask for by name. Keyed on the motif a catalog entry
 * declares rather than on a game id, so nothing here knows which game it is
 * drawing for and a pack that wants none of them gets the card fan.
 */
const MOTIFS: Record<string, ReactNode> = {
  lives: (
    <span className={modeStyles.chipRow}>
      <span className={modeStyles.lifeChip} />
      <span className={modeStyles.lifeChip} />
      <span className={modeStyles.lifeChip} />
    </span>
  ),
  snap: (
    <>
      <span className={modeStyles.snapPile} />
      <span className={modeStyles.snapCard}>31</span>
      <span className={modeStyles.snapCard}>K♠</span>
    </>
  ),
  clock: (
    <span className={modeStyles.clockFace}>
      <span className={modeStyles.clockHand} />
      <span className={modeStyles.clockTick} />
    </span>
  ),
};

/**
 * Tile artwork, drawn from a pack's declared card faces. A tinted card gets the
 * loud treatment and an untinted one the muted paper card, so a game pack
 * chooses how it looks on the shelf without shipping any React.
 */
export function GameArt({ cards = [], motif }: GameArtProps) {
  const illustration = motif ? MOTIFS[motif] : undefined;
  if (illustration) {
    return (
      <span className={modeStyles.preview} aria-hidden="true">
        {illustration}
      </span>
    );
  }
  if (cards.length === 0) return <span className={modeStyles.preview} aria-hidden="true" />;

  return (
    <span className={modeStyles.preview} aria-hidden="true">
      {cards.map((card, index) => (
        <span
          key={`${card.label}:${index}`}
          className={card.tint ? gameStyles.wildCard : gameStyles.fanCard}
          style={
            card.tint
              ? ({ '--art-from': card.tint[0], '--art-to': card.tint[1] } as CSSProperties)
              : undefined
          }
        >
          {card.label}
        </span>
      ))}
    </span>
  );
}
