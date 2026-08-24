import type { HowToPlayDoc } from '@parlour/engine';

/** Player-facing instructions rendered verbatim by the app's help modal. */
export const ginHowToPlay: HowToPlayDoc = {
  summary:
    'The classic two-handers — draw, discard and meld your way to a hand worth knocking about.',
  objective:
    'Turn your ten cards into sets and runs so almost nothing is left over, then knock before your opponent does. First seat past the match target wins.',
  sections: [
    {
      heading: 'Melds & deadwood',
      body: [
        'A meld is either three or four of a kind, or three or more cards of the same suit in sequence. Aces are low only (A-2-3, never Q-K-A).',
        'Everything not in a meld is deadwood, counted at face value with faces worth ten and aces one. Lower is better.',
      ],
    },
    {
      heading: 'Your turn',
      body: ['Two steps, every turn:'],
      bullets: [
        { label: 'Draw', text: 'take the top of the stock, or swipe the top of the discard pile' },
        {
          label: 'Discard',
          text: 'slide one card face-up onto the pile — never a card you drew this turn, from either pile',
        },
      ],
    },
    {
      heading: 'The opening upcard',
      body: [
        'After the deal one card sits face up. The non-dealer may take it into their hand, or pass; then the dealer gets the same choice. If both pass, the non-dealer draws from the stock and play begins.',
      ],
    },
    {
      heading: 'Knocking',
      body: [
        'Instead of discarding, you can knock once your deadwood is at or under the knock cap (10 by default). That ends the hand immediately — no discard. Drawing an eleventh card first opens the big-gin line if everything melds.',
      ],
    },
    {
      heading: 'Gin & layoffs',
      body: [
        'Zero deadwood is gin — the defender cannot lay off anything and pays their full deadwood plus the gin bonus.',
        'On a plain knock the defender lays off first: any of their leftover cards that extend a knocker\u2019s set to four or stretch a run at either end slide off the books before the comparison.',
        'If the defender\u2019s deadwood ends up equal to or lower than yours, that is an undercut — they collect the difference plus a bonus instead.',
      ],
    },
    {
      heading: 'Scoring & the match',
      body: [
        'Hands keep coming until someone crosses the match target (100 by default), dealer alternating each hand.',
      ],
      bullets: [
        { label: 'Knock', text: 'difference between deadwoods' },
        { label: 'Undercut', text: 'difference + 25 to the defender' },
        { label: 'Gin', text: 'defenders full deadwood + 25' },
        { label: 'Big gin', text: 'eleven cards all melded — defenders deadwood + 31 (toggle)' },
        { label: 'Box bonus', text: 'optional +25 per hand won, folded in at the end (toggle)' },
      ],
    },
    {
      heading: 'House rules',
      body: ['Every table can be tuned in room settings:'],
      bullets: [
        {
          label: 'Knock cap',
          text: 'how low you must be to knock — tighter caps mean later hands',
        },
        { label: 'Match target', text: '50 for a quick game, 100 classic, more for grinders' },
        { label: 'Big gin / bonuses / box bonus', text: 'the payout dials' },
      ],
    },
    {
      heading: 'Dead hands',
      body: [
        'If the stock falls to two cards, the hand is dead — no score, dealer deals again. Knock sooner.',
      ],
    },
  ],
};
