import type { HowToPlayDoc } from '@parlour/engine';

/** Player-facing instructions rendered verbatim by the app's help modal. */
export const wildpileHowToPlay: HowToPlayDoc = {
  summary:
    'A 108-card shedding riot — match the top of the pile, unleash action cards, and dump your hand first.',
  objective:
    'Be the first player with no cards left. Action cards slow everyone else down — unless they fight back.',
  sections: [
    {
      heading: 'Playing a card',
      body: [
        'On your turn, play one card that matches the top of the pile by color or by face, or draw instead.',
        'Wilds can be played anytime and let you choose the next color.',
      ],
    },
    {
      heading: 'Action cards',
      bullets: [
        { label: 'Skip', text: 'the next player loses their turn — and cannot jump back in' },
        { label: 'Reverse', text: 'play flips direction; head-to-head it hands you another turn' },
        { label: 'Draw Two', text: 'the next player picks up two and loses the turn' },
        { label: 'Wild', text: 'play it anytime and call the next color' },
        { label: 'Wild Draw Four', text: 'call the color AND hand the next player four cards' },
        {
          label: 'Wild Swap Hands',
          text: 'call the color, then trade hands with anyone (optional card)',
        },
        { label: 'Wild Shuffle Hands', text: 'pool every hand, shuffle, redeal (optional card)' },
      ],
    },
    {
      heading: 'Last card',
      body: [
        'Down to two cards? Hit "Last card!" before you play. Reach one card without calling it and you are caught for two.',
        'Drawing puts you back above the line, so the call has to be made again.',
      ],
    },
    {
      heading: 'House chaos',
      body: ['Every table setting lives under Advanced options before the deal:'],
      bullets: [
        {
          label: 'Stacking',
          text: 'answer a Draw Two / Draw Four with the same card and the penalty piles up for the next victim',
        },
        {
          label: 'Jump in',
          text: 'holding the exact same face as the card just played? Slam it down out of turn before anyone reacts',
        },
        {
          label: 'Draw until playable',
          text: 'keep drawing until something matches instead of drawing one',
        },
        { label: 'Force play', text: 'a card you drew that can be played must be played' },
        {
          label: 'Challenge Draw Fours',
          text: 'a Draw Four is only honest with nothing in the old colour — call the bluff and they take the pile, get it wrong and you take two more',
        },
        {
          label: 'Sevens and zeroes',
          text: 'a 7 swaps your hand with a player you name; a 0 passes every hand one seat along',
        },
        { label: 'Swap-hand wilds', text: 'deals in Wild Swap Hands and Wild Shuffle Hands' },
      ],
    },
    {
      heading: 'Winning',
      body: [
        'Empty your hand to win the deal. Rankings follow how many cards everyone else was still holding when you went out.',
      ],
    },
  ],
};
