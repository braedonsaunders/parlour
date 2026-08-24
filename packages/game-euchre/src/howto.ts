import type { HowToPlayDoc } from '@parlour/engine';

/** Player-facing instructions rendered verbatim by the app's help modal. */
export const euchreHowToPlay: HowToPlayDoc = {
  summary: 'The Midwest classic — partner up, name trump, and race your team to 10 points.',
  objective:
    'Sitting across from your partner, win at least three of the five tricks each hand by making your called suit king of the table. First team to the target score wins the match.',
  sections: [
    {
      heading: 'The table',
      body: [
        'Four players, two teams: you and the player across from you are partners. Five cards each; the last four cards form the kitty with its top card turned face up.',
      ],
    },
    {
      heading: 'Ordering it up — first bidding round',
      body: ['Starting left of the dealer, everyone either takes or passes the face-up card:'],
      bullets: [
        {
          label: 'Order it up',
          text: 'that suit becomes trump, the dealer picks the card into their hand and buries one face down',
        },
        { label: 'Go alone', text: 'take trump and send your partner to the bench for this hand' },
        { label: 'Pass', text: 'the decision moves left' },
      ],
    },
    {
      heading: 'Naming trump — second round',
      body: [
        'If all four pass, the turned-up card is buried and each seat may name any other suit as trump. The turned-down suit is off the table.',
        'Stick the dealer (default): if everyone else passes in round two, the dealer must call a suit.',
      ],
    },
    {
      heading: 'Bowers',
      body: [
        'When a suit is named, its jack is the RIGHT bower — the highest card in play. The jack of the same-coloured suit is the LEFT bower, second only to the right bower, and counts as trump. So with hearts as trump, J♥ then J♦ are the two boss cards.',
      ],
    },
    {
      heading: 'Playing tricks',
      body: [
        'The player left of the dealer leads. You must follow the led suit if you can — remember the left bower belongs to trump, not to its printed suit. Highest card of the led suit wins the trick unless someone plays trump; highest trump beats everything. The winner leads next.',
      ],
    },
    {
      heading: 'Scoring a hand',
      body: ['The calling team is the MAKERS. After five tricks:'],
      bullets: [
        { label: '3 or 4 tricks', text: 'makers score 1 point' },
        { label: '5 tricks', text: 'a march — makers score 2' },
        { label: 'March alone', text: 'all five tricks while going alone — makers score 4' },
        { label: 'Euchred!', text: 'makers win fewer than three tricks — defenders score 2' },
      ],
    },
    {
      heading: 'Going alone',
      body: [
        'A caller confident enough may play without their partner, who sits the hand out entirely. Win all five alone and it is worth 4 points — but take fewer than three and the defence still euchres you for 2.',
      ],
    },
    {
      heading: 'House rules',
      body: [
        'Room settings tune the match: game to 5/10/15, stick-the-dealer on or off, and whether going alone is allowed. When every hand is thrown in without a trump call, the deal simply moves left.',
      ],
    },
  ],
};
