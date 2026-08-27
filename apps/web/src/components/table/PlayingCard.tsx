import type { CSSProperties } from 'react';
import styles from '@/styles/table.module.css';

const SUITS: Record<string, { glyph: string; name: string }> = {
  S: { glyph: '♠', name: 'spades' },
  H: { glyph: '♥', name: 'hearts' },
  D: { glyph: '♦', name: 'diamonds' },
  C: { glyph: '♣', name: 'clubs' },
};

const RANKS = ['?', 'A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

/** Pinochle (and any double-deck) ids: `SQ-1`, `S10-0`, `HA-1`. */
const COPY_ID = /^([SHDC])(A|K|Q|J|10|[2-9])-\d+$/;

/**
 * A face supplied by a game pack, for decks the shared parser cannot read.
 *
 * `parseCard` reads standard `S1`..`C13` ids and copy-suffixed ids like
 * `SQ-1`. A pack with its own deck — Spite's four-colour cards, say — would
 * otherwise render as the raw id with its first character eaten. Passing the
 * pack's own `DeckDef.faces` entry keeps the card component shared without
 * teaching it every deck on the shelf.
 */
export type CardFaceHint = {
  short: string;
  label: string;
  color?: string;
};

export type PlayingCardProps = {
  card?: string;
  face?: CardFaceHint;
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
  face,
  faceDown = false,
  compact = false,
  disabled = false,
  rotation = 0,
  onClick,
  actionLabel = 'Discard',
}: PlayingCardProps) {
  const parsed = face ? faceToParsed(face) : card ? parseCard(card) : null;
  const className = [
    styles.card,
    compact ? styles.cardCompact : '',
    faceDown ? styles.cardBack : styles.cardFace,
    disabled ? styles.cardDisabled : '',
  ]
    .filter(Boolean)
    .join(' ');
  const style = {
    '--card-rotation': `${rotation}deg`,
    ...(parsed?.ink ? { '--card-ink': parsed.ink, color: parsed.ink } : {}),
  } as CSSProperties;

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

type ParsedCard = { rank: string; glyph: string; red: boolean; label: string; ink?: string };

/**
 * Ink for a pack's own colour names. A four-colour deck has no suits to lean
 * on, so the pip is a plain dot and the colour is the whole distinction —
 * which means it has to actually be the colour.
 */
const PACK_INK: Readonly<Record<string, string>> = {
  red: '#c2593f',
  yellow: '#e0a33f',
  green: '#4f9d6e',
  blue: '#4b8fba',
};

function faceToParsed(face: CardFaceHint): ParsedCard {
  return {
    rank: face.short,
    glyph: face.color ? '●' : '✦',
    // `red` drives the shared red-suit class; a pack colour is painted from
    // `ink` instead, so this stays false for non-standard decks.
    red: false,
    ink: face.color ? PACK_INK[face.color] : undefined,
    label: face.label,
  };
}

function parseCard(card: string): ParsedCard {
  const copy = COPY_ID.exec(card);
  if (copy) {
    const suitLetter = copy[1] ?? '';
    const rank = copy[2] ?? '?';
    const suit = SUITS[suitLetter];
    if (!suit) return { rank, glyph: '✦', red: false, label: card };
    return {
      rank,
      glyph: suit.glyph,
      red: suitLetter === 'H' || suitLetter === 'D',
      label: `${rank} of ${suit.name}`,
    };
  }

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
