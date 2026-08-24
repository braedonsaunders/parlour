import type { HowToPlayDoc } from '@parlour/engine';

/** Player-facing instructions rendered verbatim by the app's help modal. */
export const wildpileHowToPlay: HowToPlayDoc = {
  summary:
    'A 112-card shedding riot — match the top of the pile, unleash action cards, and dump your hand first.',
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
        {
          label: 'Drop All',
          text: 'discard every card in your hand of its color beneath it; swept action cards do not fire',
        },
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
      heading: 'The clocks',
      body: [
        'Every turn is timed. If its clock reaches zero, the table makes a legal play for that player so the pile keeps moving.',
        'The deal has a match clock too. During its final minute, live first-through-fourth places appear and update as hands change.',
      ],
      bullets: [
        {
          label: 'At match zero',
          text: 'fewest cards wins; equal hand sizes are settled in seat order so every replay has one clear result',
        },
        {
          label: 'Advanced options',
          text: 'set the seconds per turn and total match minutes before the deal',
        },
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
        'Empty your hand to win before the match clock expires. Otherwise, the lightest remaining hand wins at zero.',
      ],
    },
  ],
};
