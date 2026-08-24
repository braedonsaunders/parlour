import type { HowToPlayDoc } from '@parlour/engine';

/** Player-facing instructions rendered verbatim by the app's help modal. */
export const ohhellHowToPlay: HowToPlayDoc = {
  summary:
    'Bid the exact number of tricks you will take — no more, no fewer. The deck shrinks and grows every round until someone out-bids the table.',
  objective:
    'Across a match of growing-then-shrinking hands, score more than anyone else by making your bid exactly. One player is mathematically doomed every round — try not to be that player.',
  sections: [
    {
      heading: 'The table',
      body: [
        'Three to seven players, everyone for themselves. A match is a sequence of rounds; round one deals one card each, then hands grow to a peak (capped so a trump card always fits) and come back down to one. The deal rotates clockwise every round.',
      ],
    },
    {
      heading: 'The flip',
      body: [
        'After the deal, the next card off the stock is turned face up — its suit is trump for the round.',
      ],
      bullets: [
        {
          label: 'No card left',
          text: 'when the deal used the whole deck there is nothing to turn and the round is played no-trump',
        },
        {
          label: 'Cut trump',
          text: 'tables with “cut trump” set instead shrink the full-deck round by one card so a trump can still be cut from the bottom',
        },
      ],
    },
    {
      heading: 'Bidding',
      body: [
        'Starting left of the dealer and moving clockwise, each seat names one number from 0 up to their hand size: exactly how many tricks they claim they will take. There is no pass and no second chance.',
      ],
      bullets: [
        {
          label: 'The hook rule',
          text: 'the dealer bids LAST and may not make the total bid equal the tricks available — one player at this table is guaranteed to miss. The forbidden bid is simply not on your dial',
        },
        { label: 'Zero', text: 'a legal bid like any other: take no tricks at all' },
      ],
    },
    {
      heading: 'Playing tricks',
      body: [
        'Left of the dealer leads the first trick. Follow suit if you can; the highest trump wins, otherwise the highest card of the led suit. The trick’s winner leads the next one.',
      ],
    },
    {
      heading: 'Scoring a round',
      body: [
        'Make your bid EXACTLY or score nothing (default). Every seat’s round score joins their running total; after the last round of the arc the highest total wins.',
      ],
      bullets: [
        { label: 'Exact only', text: 'exactly right scores 10 + bid; anything else scores 0' },
        {
          label: 'Penalty',
          text: 'exactly right scores 10 + bid; missing costs minus the size of your miss',
        },
        { label: 'Plus one', text: 'exactly right scores double your bid; anything else scores 0' },
      ],
    },
    {
      heading: 'Wizard variant',
      body: [
        'With Wizards & Jesters on, four Wizards and four Jesters join the deck (60 cards) and bend the usual order of things.',
      ],
      bullets: [
        {
          label: 'Wizard',
          text: 'beats everything; the FIRST Wizard played takes the trick. Leading one leaves the trick without a led suit — anyone may play anything',
        },
        {
          label: 'Jester',
          text: 'loses to everything; if all cards in a trick are Jesters the first one wins. Leading one defers the led suit to the next real card',
        },
        {
          label: 'Trump flip',
          text: 'a turned Wizard lets the DEALER pick trump; a turned Jester means the round is no-trump',
        },
      ],
    },
  ],
};
