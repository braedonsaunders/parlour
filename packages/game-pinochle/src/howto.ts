import type { HowToPlayDoc } from '@parlour/engine';

/** Player-facing instructions rendered verbatim by the app's help modal. */
export const pinochleHowToPlay: HowToPlayDoc = {
  summary: 'The American partnership classic — bid, name trump, meld, then play it out.',
  objective:
    'Sitting across from your partner, win the auction and make good on your bid — meld plus card points at or above what you called. First team to the target score after a completed hand wins.',
  sections: [
    {
      heading: 'The table',
      body: [
        'Four players, two teams: you and the player across from you are partners. Each hand deals the full 48-card double deck — twelve cards each, no widow. The deal rotates left every hand.',
      ],
    },
    {
      heading: 'Bidding',
      body: [
        'Starting left of the dealer, each seat passes or bids higher than the last bid. Once you pass you are out for the hand. The last seat left holding a bid wins the auction and names trump. Everyone passing with no bid at all throws the hand in for a fresh deal from the same dealer.',
      ],
      bullets: [
        { label: 'Opening bid', text: 'must clear the table minimum (25 in Classic)' },
        { label: 'Raises', text: 'any higher integer, up to a hard ceiling of 60' },
      ],
    },
    {
      heading: 'Melding',
      body: [
        'Once trump is named, every seat lays down its meld for points. Cards stay in hand — meld is scoring, not discarding — and the table computes it for you so nobody can misdeclare.',
      ],
      bullets: [
        { label: 'Trump run', text: 'A-10-K-Q-J of trump, 15 points' },
        {
          label: 'Marriage',
          text: 'K+Q of a suit — 4 if trump (2 more if it is a second pair beyond the run), 2 if not',
        },
        {
          label: 'Pinochle',
          text: 'Q♠ + J♦ is 4; both copies of each is a double pinochle worth 30',
        },
        {
          label: 'Arounds',
          text: 'one of a rank in all four suits — Aces 10, Kings 8, Queens 6, Jacks 4',
        },
        { label: 'Dix', text: 'each 9 of trump you hold is worth 1' },
      ],
    },
    {
      heading: 'Playing tricks',
      body: [
        'The bidder leads the first trick. Follow suit if you can; trump beats a led side suit, and the highest card wins otherwise. Aces, tens and kings are worth 10 points each when captured in a trick; the last trick is worth 10 more. The winner of a trick leads the next.',
      ],
    },
    {
      heading: 'Scoring a hand',
      body: [
        'Add the bidding team’s meld to the card points they took. Clear the bid and they bank the whole total. Fall short and they are set — they lose exactly the bid, meld included. The other team always banks their own card points, and their meld too unless the table has turned that off.',
      ],
    },
    {
      heading: 'The match',
      body: [
        'Hands stack until a team reaches the target (100 / 150 / 500). If both teams cross in the same hand, the bidding team wins the match outright unless they were set — a set bidder instead loses the tie-break to the higher score, with the bidder winning any remaining tie.',
      ],
    },
    {
      heading: 'House rules',
      body: [
        'Room settings flip the target score, the minimum opening bid, and whether opponents score their meld. Classic tables keep the defaults.',
      ],
    },
  ],
};
