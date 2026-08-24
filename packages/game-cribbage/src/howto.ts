import type { HowToPlayDoc } from '@parlour/engine';

/** Player-facing instructions rendered verbatim by the app's help modal. */
export const cribbageHowToPlay: HowToPlayDoc = {
  summary: 'The classic pub race — build scoring combos in your hand, then peg them home to 121.',
  objective:
    'Be first to peg 121 points on the board. Points come twice: from playing cards to the table (pegging) and from counting your hand and the crib at the show.',
  sections: [
    {
      heading: 'The deal',
      body: [
        'You are dealt six cards. Keep four and slide two face-down into the CRIB — a bonus hand that scores for whoever is dealing this deal.',
        'Throw generously when it is your crib, defensively when it is theirs.',
      ],
    },
    {
      heading: 'The cut',
      body: [
        'The dealer cuts the deck to reveal the starter card, shared by every hand.',
        'Cutting a jack scores HIS HEELS — two points to the dealer on the spot.',
      ],
    },
    {
      heading: 'Pegging',
      body: [
        'Starting left of the dealer, players take turns laying one card, keeping a running count of pip values (faces count 10). You may never push the count past 31.',
        'Score as you play:',
      ],
      bullets: [
        { label: 'Fifteen', text: 'your card makes the running count exactly 15 — 2 points' },
        { label: 'Pair / trip / quad', text: 'match the previous rank — 2 / 6 / 12 points' },
        {
          label: 'Run',
          text: 'three or more cards in sequence regardless of order — 1 point per card',
        },
        { label: 'Thirty-one', text: 'your card makes the count exactly 31 — 2 points' },
        {
          label: 'Go & last card',
          text: 'if nobody can play below 31, the last player to lay a card scores 1 and the count resets',
        },
      ],
    },
    {
      heading: 'The show',
      body: [
        "After pegging, everyone counts aloud: the non-dealer's hand first, then the dealer's, then the crib. The starter counts as a fifth card.",
      ],
      bullets: [
        { label: 'Fifteens', text: 'every combination of cards summing to 15 — 2 points each' },
        { label: 'Pairs', text: 'a pair 2, trips 6, quads 12' },
        { label: 'Runs', text: 'sequences score per card; double runs multiply (7-7-8-9 = 12)' },
        {
          label: 'Flush',
          text: 'four suited cards in your HAND score 4, five with a matching starter. In the CRIB only an all-five flush counts.',
        },
        { label: 'His nobs', text: "a jack of the starter's suit — 1 point" },
      ],
    },
    {
      heading: 'Winning & skunks',
      body: [
        'First to 121 wins, even mid-count. Dealer alternates each deal.',
        'With the skunk rule on, a loser who finishes below 90 is SKUNKED — a proper humiliation worth savouring.',
      ],
    },
    {
      heading: 'House rules',
      body: ['Room settings carry the pub arguments:'],
      bullets: [
        { label: 'Skunks', text: 'call out losers under 90 (default on)' },
        {
          label: 'Muggins',
          text: 'if you fail to claim points you earned at the table, your opponent may steal them (default off) — claim promptly!',
        },
      ],
    },
  ],
};
