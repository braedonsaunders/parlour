# President — acceptance record

Shipped: the complete President slice (engine pack, web integration,
multiplayer, audio, wide-seat shell) on branch
`bb/build-new-parlour-card-game-thr_b2wxayiyte`, merged to local main as
`merge: integrate president slice`.

## What ships

### Engine — `@parlour/game-president`

- **Rules** (`src/game.ts`): 4–8 seats; full 52-card deck dealt round-robin
  from a seeded starting seat (uneven hands allowed, hands sorted for display);
  leader opens any set of 1–4 same-rank cards; followers match size at strictly
  higher table order (3 low … A, 2 high) or pass; a trick ends when every rival
  has passed consecutively and the winner leads next; a finished winner hands
  the lead to the next active seat.
- **House rules** (`src/config.ts`): `twoClears` (★on), `passLocks` (★off),
  `trading` (★on), `targetPoints` int 5–21 (★11). Presets `classic` / `rapid` /
  `marathon` are the shelf modes.
- **Match composition in one session**: deals, role assignment (President → … →
  Scum by go-out order), position points (`seats − finishIndex` per deal),
  first-to-target match end, and the between-deal exchange (Scum→President 2,
  Vice-Scum→Vice 1, with returns chosen by the high seats) all live in one
  deterministic event log. Deal N+1 reshuffles the conserved cards
  (hands + pile + captured), so no card is ever created or lost.
- **Veil** (`veilSupport({ deck, publicSetup: 'none' })` + `dealOrder`): veiled
  rooms deal handles; played/gifted cards open through `meta.reveals`; redeals
  shuffle conserved handles, preserving privacy across the transition; rules
  never read another seat's faces and tolerate handles without throwing.
- **Fx**: every move emits timeline hints — per-card flights
  (`card.fly`/`card.discard`), `turn.ring`, and namespaced accents
  `president.set/pass/pile-clear/role/out/exchange`.
- **Redaction**: `playerView` masks all other hands to `'??'` with counts kept.
- **Bots** (`src/bots.ts`): three tiers + personas (Marigold/Rookie,
  Slate/Regular, Juniper/Sharp) with set-preservation penalties, 2-management,
  endgame racing, defensive passing, and exchange strategy.
- **Sim** (`pnpm --filter @parlour/game-president sim`): ladder gate (Sharp
  finishes above Rookie ≥55% with seating rotated), persona win-band cap,
  pacing gate (≤7 deals/match). Passes at 200 and 400 games.
- **Catalog/how-to** (`src/catalog.ts`, `src/howto.ts`): registry entry for the
  shelf/mode pickers/settings panel and the verbatim player help doc.

### Web integration

- Shelf tile via `presidentCatalog` (id `president`, href `/president`).
- `/president`: mode carousel (registry modes + GameArt), seat picker 4–8,
  generated Advanced-options panel (`RuleSettings`), how-to-play buttons.
- `/president/table`: solo transport (`PresidentTransport`, house bots fill)
  plus multiplayer table; `/president/create`: friend-room lobby.
- `PresidentTableScreen`: fx-timeline-driven motion only (shared
  `useDealPresentation`, `buildFxTimeline`, `useFxAnimation`, `HandRail` /
  `HandRailCard`, shared `PlayingCard`), center pile with standing-rank chip,
  exchange banner + selection flow, crown/scum role celebrations driven purely
  by `president.role` fx, `render_game_to_text` hook for tooling.
- Audio: wired to the sound thread's real assets (`PRESIDENT_SFX_PACK`,
  `presidentCuesForFx`) — set-slam (+150 ms), pass, pile-clear (+60 ms),
  crown/scum/role-chime branch on payload, exchange-swish.

### Platform (neutral, reusable)

- `lib/rooms/seatRange.ts`: single source for per-game capacity
  (`president: 4–8`; default stays 2–4). Consumed by roomSession create/join
  validation, P2PTransport create, and EngineAuthority snapshot checks.
- Wire ceilings widened to eight seats (`wireSchema.MAX_SEATS/MAX_PEERS`,
  `resilience.validatePresenceSnapshot`); hostile-input tests updated to probe
  the new boundary.
- Compact opponent ring: shared `table.module.css` gains `.seat4`–`.seat7`
  positions and a `.compactRing` scale-down tier keyed off player count — any
  future wide game (Oh Hell) opts in with two class names.

## Multiplayer proof

`roomSession.test.ts > routes a five-seat president room…` runs five live
sessions over the mock Nostr/WebRTC mesh, drives fourteen real turns from the
acting seats, and asserts after every step that all five peers hold identical
log lengths and identical state hashes; it then compares the full replayed log
event-by-event (per-event hashes equal).

## Verification performed

| Gate | Result |
| --- | --- |
| `pnpm -r test` | all packages green — engine 11 files, blitz 6, wildpile 3, ratscrew 2, president 3 (34 tests), web 56 files |
| `pnpm -r type-check` | 0 errors |
| `pnpm lint` | 0 errors |
| `pnpm format:check` | clean |
| `pnpm build` | static export builds incl. `/president`, `/president/table`, `/president/create` |
| Sim gates | ALL PASS at 200 and 400 games |
| Browser loop | Playwright against dev server: shelf→setup→solo deal→8 human actions through the UI, **zero console errors** |

Engine determinism: fixed-seed sessions reproduce identical state hashes move
for move under `replaySession`; different seeds diverge (tested).

## Notes / follow-ups

- Veil trade-off documented in the how-to: exchanged cards are opened to the
  table when gifted (v1 simplification; recipient must read them to choose
  returns).
- Two pre-existing lint failures on main were repaired mechanically while
  landing (unused import in ratscrew `game.ts`; synchronous setState-in-effect
  in shared `deal-presentation.ts` deferred to a microtask, behaviour
  unchanged).
