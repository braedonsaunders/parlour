# @parlour/game-wildpile

Wildpile is the M5 engine-proof prototype: a deterministic, headless UNO-like shedding game built entirely on the existing `@parlour/engine` public API.

It includes a unique 108-card custom deck, seeded seven-card deals, number/color matching, skip, reverse, draw-two, wild, wild-draw-four, explicit color selection, optional draw stacking, exact-face jump-ins, stock recycling, hidden-zone redaction, fx hints, replay, and a solo-capable bot.

## Engine proof

The prototype required no changes to `packages/engine`. The existing `GameDef`, move, flow, zone, fx, bot, session, and replay contracts cover the rules.

The one friction point is the engine runtime's single `phase.actor`. A jump-in cannot be represented as several seats acting simultaneously, so Wildpile models it as a deterministic interrupt window: eligible seats are offered an exact-match `playCard` or `declineJump` decision in seat order, after which normal turn flow resumes. This preserves validation, deterministic replay, and transport authority without an engine API break.

## Verification

```sh
pnpm --filter @parlour/game-wildpile test
```

The suite checks deck composition, seeded setup, every action-card path, draw stacking on/off, exact-match interrupts, deterministic recycling, redaction, replay, supported seat bounds, fx emission, and a complete bot-played game.
