import type { HowToPlayDoc } from '@parlour/engine';

/** Player-facing instructions rendered verbatim by the app's help modal. */
export const ratscrewHowToPlay: HowToPlayDoc = {
  summary:
    'Take turns flipping cards onto a shared pile and SLAP your way to winning every card on the table.',
  objective:
    'Win all the cards. When everyone else runs out, you win the match. You win cards by slapping patterns or by playing face cards your opponents can’t answer.',
  sections: [
    {
      heading: 'The flip',
      body: [
        'Starting with you, players take turns placing the top card of their own face-down stack onto the center pile, turning it away from themselves so nobody peeks.',
        'If your stack runs dry you’re out of the round — watch the pile anyway, a slap can still be your moment.',
      ],
    },
    {
      heading: 'Face cards & challenges',
      body: ['A face card starts a challenge against the next player in turn order:'],
      bullets: [
        { label: 'Jack', text: 'they get 1 chance to flip another face card' },
        { label: 'Queen', text: '2 chances' },
        { label: 'King', text: '3 chances' },
        { label: 'Ace', text: '4 chances' },
      ],
    },
    {
      heading: 'Resolving a challenge',
      body: [
        'Each non-face card the challenged player flips burns one of their chances.',
        'They flip a new face card? The challenge moves around the table with fresh chances for the next player.',
        'They run out of chances? The face-card player scoops the whole center pile under their stack and leads the next flip.',
      ],
    },
    {
      heading: 'Slaps',
      body: [
        'The instant a slappable pattern lands on the pile, EVERYONE races to slap it. The first valid slap wins the entire center pile and leads next.',
        'A brief slap window opens whenever a pattern is live — slam the SLAP button before it closes!',
      ],
      bullets: [
        { label: 'Double', text: 'two cards of the same rank back-to-back (7♦ 7♣)' },
        { label: 'Sandwich', text: 'same rank with one card between (7♦ Q♠ 7♥)' },
        { label: 'Ten', text: 'two consecutive pip cards summing to ten (3♦ 7♠) — house-rule toggle' },
      ],
    },
    {
      heading: 'House rules',
      body: ['Tune the chaos in room settings before you start:'],
      bullets: [
        { label: 'Doubles / Sandwiches', text: 'the classic slap patterns, both on by default' },
        { label: 'Tens', text: 'adds sum-to-ten slaps for extra mayhem' },
        { label: 'Slap window', text: 'how long the race stays open — shorter means meaner' },
      ],
    },
    {
      heading: 'Table manners',
      body: [
        'Slaps only count while a pattern is live — the engine won’t accept an early or late slap, so keep your eyes on the pile, not your nerves.',
        'The pile winner slides it under their stack without shuffling and flips next. Last player holding cards wins.',
      ],
    },
  ],
};
