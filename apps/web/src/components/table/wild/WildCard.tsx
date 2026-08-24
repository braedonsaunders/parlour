import type { CSSProperties } from 'react';
import { wildpileFace, type WildpileFace } from '@parlour/game-wildpile';
import tableStyles from '@/styles/table.module.css';
import wildStyles from '@/styles/wild.module.css';

export type WildCardProps = {
  card?: string;
  faceDown?: boolean;
  compact?: boolean;
  disabled?: boolean;
  rotation?: number;
  onClick?: () => void;
};

/** Wild deck skin over the shared card chassis (size/border/hover from table.module.css). */
export function WildCard({
  card,
  faceDown = false,
  compact = false,
  disabled = false,
  rotation = 0,
  onClick,
}: WildCardProps) {
  const face = !faceDown && card ? safeFace(card) : null;
  const className = [
    tableStyles.card,
    compact ? tableStyles.cardCompact : '',
    disabled ? tableStyles.cardDisabled : '',
    faceDown ? wildStyles.back : wildStyles.face,
    face ? colorClass(face) : '',
  ]
    .filter(Boolean)
    .join(' ');
  const style = { '--card-rotation': `${rotation}deg` } as CSSProperties;
  const label = faceDown ? 'Face-down card' : (face?.label ?? card ?? 'card');

  if (onClick) {
    return (
      <button
        type="button"
        className={className}
        style={style}
        onClick={onClick}
        disabled={disabled}
        aria-label={`Play ${label}`}
      >
        <CardContents face={face} faceDown={faceDown} />
      </button>
    );
  }

  return (
    <span className={className} style={style} aria-label={label}>
      <CardContents face={face} faceDown={faceDown} />
    </span>
  );
}

function safeFace(card: string): WildpileFace | null {
  try {
    return wildpileFace(card);
  } catch {
    return null;
  }
}

function colorClass(face: WildpileFace): string {
  if (!face.color) return wildStyles.wildFace ?? '';
  return (
    {
      red: wildStyles.red,
      yellow: wildStyles.yellow,
      green: wildStyles.green,
      blue: wildStyles.blue,
    }[face.color] ?? ''
  );
}

function CardContents({ face, faceDown }: { face: WildpileFace | null; faceDown: boolean }) {
  if (faceDown) {
    return (
      <span className={wildStyles.backInset}>
        <span>W</span>
      </span>
    );
  }
  if (!face) {
    return <span className={wildStyles.pip}>?</span>;
  }
  const short = face.short ?? '?';
  return (
    <>
      {face.color && <i className={wildStyles.pipPlate} aria-hidden="true" />}
      <span className={wildStyles.corner} aria-hidden="true">
        {short}
      </span>
      <span className={wildStyles.pip} aria-hidden="true">
        {face.meta.kind === 'wild' ? <small>WILD</small> : short}
      </span>
    </>
  );
}
