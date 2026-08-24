# Parlour next-game shortlist

Snapshot: 2026-08-24. The first shelf is shipped: Blitz, Wild, Ratscrew, Gin,
Hearts, Euchre, Cribbage, and President are playable. This document is the
agreed *next* order, not a claim that any of these titles is in progress.

The comparable popularity signal below is lifetime games played on Board Game
Arena, not a claim about total worldwide play. Release age matters, so the
count is a directional signal rather than a perfect ranking.

## Platform first

Do not start game #9 until the factory tax is paid down. A new `GameDef` still
needs a table page, a solo transport, and a `roomSession` switch. Until those
are shared, each title makes the next one more expensive.

## Build order

| Priority | Game                         | Why it is next                                                                                          | New platform work                                              |
| -------- | ---------------------------- | ------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| 0        | Platform hardening           | Shared table shell, room registry, honest CI. Makes every later title cheaper.                          | `useGameTable`, registry-driven rooms, no-bail test gate       |
| 1        | Spades                       | Highest remaining US social demand; reuses `@parlour/tricks` and Euchre partnerships                    | Bidding, bags, 4-seat team stats                               |
| 2        | Klondike + FreeCell          | One solitaire milestone. Daily seeded deals turn determinism into a user-facing habit and share loop.   | Tableau / foundation zones; no multiplayer                     |
| 3        | Spite & Malice               | Fast 1–4 shedding/building; strong BGA adoption; reuses Wild instincts                                  | Multiple decks, shared build piles                             |
| 4        | Oh Hell! / Wizard            | Bidding trick-takers with a natural multi-round arc                                                     | Varying hand size via `MatchDef.roundConfig`; 5–6 seat table   |
| 5        | Big Two / Tien Len           | Extends President combinatorics; large underserved audience                                             | Combo ranking beyond sets                                      |
| 6        | Durak                        | Attack/defend shape the shelf does not have                                                             | New flow; 2–6 seats                                            |

Parked, not next:

- **Texas Hold'em** — what Veil wants, but the casino frame fights the cozy
  table. Later Veil showcase, blocked on a real `@parlour/betting` package
  (chips, blinds, side pots).
- **Bridge** — bidding systems are a research project.
- **Canasta** — two-deck meld complexity, long sessions.
- **Crazy Eights** — a Wild preset, not a package.

Sources: [Hearts](https://en.boardgamearena.com/gamepanel?game=hearts),
[Cribbage](https://en.boardgamearena.com/gamepanel?game=cribbage),
[Spite & Malice](https://en.boardgamearena.com/gamepanel?game=spiteandmalice),
[Oh Hell!](https://en.boardgamearena.com/gamepanel?game=ohhell),
[Gin Rummy](https://shareables.boardgamearena.com/gamepanel?game=ginrummy), and
[Spades](https://en.boardgamearena.com/gamepanel?game=spades).
