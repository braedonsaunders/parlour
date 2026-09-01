# The duel harness

Two full production multiplayer clients — engine, authority, P2P transport,
real SRA veil ceremony — playing a fast game against each other with no
browser, no Playwright, and no shared game state. Each seat acts only on its
own presented snapshot, through the moves its real table screen can express,
and everything between the two clients crosses a seeded latency network.

A full veiled duel runs in seconds; a house-rules Wild marathon with two
clocks, jump-ins and dozens of stock re-veils runs in about two minutes. Any
failure reproduces from its seed (choices and network schedule are seeded;
wall-clock scheduling still varies, so soak flaky suspects in a loop).

## Files

- `netsim.ts` — the simulated network: per-link seeded latency with per-channel
  ordering (like real DataChannels), head-of-line blocking included, and
  `crash(label)` to silence a device the way a dead radio goes silent.
- `actors.ts` — per-game **cockpits**: the exact set of moves each game's
  `renderRoom` screen can dispatch, and how (including veil reveals). Actors
  choose with the game's own bot policy plus a seeded `chaos` share of uniform
  picks. A legal move with no cockpit control is deliberately unplayable — if
  the game cannot finish without it, the harness reports the stall a real
  table would show, which is exactly how the veiled-Blitz showdown wedge was
  found.
- `harness.ts` — `runDuel(options)`: lobby → veil deal → play loop → endgame
  invariants (log-length and state-hash convergence, identical results, no
  player-visible errors, no lingering pause). Fault schedules: `guest-crash`,
  `host-crash` (host migration + walkover), `guest-quit-rejoin` (material
  restore + catch-up). Reports the survivor's full applied log and a per-move
  tally so tests can PROVE coverage instead of hoping for it.
- `duel.test.ts` — the scenario lane (clean duels, walkovers both directions,
  rejoin, seed sweep). `wild-coverage.test.ts` — complicated Wild: every house
  rule on, clock-driven play, and a witnessed-coverage assertion over moves
  and card kinds.

## Running

```sh
# quick lane (runs in the ordinary web test suite)
pnpm --filter @parlour/web exec vitest run src/app/_multiplayer/duel

# nightly scale: more seeds, exhaustive Wild coverage
PARLOUR_FULL_SIM=1 pnpm --filter @parlour/web exec vitest run src/app/_multiplayer/duel
```

## Adding a game

1. Add a cockpit in `actors.ts`: the move ids the game's room screen exposes,
   any screen-side gating (`offers`), and any dispatch that carries reveals.
2. Add a scenario or two in `duel.test.ts` with that `gameId`.
3. If the game recycles a spent stock, declare `spentStock` in its
   `gameRegistry` pack and use `recycleSpentPile` in its reducer — the host
   pre-shuffles the pile and every seat discovers the exchange from the
   transcript; nothing else to build.
4. If a seat can OWE the table cards (a showdown), declare
   `selfOpens` in the game's `veilSupport` block — the room answers it
   automatically on every client.
