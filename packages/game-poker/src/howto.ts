import type { HowToPlayDoc } from '@parlour/engine';

/** Player-facing instructions rendered verbatim by the app's help modal. */
export const pokerHowToPlay: HowToPlayDoc = {
  summary:
    'No-limit Texas hold’em, played as a sit-and-go — everyone starts level, the blinds climb, and the last stack standing wins.',
  objective:
    'Win all the chips. Each hand you are dealt two cards of your own and share five in the middle; the best five-card hand takes the pot, and anyone who runs out of chips is out of the match.',
  sections: [
    {
      heading: 'The chips',
      body: [
        'Chips are scorekeeping, not stakes — there is nothing to buy and nothing to cash out. Everyone starts with the same stack, and the match ends when one player has all of them.',
      ],
    },
    {
      heading: 'A hand',
      body: [
        'Two cards face down to every seat, then a betting round. Three community cards (the flop), a round. A fourth (the turn), a round. A fifth (the river), a last round. Anyone still in shows down, and the best five cards out of the seven available win.',
      ],
      bullets: [
        { label: 'The button', text: 'marks the dealer and moves one seat left every hand' },
        {
          label: 'Blinds',
          text: 'the two seats left of the button put chips in before the cards come out, so there is always something to play for',
        },
      ],
    },
    {
      heading: 'Your turn',
      body: ['When the action is on you, there are only ever four things you can do.'],
      bullets: [
        { label: 'Fold', text: 'give up the hand and whatever you have already put in' },
        { label: 'Check', text: 'stay in without putting chips in — only when nothing is owed' },
        { label: 'Call', text: 'match the current bet' },
        {
          label: 'Bet / raise',
          text: 'put in more, which everyone else must match to stay in. A raise must be at least the size of the last one — unless you are betting everything you have left',
        },
      ],
    },
    {
      heading: 'All in',
      body: [
        'You can never lose more than what is in front of you. Betting your last chip is going all in: you stay in the hand to the end, and any bet larger than your stack builds a side pot you cannot win and cannot lose.',
      ],
    },
    {
      heading: 'Hand rankings',
      body: [
        'Best to worst. Ties are broken by the next highest card, and a true tie splits the pot.',
      ],
      bullets: [
        { label: 'Straight flush', text: 'five in a row, one suit — ace high is a royal flush' },
        { label: 'Four of a kind', text: 'all four of one rank' },
        { label: 'Full house', text: 'three of one rank and two of another' },
        { label: 'Flush', text: 'five of one suit' },
        { label: 'Straight', text: 'five in a row — the ace plays high or low' },
        { label: 'Three of a kind', text: 'three of one rank' },
        { label: 'Two pair', text: 'two of one rank and two of another' },
        { label: 'Pair', text: 'two of one rank' },
        { label: 'High card', text: 'none of the above' },
      ],
    },
    {
      heading: 'The match',
      body: [
        'The blinds go up on a schedule, so folding forever is not a plan — a match always ends. Bust and you are out; the last player with chips wins, and everyone else finishes in the order they went out.',
      ],
    },
    {
      heading: 'House rules',
      body: [
        'Room settings choose the starting stack, how fast the blinds climb, whether the big blind posts a table ante from the third level, and whether beaten hands are turned over at showdown or mucked face down.',
      ],
    },
  ],
};
