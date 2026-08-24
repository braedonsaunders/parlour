import type { HowToPlayDoc } from '@parlour/engine';

/** Player-facing instructions rendered verbatim by the app's help modal. */
export const scopaHowToPlay: HowToPlayDoc = {
  summary: 'The Italian fishing classic — capture cards off the table, sweep it clean for a scopa.',
  objective:
    'Capture cards from the table by matching or summing to their values. Most cards, most coins, the settebello, the primiera and every scopa score a point; first to the target (11 by default) wins the match.',
  sections: [
    {
      heading: 'The table',
      body: [
        'Scopa is played with a 40-card Italian deck: Denari (coins), Coppe (cups), Spade (swords) and Bastoni (clubs), ranks 1 to 10. Two, three, four or six can play — at four and six you sit in fixed partnerships with seats alternating around the table.',
        'Each deal gives every player three cards and lays four face up on the table. If three or more Kings show on the opening tableau, the deck is reshuffled and redealt.',
      ],
    },
    {
      heading: 'Capturing',
      body: [
        'On your turn play exactly one card from your hand. Cards capture by number only — suit never matters.',
      ],
      bullets: [
        {
          label: 'Match',
          text: 'your card takes a single table card of the same value: a 5 takes a 5',
        },
        {
          label: 'Choose',
          text: 'if two table cards share that value, you pick which one to take — choose carefully, the leftovers matter',
        },
        {
          label: 'Sum',
          text: 'your card may take two or more table cards that add up to its value: an 8 takes a 3 and a 5. But if a single-card match exists you MUST take it — combinations are only for when no match is showing',
        },
        {
          label: 'Pose',
          text: 'nothing matches? Your card stays on the table, face up and fair game',
        },
      ],
    },
    {
      heading: 'Scopa',
      body: [
        'Sweep every remaining card off the table in one capture and you have made a scopa: one point, scored immediately. A scopa on the very last card of the last deal does not count — those cards are swept regardless. When hands empty, three fresh cards are dealt to each player; the table is never replenished. When the deck is exhausted the last player who captured sweeps any cards left on the table, and that sweep is not a scopa.',
      ],
    },
    {
      heading: 'Scoring a round',
      body: [
        'After the final deal, four points are divided plus whatever scope were earned. At partnership tables the teams’ captures are pooled before scoring.',
      ],
      bullets: [
        {
          label: 'Carte',
          text: 'most cards captured — 21 or more of the 40 in the two-hander; a tie scores nobody',
        },
        { label: 'Denari', text: 'most coins captured — 6 or more of the 10; a tie scores nobody' },
        { label: 'Settebello', text: 'whoever captured the beautiful 7 of coins scores 1, always' },
        {
          label: 'Primiera',
          text: 'best card in each suit summed — 7 counts 21, 6 counts 18, Ace 16, 5→15, 4→14, 3→13, 2→12, and face cards only 10. Hold no card of some suit and you cannot win it. Highest total takes 1 point; ties score nobody',
        },
        { label: 'Scope', text: 'one point each, already banked during play' },
      ],
    },
    {
      heading: 'The match',
      body: [
        'Rounds repeat — the dealer moves left each time — until someone crosses the target score. If two sides land tied at the line, another round decides it.',
      ],
    },
    {
      heading: 'House rules',
      body: [
        'Room settings expose the classic knobs: the target (11/16/21), Scopone (whole deck dealt, no stock), Napola (a coin run bonus), Re di denari (a bonus for the King of coins) and the French-suited display, which is purely visual.',
      ],
    },
  ],
};
