import type { HowToPlayDoc } from '@parlour/engine';

/** Player-facing instructions rendered verbatim by the app's help modal. */
export const durakHowToPlay: HowToPlayDoc = {
  summary: 'A short pack, one trump suit, and one job: never be the last seat still holding cards.',
  objective:
    'Empty your hand and stay out for good. Once the stock runs dry, the last seat still holding cards is the Durak.',
  sections: [
    {
      heading: 'The deal',
      body: [
        'Every seat gets six cards from a 36-card pack — six through ace, four suits, no twos through fives.',
        'The next card off the stock is turned up: its suit is trump for the whole hand, and it stays face up until the stock runs out.',
        'Whoever holds the lowest trump attacks first. Nobody has one? Seat one opens.',
      ],
    },
    {
      heading: 'Attacking and defending',
      body: [
        'The attacker plays one card. The defender must beat it: a higher card of the same suit, or any trump if the attack was not one.',
        'Other seats may throw in more cards, as long as the rank already showed up on the table — win or lose, that rank is fair game until the bout ends.',
        'Beat every card and the whole table is cleared, out of the game for good — you attack next.',
        'Cannot beat one? Pick up the entire table into your hand. Play moves on to the seat after you.',
      ],
      bullets: [
        {
          label: 'Attack limit',
          text: 'a defender is never shown more cards than they held when the bout began',
        },
        {
          label: 'Refilling',
          text: 'after every bout, hands top back up to six — attacker first, then the rest, defender last',
        },
      ],
    },
    {
      heading: 'Perevodnoy (transfer)',
      body: [
        'When this house rule is on, a defender who has not yet beaten anything may transfer instead: play a card of the same rank, and the next seat inherits the whole attack.',
      ],
    },
    {
      heading: 'Ending the hand',
      body: [
        'Once the stock is empty, emptying your hand gets you out for good — for keeps, in the order it happens.',
        'The last seat still holding cards is the Durak. Everyone else ranks by how early they got out.',
      ],
    },
  ],
};
