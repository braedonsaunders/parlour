import type { HowToPlayDoc } from '@parlour/engine';

/** Player-facing instructions rendered verbatim by the app's help modal. */
export const presidentHowToPlay: HowToPlayDoc = {
  summary:
    'The classic climbing game — shed your hand first, climb the ladder from Scum to President, and make your rivals serve you cards.',
  objective:
    'Finish every deal in the best seat you can. First out is President, last out is Scum. Position points bank across deals; first to the target total wins the match.',
  sections: [
    {
      heading: 'Playing to the pile',
      body: [
        'The leader opens a trick with any set — a single, pair, triple or quad of one rank.',
        'Moving clockwise, each player must top the pile with the SAME set size at a strictly higher rank, or pass.',
      ],
      bullets: [
        { label: 'Rank order', text: '3 is low, rising through A, with the 2 sitting above everything' },
        { label: 'Passing', text: 'a pass only skips this beat — if someone else tops the pile later in the trick, you are back in (unless the locked-pass house rule is on)' },
        { label: 'Winning the trick', text: 'when everyone else has passed, the pile is swept and the winner leads anything they like' },
        { label: 'A 2 clears', text: 'a lone 2 instantly wins the pile and keeps the lead — house rule, on by default' },
      ],
    },
    {
      heading: 'Finishing a deal',
      body: [
        'Run out of cards and you lock in the next spot up the ladder. Play continues until only one player is left holding cards — the Scum.',
        'First out is President, second is Vice President, second-to-last is Vice Scum, and the last seat is Scum.',
      ],
    },
    {
      heading: 'Scoring & the match',
      body: [
        'Every deal banks position points: the President scores as many points as there are seats, the runner-up one fewer, down to a single point for the Scum.',
        'The match ends the moment anyone reaches the target — highest banked total wins, ties share the crown.',
      ],
    },
    {
      heading: 'The exchange',
      body: [
        'Before the next deal, the low seats pay tribute from their fresh hands and the high seats return their pick:',
      ],
      bullets: [
        { label: 'Scum → President', text: 'the Scum’s two best cards; the President sends back any two' },
        { label: 'Vice Scum → Vice President', text: 'one card each way' },
        { label: 'Off toggle', text: 'turn trading off in room settings for a purer free-for-all' },
      ],
    },
    {
      heading: 'House rules',
      body: ['Tune the table in room settings before you start:'],
      bullets: [
        { label: '2 clears the pile', text: 'on by default — off, a 2 is just another unbeatable card' },
        { label: 'Locked passes', text: 'once you pass, you sit out the whole trick (default off: you rejoin when the pile changes)' },
        { label: 'Trading', text: 'the role-based card exchange between deals' },
        { label: 'Target points', text: 'how big the match is — 7 for a sprint, 11 for a session, 21 for a marathon' },
      ],
    },
    {
      heading: 'Table etiquette',
      body: [
        'The opening deal starts with the starting seat; after that, the sitting President leads every deal.',
        'Hands are dealt round-robin until the deck runs dry, so odd tables leave some seats a card short — everyone’s in the same boat.',
      ],
    },
  ],
};
