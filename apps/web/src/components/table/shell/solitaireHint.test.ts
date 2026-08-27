import { describe, expect, it } from 'vitest';
import { canOfferSolitaireHint } from './solitaireHint';

describe('canOfferSolitaireHint', () => {
  it('offers a hint only while the table is live and has a legal move', () => {
    expect(canOfferSolitaireHint(false, { stage: 'playing', legal: [{}] })).toBe(true);
    expect(canOfferSolitaireHint(true, { stage: 'playing', legal: [{}] })).toBe(false);
    expect(canOfferSolitaireHint(false, { stage: 'won', legal: [{}] })).toBe(false);
    expect(canOfferSolitaireHint(false, { stage: 'playing', legal: [] })).toBe(false);
  });
});
