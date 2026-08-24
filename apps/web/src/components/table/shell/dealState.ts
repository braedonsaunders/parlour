import type { DealPresentation } from '@/lib/table/deal-presentation';

export type DealStateAttr = 'dealing' | 'complete' | undefined;

/**
 * The `data-deal-state` value shared by a table root and its hand rail: absent
 * until a deal sequence exists, then `dealing` until the last card lands.
 */
export function dealStateAttr(
  deal: Pick<DealPresentation, 'sequence' | 'complete'>,
): DealStateAttr {
  if (!deal.sequence) return undefined;
  return deal.complete ? 'complete' : 'dealing';
}
