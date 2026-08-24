import type { HowToPlayDoc } from '@parlour/engine';

/** Player-facing instructions rendered verbatim by the app's help modal. */
export const ratscrewHowToPlay: HowToPlayDoc = {
  summary:
    'Take turns flipping cards onto a shared pile and SLAP your way to winning every card on the table.',
  objective:
    'Win all 52 cards. You grow your stack by slapping patterns first or by laying face cards your opponents can’t answer. When everyone else is out of cards — or slaps their way back in — you win the match.',
  sections: [
    {
      heading: 'The flip',
      body: [
        'Starting with you, players take turns placing the top card of their own face-down stack onto the center pile, turning it away from themselves so nobody peeks.',
        'If your stack runs dry you stop flipping — but with Slap back in on, one lucky slap puts you right back in the game.',
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
        { label: 'Marriage', text: 'a King and Queen back-to-back, either order (K♦ Q♠) — house-rule toggle' },
        { label: 'Ten', text: 'two consecutive pip cards summing to ten (3♦ 7♠) — house-rule toggle' },
        { label: 'Top-bottom', text: 'the top card matches the very bottom card of the pile — house-rule toggle' },
        { label: 'Run', text: 'three climbing or falling ranks in a row (4-5-6 or 9-8-7) — house-rule toggle' },
      ],
    },
    {
      heading: 'Mis-slaps',
      body: [
        'Slapping when no pattern is live costs you: with Mis-slap burns on, your top card slides under the pile as a penalty. Nerves are expensive — keep your eyes on the cards, not the crowd.',
      ],
    },
    {
      heading: 'House rules',
      body: ['Tune the chaos in room settings before you start:'],
      bullets: [
        { label: 'Doubles / Sandwiches', text: 'the classic slap patterns, both on by default' },
        { label: 'Marriage / Tens / Top-bottom / Runs', text: 'extra patterns, all off by default for a classic table' },
        { label: 'Mis-slap burns a card', text: 'on by default; turn it off and only live patterns can be slapped at all' },
        { label: 'Slap back in when out', text: 'empty-handed players may still slap a live pattern to win the pile and re-enter' },
        { label: 'Slap window', text: 'how long the race stays open — shorter means meaner' },
      ],
    },
    {
      heading: 'Table manners',
      body: [
        'The pile winner slides it under their stack without shuffling and flips next. Last player holding every card wins the match.',
        'A short grace moment keeps long-distance slaps honest: the table waits a beat past the window before calling it closed.',
      ],
    },
  ],
};
