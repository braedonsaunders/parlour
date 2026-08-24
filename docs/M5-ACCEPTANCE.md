# M5 engine-proof acceptance

M5's exit (BUILD-SPEC §13): the second game works as a tile on the shelf with **zero changes to
`@parlour/engine`**. Wild — `@parlour/game-wildpile`, spec §11 — is that proof.

## What ships

- `@parlour/game-wildpile`: headless UNO-like shedding game — 108-card custom deck, skip/reverse/
  draw-two, wild + wild-draw-four with an explicit color sub-decision, direction state, optional
  draw stacking, exact-face jump-in interrupts, stock recycling, redaction, replay, fx hints, and a
  house bot. `pnpm --filter @parlour/game-wildpile test`.
- Web integration, solo vs bots: the Wild tile on `/games` is live and routes to `/wild`
  (Classic/Party preset + seats) and `/wild/table`. `WildTransport` mirrors `LocalTransport`'s
  contract over the unchanged engine session API; the table renders a Wild deck skin over the same
  table scene and animates only from engine fx cues. Match end lands on the shared podium.

## Automated exit criteria

- `pnpm --filter @parlour/game-wildpile test` — rules, presets, interrupts, recycling, replay,
  full bot game.
- `pnpm --filter @parlour/web test` — includes `WildTransport`/`wildTableView` suites: deterministic
  deals per seed, preset → rule mapping, legal-move surfaces (play/draw/choose-color/jump-in),
  fail-closed illegal moves, bots finishing a complete deal with a ranked `hand-emptied` result.
- `tsc --noEmit` and `next build` (static export) pass with the `/wild` routes.

## Engine friction found (the point of the milestone)

1. **Single `phase.actor` vs simultaneous interrupts.** The engine's flow reports one actor per
   phase, so a jump-in window (several seats simultaneously eligible) cannot be expressed directly.
   Wildpile models it as a deterministic interrupt queue: eligible seats get an exact-match
   `playCard`/`declineJump` decision in seat order, then normal turn flow resumes. Validation,
   replay, and transport authority all survive; no engine change needed. (Documented in the package
   README.)
2. **Fx vocabulary is game-agnostic enough.** The Blitz fx set (`card.fly`/`card.draw`/
   `card.discard`/`turn.ring`) covered Wild's motion; game-specific moments (`wildpile.wild`,
   `wildpile.reverse`, …) ride the same emitter as custom kinds the UI may ignore. The only web-side
   shim: `card.flip` (starter reveal) is remapped to a deal flight because the shared timeline has
   no flip shape.
3. **No breaks.** `GameDef`, config schema/presets, `createSession`/`sessionApply`, `chooseBotMove`,
   `playerView`, and the fx emitter were used as-is. `@parlour/engine` is untouched by this
   milestone.

## Not in scope (deliberate)

Wild multiplayer rooms, personas/tiered bots, and bespoke celebration fx stay out of the M5
prototype; the shelf copy says "solo vs bots".
