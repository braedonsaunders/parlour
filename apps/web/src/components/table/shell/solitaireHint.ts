/**
 * Whether the Hint control may be pressed.
 *
 * Must not read `view.hint`. That getter runs the solver, and the table
 * already has everything it needs to know a hint can exist: the game is live
 * and there is at least one legal move. Gating on the hint itself is what
 * made Spider stall after every play — the 500k-node search ran on the main
 * thread before the cards could move.
 */
export function canOfferSolitaireHint(
  dealing: boolean,
  view: { stage: string; legal: { readonly length: number } },
): boolean {
  return !dealing && view.stage === 'playing' && view.legal.length > 0;
}
