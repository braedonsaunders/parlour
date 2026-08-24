# parlour

A web card-game platform: a reusable TypeScript card-game engine plus a beautiful, fast, animated player-facing app. Static Vercel deploy, zero backend — solo vs CPU works offline; live play is friends-only P2P via room codes.

Game #1: **Blitz** (the 31/Scat family game). Game #2 (engine proof): **Wildpile**, an UNO-like shedding game.

## Architecture

```
parlour/
  packages/
    engine/        # @parlour/engine — pure, deterministic, transport-agnostic core
    game-blitz/    # @parlour/game-blitz — 31 rules module
    game-wildpile/ # @parlour/game-wildpile — UNO-like (M5)
  apps/
    web/           # the parlour app (Next.js, static export on Vercel)
```

- Seeded deterministic engine: same seed + same event log ⇒ identical state on every peer. Enables replays, reconnect, host migration, spectate-later.
- Single-seat and simultaneous phases share one reducer path; authority-normalized event time is logged and replayed instead of read inside game code.
- `MatchDef` composes deterministic round sessions into lives, cumulative scores, dealer rotation, timed formats, and sudden death.
- Moves are pure reducers that emit an ordered **fx timeline**; the UI animates only from fx events, never by diffing state.
- P2P multiplayer: Nostr signaling → WebRTC DataChannel mesh, host-authoritative with full resilience (host election, bot takeover, rejoin). Redaction is honest-UI, not cryptography — fine for friends play. The opt-in cryptographic direction is specified in [Parlour Veil](docs/VEILED-DECK-PROTOCOL.md).
- Local profiles keep account-free lifetime stats and stable friend-vs-friend head-to-head history. See the popularity-informed [next-game shortlist](docs/NEXT-GAME-SHORTLIST.md).

## Quickstart

```
pnpm install
pnpm dev            # Next dev server
pnpm -r build       # typecheck + build all packages
pnpm -r test       # vitest everywhere
pnpm sim -- --games 10000   # headless Blitz bot sims
```

## Roadmap

- [x] M0 — monorepo scaffold, CI gates
- [ ] M1 — engine + Blitz rules headless (10k-game sim clean, replay hash-stable)
- [ ] M2 — solo vertical slice: the feel milestone (live on Vercel)
- [ ] M3 — art + audio + meta (final diorama pass, SFX/music, profile/stats, PWA)
- [ ] M4 — P2P multiplayer (lobby codes, share links, resilience)
- [ ] M5 — Wildpile prototype (engine generalization proof)

## License

MIT — see [LICENSE](LICENSE).
