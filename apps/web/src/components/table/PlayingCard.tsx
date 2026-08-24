import type { CSSProperties } from 'react';
import styles from '@/styles/table.module.css';

const SUITS: Record<string, { glyph: string; name: string }> = {
  S: { glyph: '♠', name: 'spades' },
  H: { glyph: '♥', name: 'hearts' },
  D: { glyph: '♦', name: 'diamonds' },
  C: { glyph: '♣', name: 'clubs' },
};

const RANKS = ['?', 'A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

export type PlayingCardProps = {
  card?: string;
  faceDown?: boolean;
  compact?: boolean;
  disabled?: boolean;
  rotation?: number;
  onClick?: () => void;
  /** Verb announced before the card name when this card is interactive. */
  actionLabel?: string;
};

export function PlayingCard({
  card,
  faceDown = false,
  compact = false,
  disabled = false,
  rotation = 0,
  onClick,
  actionLabel = 'Discard',
}: PlayingCardProps) {
  const parsed = card ? parseCard(card) : null;
  const className = [
    styles.card,
    compact ? styles.cardCompact : '',
    faceDown ? styles.cardBack : styles.cardFace,
    disabled ? styles.cardDisabled : '',
  ]
    .filter(Boolean)
    .join(' ');
  const style = { '--card-rotation': `${rotation}deg` } as CSSProperties;

  /*
   * A stable hook for stylesheets outside this component.
   *
   * `styles.card` is a CSS-module class, so its real name is hashed at build
   * time. Any other module writing `:global(.card)` to reach the card chassis
   * matches nothing and fails silently — which is exactly what had happened to
   * three rules in klondike.module.css, including the one that was supposed to
   * highlight a selected card.
   */
  const chassis = { 'data-card-chassis': '' };

  if (onClick) {
    return (
      <button
        type="button"
        className={className}
        style={style}
        {...chassis}
        onClick={onClick}
        disabled={disabled}
        aria-label={
          faceDown ? 'Face-down card' : `${actionLabel} ${parsed?.label ?? card ?? 'card'}`
        }
      >
        <CardContents parsed={parsed} faceDown={faceDown} />
      </button>
    );
  }

  return (
    <span
      className={className}
      style={style}
      {...chassis}
      aria-label={faceDown ? 'Face-down card' : parsed?.label}
    >
      <CardContents parsed={parsed} faceDown={faceDown} />
    </span>
  );
}

type ParsedCard = { rank: string; glyph: string; red: boolean; label: string };

function parseCard(card: string): ParsedCard {
  const suit = SUITS[card[0] ?? ''];
  const rankIndex = Number.parseInt(card.slice(1), 10);
  const rank = RANKS[rankIndex] ?? (card.slice(1) || '?');
  if (!suit) return { rank, glyph: '✦', red: false, label: card };
  return {
    rank,
    glyph: suit.glyph,
    red: card[0] === 'H' || card[0] === 'D',
    label: `${rank} of ${suit.name}`,
  };
}

function CardContents({ parsed, faceDown }: { parsed: ParsedCard | null; faceDown: boolean }) {
  if (faceDown) {
    return (
      <span className={styles.cardBackInset}>
        <span>p</span>
      </span>
    );
  }

  return (
    <>
      <span className={`${styles.cardIndex} ${parsed?.red ? styles.cardRed : ''}`}>
        <b>{parsed?.rank ?? '?'}</b>
        <i>{parsed?.glyph ?? '✦'}</i>
      </span>
      <span className={`${styles.cardSuit} ${parsed?.red ? styles.cardRed : ''}`}>
        {parsed?.glyph ?? '✦'}
      </span>
    </>
  );
}
