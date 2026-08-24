import type { HowToPlayDoc } from '@parlour/engine';

/** Player-facing instructions rendered verbatim by the app's help modal. */
export const spadesHowToPlay: HowToPlayDoc = {
  summary: 'The American partnership classic — bid your books, break spades, and race to 500.',
  objective:
    'Sitting across from your partner, take at least as many tricks as you bid together. First team to the target score (500 by default) wins; a tie at or above the line plays another hand.',
  sections: [
    {
      heading: 'The table',
      body: [
        'Four players, two teams: you and the player across from you are partners. Each hand deals the full 52-card deck — thirteen cards each. The deal and the first bid both start left of the dealer and move clockwise.',
      ],
    },
    {
      heading: 'Bidding',
      body: [
        'Every seat names one number, once. There is no pass and no rebid. Your team’s contract is the sum of the two non-nil bids.',
      ],
      bullets: [
        { label: '1–13', text: 'how many tricks you expect to take' },
        {
          label: 'Nil',
          text: 'a separate bid — take no tricks for +100, or −100 if you take any. Failed-nil tricks do not help your partner make their contract, but each one is still a bag',
        },
      ],
    },
    {
      heading: 'Playing tricks',
      body: [
        'Left of the dealer leads the first trick. Follow suit if you can; the highest spade wins, otherwise the highest card of the led suit. The winner leads the next trick.',
      ],
      bullets: [
        {
          label: 'Breaking spades',
          text: 'a spade cannot lead until someone has sloughed one while void — unless your remaining hand is nothing but spades',
        },
        { label: 'Void', text: 'out of the led suit? Play anything, including a trump' },
      ],
    },
    {
      heading: 'Scoring a hand',
      body: [
        'If the partnership’s non-nil seats take at least the contract, the team scores 10 per bid trick plus 1 per overtrick. Come up short and the contract costs −10 per bid trick.',
      ],
      bullets: [
        {
          label: 'Bags',
          text: 'overtricks (and failed-nil tricks) are bags. They ride from hand to hand; every ten bags costs 100 points and the leftover bags stay on the card',
        },
        {
          label: 'Nil',
          text: 'scored on its own, on top of the partner’s contract result',
        },
      ],
    },
    {
      heading: 'The match',
      body: [
        'Hands stack until a team reaches the target (250 / 500 / 750). Highest score wins; if both teams land on the same total at or above the line, deal another hand.',
      ],
    },
    {
      heading: 'House rules',
      body: [
        'Room settings flip only three knobs: the target score, whether nil is allowed, and whether bags count. Classic tables keep the defaults. Blind nil is not offered.',
      ],
    },
  ],
};
