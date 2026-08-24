# Parlour next-game shortlist

Snapshot: 2026-08-24. Shipped and playable: Blitz, Wild, Ratscrew, Gin,
Hearts, Euchre, Cribbage, President, Spades, Klondike, Oh Hell!. Shipped as a
tested pack with no table yet: Spite & Malice.

The comparable popularity signal below is lifetime games played on Board Game
Arena, not a claim about total worldwide play. Release age matters, so the
count is a directional signal rather than a perfect ranking.

## Platform tax: paid, and what it bought

The previous version of this file said "do not start game #9 until the factory
tax is paid down". Game #9 shipped first and the tax was paid after — the wrong
order, but a useful natural experiment, because the cost was visible.

What landed:

- **`lib/rooms/gameRegistry.ts`** — one total `Record<MultiplayerGameId,
RoomGamePack>`. It replaced five chains keyed on `settings.gameId`, several
  of which ended in `return createBlitzDef()`, so a game added to some and
  forgotten in the others quietly played Blitz's rules. `roomSession.ts` went
  from 1,206 lines and 25 `gameId ===` branches to 974 and one.
- **`lib/table/useGameTable.ts`** — the table-page runtime. Nine copies of the
  page shell were 2,805 lines; they are now 1,899 plus a 326-line hook.
- **`lib/solo/seating.ts`** — the seat roster every solo transport rebuilt.
- **Balance gates split** into an exact PR lane and a nightly statistical one,
  because win-rate bands over 32–60 games were measuring the CI runner more
  than the bots.

Adding Oh Hell afterwards was the test: the compiler demanded entries in
`gameIds`, `seatRange`, `tableRoute` and `ROOM_GAMES` before it would build,
and nothing could silently fall back. That is the whole point.

**Still owed** — the remaining per-game chains, each of which needed an edit
for Oh Hell:

- `stores/matchFlow.ts` holds a union of every game's mode id. It is only ever
  used as a display label, and `buildMatchRecord` already takes a plain
  `string`.
- `lib/games.ts` `GameId` is a hand-maintained union beside `SHELF`.
- `lib/audio/sfx.ts` seeds its pack map from a hand-written array.

None of these can resolve to the _wrong_ game — they fail to compile — so they
are tax rather than risk. Worth collapsing before game 14.

## Build order

| Priority | Game                          | Why it is next                                                                                       | New platform work                                         |
| -------- | ----------------------------- | ---------------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| 0        | Spite & Malice table          | The pack is done and tested; only the board is missing.                                              | Payoff piles, four shared centre piles, per-seat discards |
| 1        | Scopa                         | The shelf has no fishing game at all, and a 40-card deck proves `DeckDef` is not secretly 52-shaped. | Sum-capture selection UI; 6-seat partnerships             |
| 2        | Big Two / Tien Len            | Climbing genre; extends President's combinatorics; large underserved audience.                       | Combo ranking beyond sets                                 |
| 3        | Durak                         | Attack/defend, a shape the shelf does not have; large Eastern European audience.                     | New flow; 2–6 seats                                       |
| 4        | FreeCell + Spider             | Klondike's siblings. Should be config, not packages — if they are not, the solitaire model is wrong. | A variant descriptor over the existing tableau            |
| 5        | Wizard as its own shelf entry | Already implemented inside Oh Hell as a preset; needs only its own tile if the audience wants it.    | None                                                      |

Parked, not next:

- **Texas Hold'em** — still what Veil wants, and still blocked on a real
  `@parlour/betting` package (chips, blinds, side pots). It is also the one
  game where Veil's missing shuffle proof would actually matter, because a
  money-shaped incentive to cheat is the point. Do not ship it until Veil can
  prove a shuffle.
- **Bridge** — bidding systems are a research project.
- **Canasta** — two-deck meld complexity, long sessions.
- **Crazy Eights** — a Wild preset, not a package.

## Two ceilings a new game should know about

- **Veil covers single-deal games only.** `MatchDef.openRound` passes no
  `veiled`/`deckOrder`, so a match-shaped game is structurally incapable of
  running a veiled round. Gin, Cribbage, Hearts, Spades and Oh Hell all refuse
  it by name. See the comment on `openRound` in `packages/engine/src/match.ts`.
- **Randomness is keyed by 32 bits.** At most 2^32 distinct deals, and not a
  fair shuffle in the cryptographic sense. Fine for play, and fine for a daily
  seeded deal; never claim otherwise. See `packages/engine/src/rng.ts`.

Sources: [Hearts](https://en.boardgamearena.com/gamepanel?game=hearts),
[Cribbage](https://en.boardgamearena.com/gamepanel?game=cribbage),
[Spite & Malice](https://en.boardgamearena.com/gamepanel?game=spiteandmalice),
[Oh Hell!](https://en.boardgamearena.com/gamepanel?game=ohhell),
[Gin Rummy](https://shareables.boardgamearena.com/gamepanel?game=ginrummy), and
[Spades](https://en.boardgamearena.com/gamepanel?game=spades).
