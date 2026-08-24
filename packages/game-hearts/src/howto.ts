import type { HowToPlayDoc } from '@parlour/engine';

/** Player-facing instructions rendered verbatim by the app's help modal. */
export const heartsHowToPlay: HowToPlayDoc = {
  summary:
    'The classic evasion game — take no hearts, dodge the Black Lady, and let someone else eat the points.',
  objective:
    'Finish the match with the lowest score. Every heart you capture costs 1 point and the queen of spades costs 13; when one player crosses the game-over threshold (100 by default) the lowest total wins.',
  sections: [
    {
      heading: 'The pass',
      body: [
        'Before each hand you pick three cards and slide them to a neighbour — everyone chooses in secret, then all four passes land together.',
        'The direction rotates every hand: left, right, across, then a hold hand with no pass at all.',
      ],
    },
    {
      heading: 'Playing tricks',
      body: [
        'The two of clubs leads the first trick. Follow suit if you can; the highest card of the led suit takes the trick and its winner leads next.',
      ],
      bullets: [
        { label: 'First trick', text: 'no penalty cards may be thrown on it (house-rule toggle)' },
        {
          label: 'Breaking hearts',
          text: 'hearts cannot lead until one has been discarded on an earlier trick — unless your hand is nothing but hearts',
        },
        {
          label: 'Void',
          text: 'out of the led suit? Throw anything — this is where the queen lands on someone',
        },
      ],
    },
    {
      heading: 'Scoring a hand',
      body: [
        'When all thirteen tricks are played, each heart you captured is 1 point and the queen of spades is 13.',
      ],
      bullets: [
        {
          label: 'Jack of diamonds',
          text: 'optional house rule — captures −10 for whoever takes her',
        },
        {
          label: 'Shooting the moon',
          text: 'capture ALL thirteen hearts plus the queen and you score zero while everyone else takes +26 — or, with the other house rule, your own score drops 26',
        },
      ],
    },
    {
      heading: 'The match',
      body: [
        'Hands stack until someone crosses the game-over line (50 / 75 / 100). Lowest total wins the match; ties share the crown.',
      ],
    },
    {
      heading: 'House rules',
      body: [
        'Room settings tune everything: pass direction, hold hands, first-trick protection, the jack of diamonds, the game-over threshold and the moon shift. Classic tables keep the defaults.',
      ],
    },
  ],
};
