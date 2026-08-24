import type { HowToPlayDoc } from '@parlour/engine';

/** Player-facing instructions rendered verbatim by the app's help modal. */
export const blitzHowToPlay: HowToPlayDoc = {
  summary: 'The pub classic 31 — draw, swap and knock your way to one suit worth 31.',
  objective:
    'Hold a hand worth more than everyone else when the round ends. Hands score their best single suit: A=11, faces=10, pips face value. 31 in one suit is a BLITZ and wins on the spot.',
  sections: [
    {
      heading: 'Your turn',
      body: ['You get two actions:'],
      bullets: [
        {
          label: 'Draw',
          text: 'take the top card of the stock, or swipe the top of the discard pile',
        },
        { label: 'Discard', text: 'slide one card from your hand face-up onto the pile' },
      ],
    },
    {
      heading: 'Scoring a hand',
      body: [
        'Only your best suit counts. Three hearts totalling 27 beat three mixed cards totalling 30.',
        'Three of a kind is a special hand worth 30½ (house-rule toggle).',
      ],
    },
    {
      heading: 'Knocking',
      body: [
        'Instead of drawing, you may KNOCK to end the round. Everyone else gets exactly one more turn, then hands flip for the showdown.',
        'Lowest hand loses a life. If YOU knocked and tie or land lowest, the penalty is yours — knock with confidence.',
      ],
    },
    {
      heading: 'Blitz!',
      body: [
        'Hold 31 in one suit and the round detonates instantly — every other player loses a life, no showdown.',
        'Dealt a Blitz before your first turn? It counts. Feel free to gloat.',
      ],
    },
    {
      heading: 'Match formats',
      bullets: [
        { label: 'Classic', text: 'lose a life each round loss; last player with lives wins' },
        { label: 'Fast', text: 'single rounds, first-to-N win counter, instant redeals' },
        {
          label: 'Timed',
          text: 'match clock, forced turn timers, most round-wins at the buzzer takes it',
        },
      ],
    },
    {
      heading: 'House rules',
      body: [
        'Every table can be tuned in room settings — lives, knock penalties, ties, three-of-a-kind, discard locks and turn timers all live there.',
      ],
    },
  ],
};
