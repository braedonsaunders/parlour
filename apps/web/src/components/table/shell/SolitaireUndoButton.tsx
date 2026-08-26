'use client';

import { useT } from '@/lib/i18n';

export interface SolitaireUndoButtonProps {
  depth: number;
  disabled?: boolean;
  onUndo?: () => void;
  testId: string;
}

export function SolitaireUndoButton({
  depth,
  disabled = false,
  onUndo,
  testId,
}: SolitaireUndoButtonProps) {
  const t = useT();
  return (
    <button
      type="button"
      className="btn-fat btn-fat--ghost"
      data-testid={testId}
      onClick={onUndo}
      disabled={disabled || depth === 0}
    >
      {t.count('solitaire.undoMoves', depth)}
    </button>
  );
}
