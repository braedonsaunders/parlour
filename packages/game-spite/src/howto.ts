import type { HowToPlayDoc } from '@parlour/engine';

/** Player-facing instructions rendered verbatim by the app's help modal. */
export const spiteHowToPlay: HowToPlayDoc = {
  summary:
    'Spite & Malice — build the shared centre piles from 1 to 12 and play out your payoff pile before anyone else plays out theirs.',
  objective:
    'Be the first player with an empty payoff pile. Every card you bury in it is a card someone else gets to gloat about.',
  sections: [
    {
      heading: 'The table',
      body: ['Four kinds of cards, four places to put them:'],
      bullets: [
        { label: 'Payoff pile', text: 'your face-down goal stack; the top card is face up' },
        { label: 'Hand', text: 'five cards, refilled to five at the start of your turn' },
        {
          label: 'Discard piles',
          text: 'four personal piles — ending your turn means discarding onto one',
        },
        { label: 'Centre piles', text: 'up to four shared builds everyone plays onto' },
      ],
    },
    {
      heading: 'Your turn',
      body: [
        'First, draw back up to five. Then make as many plays as you like, in any order:',
        'play to a centre pile, play the top of your payoff pile, or play the top of one of your own discard piles.',
        'Your turn only ends when you discard one card from your hand onto one of your discard piles.',
      ],
    },
    {
      heading: 'Building',
      body: [
        'A centre pile starts at a 1 and climbs rank by rank to 12. Every card is just a number — there are no suits and no colours to track.',
        'Complete a pile to 12 and the whole thing is swept back into the draw stock — the pile restarts empty, waiting for a 1 or a wild.',
      ],
    },
    {
      heading: 'Wilds',
      bullets: [
        {
          label: 'Wilds',
          text: 'eighteen in the deck — play one as any rank you need, and that rank is remembered for the pile',
        },
        {
          label: 'Remembered ranks',
          text: 'a wild standing as a 6 makes the next card a 7, whoever plays it',
        },
      ],
    },
    {
      heading: 'The payoff pile',
      body: [
        'Playing your payoff top flips the next card face up immediately — and if that was your last one, you win on the spot, mid-turn, no discard needed.',
        'Stuck with nothing playable? Discard deliberately: what you stack away now is a play you can unlock later.',
      ],
    },
    {
      heading: 'Running dry',
      body: [
        'Completed piles shuffle straight back into the stock, so the deck keeps circulating.',
        'If the stock runs dry at the start of your turn, every half-built centre pile is swept back in too — demands reset to 1 and the buried cards come out of their graves.',
        'If the table still locks up completely, the closest payoff pile to empty takes the game rather than anyone stalling.',
      ],
    },
    {
      heading: 'Ways to play',
      bullets: [
        { label: 'Classic', text: 'the full 30-card payoff race — bring snacks' },
        { label: 'Quick', text: 'a 12-card payoff for a fast grudge match' },
        {
          label: 'Cutthroat',
          text: '20-card payoff and no mid-turn refill: empty your hand early and you play short-handed',
        },
      ],
    },
  ],
};
