# Cribbage acceptance

Date: 2026-08-24

## Shipped slice

- `@parlour/game-cribbage`: deterministic two-seat Cribbage with alternating deals, two-card crib discards, starter cut, His Heels, complete pegging/go/31 scoring, ordered hand/crib show, race to 121, optional skunks, optional muggins, and config-driven best-of-N matches.
- Bots: three difficulty tiers and six named personas, deterministic decision making, seeded simulations, stall detection, head-to-head strength gates, and persona spread gates.
- Web: catalog tile; Classic Pub, Cutthroat, and Match Play setup; generated house-rule controls; solo authority; match-end/history integration; and a dedicated responsive table.
- Signature table: shared fanned-hand interaction, explicit two-card crib selection, stock/starter/crib/pegging zones, a wooden four-street board, two pegs per player, score-driven peg motion, and a visible 90-point skunk line.
- Presentation: engine-driven deal/play/show/peg motion, crib flights, count and scoring calls, reduced-motion support, and ten registered Cribbage SFX cues.
- Multiplayer: two-seat open friend rooms through the shared Nostr/WebRTC runtime, reconnect snapshots, host-authoritative packets, byte-identical replicated logs, and state-hash parity. Friend rooms play one complete race; multi-game Match Play is currently solo-only.

## Determinism and replay evidence

- Every accepted solo move is applied through the engine `MatchDef`; the full bot-played best-of-three test replays all round logs and verifies the final round hash and match result.
- The direct multiplayer parity test applies host packets remotely and compares the host/guest state hash and full event log after every move.
- The composed room test exercises signaling plus mock data channels, performs both simultaneous crib discards from different peers, and verifies identical logs and state hashes.
- A 300-game seeded balance run completed with zero stalls: Hard 86%, Easy 14%, and persona win rates between 19% and 68%.

## Manual acceptance path

1. Open `/cribbage`; switch among all three modes and adjust house rules.
2. Start Classic Pub solo. Select exactly two cards, commit them to the crib, cut as dealer, and play only highlighted legal cards.
3. Confirm the running count, starter, crib owner, score plaques, board pegs, 90 skunk line, calls, motion, and audio stay synchronized with the move.
4. Complete a race and confirm Cribbage totals/games appear on the match podium and the local head-to-head record is saved.
5. Create `/cribbage/create`, join from `/join` with the four-character code, and confirm each peer sees the same deal/phase after both discards.
6. Enable Match Play and confirm solo continues across games until the configured target; the friend-room action is disabled with the single-race limitation stated onscreen.

## Automated gates

- Cribbage engine: 4 files / 55 tests; type-check and build pass.
- Full repository: engine 117, Blitz 57, Cribbage 55, Gin 63, President 34, Ratscrew 32, Wild 47, and web 424 tests pass.
- Repo-wide `lint`, `type-check`, `build`, and `format:check` pass on the synchronized feature branch.
- Browser release-artifact loop: desktop setup, Match Play boundary, two-card selection, crib commit, bot discard, starter cut, and live pegging verified; mobile setup and live pegging inspected at 390 × 844; `render_game_to_text` matched the visible state; no console errors.
- The bundled web-game client itself could not launch because its pinned Chromium 1208 extraction stalled on this host. The installed Playwright CLI/Chromium 1234 completed the required equivalent snapshots, interaction loop, text-state inspection, and console review.
