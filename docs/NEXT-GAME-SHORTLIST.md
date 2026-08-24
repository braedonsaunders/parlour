# Parlour next-game shortlist

Snapshot: 2026-08-23. The comparable popularity signal below is lifetime games
played on Board Game Arena, not a claim about total worldwide play. Release age
matters, so the count is a directional signal rather than a perfect ranking.

| Priority | Game           | BGA games played | Why it fits Parlour                                                                                                           | New platform work                                                               |
| -------- | -------------- | ---------------: | ----------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| 1        | Hearts         |        2,722,026 | Strongest measured demand; 14-minute social matches; proves trick-taking, cumulative scoring, and simultaneous secret passing | Shared trick/table primitive, pass-selection UI, point-avoidance bots           |
| 2        | Cribbage       |        1,431,465 | Excellent two-player/couples game; distinctive identity; makes the new 121-point match composition earn its keep              | Pegging board, crib ownership, multi-stage scoring, specialist bot              |
| 3        | Spite & Malice |          488,988 | Fast 1–4 seat shedding/building game; unusually strong recent adoption; highly reusable with Wild                             | Multiple decks, shared build piles, stock-pile redaction                        |
| 4        | Oh Hell!       |          469,622 | Easy-to-learn trick-taking with bidding and a natural multi-round arc                                                         | Trick primitive plus bids; full 5–7 player support needs a larger table shell   |
| 5        | Gin Rummy      |          249,406 | Lowest-risk game #3: its draw/discard loop overlaps Blitz and it is ideal for two players                                     | Meld/deadwood solver, knock/undercut scoring, 100-point match                   |
| 6        | Spades         |          224,885 | Recognizable social/team game and a good use of trick-taking infrastructure                                                   | First-class partnerships in the app/stats UX, bidding, bags, 4-seat-only launch |

Sources: [Hearts](https://en.boardgamearena.com/gamepanel?game=hearts),
[Cribbage](https://en.boardgamearena.com/gamepanel?game=cribbage),
[Spite & Malice](https://en.boardgamearena.com/gamepanel?game=spiteandmalice),
[Oh Hell!](https://en.boardgamearena.com/gamepanel?game=ohhell),
[Gin Rummy](https://shareables.boardgamearena.com/gamepanel?game=ginrummy), and
[Spades](https://en.boardgamearena.com/gamepanel?game=spades).

## Recommendation

Build **Hearts** next. It has the clearest popularity lead and validates all
three new engine directions in one game:

- `PhaseState.actors` handles every seat choosing pass cards without exposing
  the choices early.
- `MatchDef` owns cumulative points, pass direction, dealer/lead rotation, and
  the game-over threshold across hands.
- authority timestamps are available if the product later adds a fast-pass
  countdown, without putting a clock read in the game module.

Hearts also creates a reusable `@parlour/tricks` rules helper and table
presentation that makes Spades, Euchre, Whist, and Oh Hell substantially
cheaper afterward.

If the goal is the fastest polished release instead of the strongest platform
proof, swap **Gin Rummy** into the first slot. Much of Blitz's draw/discard
interaction, deck art, card motion, and two-player layout can be reused.

Cribbage is the best product bet specifically for repeat play between two known
people. Its board and terminology require more design work, but local
head-to-head history makes it especially well matched to Parlour's account-free
friend identity.

## Proposed build order

1. Hearts — flagship engine proof and reusable trick-taking foundation.
2. Gin Rummy — fast follow using the existing draw/discard foundation.
3. Cribbage — differentiated two-player anchor and deeper match composition.
4. Spite & Malice — broaden the shedding/building shelf after Wild.
