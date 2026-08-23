# parlour — Build Specification

**parlour** is a web card-game platform: a reusable TypeScript card-game engine plus a beautiful, fast, animated player-facing app, running entirely on Vercel as a static deploy with serverless P2P multiplayer. Game #1 is **Blitz** (the 31/Scat family game). Game #2 (design-for, build-later) is an UNO-like shedding game.

This spec is the authoritative handoff for the build agent. Companion materials (same folder):

- `research/RESEARCH.md` — engine/multiplayer landscape research with sources
- `research/UNO-VISUAL-ANALYSIS.md` — frame-by-frame motion reference with measured timings
- `research/uno-frames/` — curated 1080p reference frames + 10 fps animation-burst contact sheets
- voidstrike repo (`github.com/braedonsaunders/voidstrike`) — in-house prior art for the P2P stack

Owner decisions in this spec were confirmed in a scope interview on 2026-08-23 and are **locked** unless the owner says otherwise. Where this spec says "toggle," it is a per-room house rule exposed in room settings.

---

## 1. Product vision

Uno-iOS-quality feel, applied to the pub card game 31: sub-250 ms feedback on every interaction, choreographed card motion, celebration moments, zero friction (no accounts, no installs, share a link and play). Solo vs CPU personas works offline; live play is friends-only via room codes. Everything ships from one Vercel static deploy with $0 infrastructure.

**Quality bar**: the game must feel like a AAA casual mobile title, not a web demo. The motion/feel spec (§7) is a requirement, not a garnish. When in doubt, study the reference frames.

## 2. Locked decisions (scope interview)

| Topic                    | Decision                                                                                                             |
| ------------------------ | -------------------------------------------------------------------------------------------------------------------- |
| Ruleset                  | Configurable house rules w/ preset system (engine-level rule config)                                                 |
| Match formats            | ALL first-class: Classic (lives), Fast (single round), Timed (match clock) — equal citizens on mode select           |
| Multiplayer              | P2P WebRTC, voidstrike-style (Nostr signaling, lobby codes, static Vercel, zero backend)                             |
| Resilience               | Full: seeded deterministic engine + shared event log → host election on host loss, bot seat-takeover, rejoin by code |
| Rooms                    | 4-char room codes + share-URL auto-join only. No public lobby, no matchmaking                                        |
| Art direction            | Original theme: **cozy diorama world**, UNO-grade motion language                                                    |
| Orientation              | Landscape-first (rotate-to-play prompt on portrait phones)                                                           |
| Pace                     | No turn timers in friend/casual rooms (pace = animation energy; bots snap-play). Timers only inside Timed mode       |
| Bots                     | 3 difficulty tiers AND named personas w/ avatars + playstyle leans                                                   |
| Persistence              | Local profile + lifetime stats in localStorage. No accounts, no server                                               |
| Audio                    | Full SFX suite + ambient music loop, independent mute toggles                                                        |
| Engine validation target | UNO-like shedding game (custom deck, action cards, interrupts)                                                       |
| Names                    | Platform/repo: **parlour**. Game #1: **Blitz**. Packages scoped `@parlour/*`                                         |

## 3. Tech stack

- **Next.js** (App Router) + TypeScript strict + Tailwind — mirrors voidstrike's deploy shape; static-exportable (no server code at runtime; the only "backend" is public Nostr relays + STUN/TURN).
- **zustand** for UI state; engine state lives in the engine, not React.
- **Motion v12** (`motion`, formerly Framer Motion) for card/zone animation — `layoutId` shared-element transitions move cards between zones; `AnimatePresence` for enter/exit.
- **GSAP** (fully free since 2025) for set-piece timelines: deal choreography, Blitz celebration, match-end podium.
- **howler.js** (or plain WebAudio) for SFX/music with a tiny audio manager (preload, mute channels, concurrency caps).
- **nostr-tools** + native WebRTC (`RTCPeerConnection`) for multiplayer — lift patterns from voidstrike `src/hooks/useMultiplayer.ts` (~1,150 ln) and `src/engine/network/p2p/NostrRelays.ts` (health-checked relay list). Add free TURN (Open Relay / Cloudflare TURN) to the ICE config — voidstrike is STUN-only; we want the extra ~10-30 % of NAT pairs.
- **pnpm workspaces** monorepo; **vitest** for tests. ESLint/prettier config style: copy voidstrike.
- Card art placeholders: **Cardmeister** SVG deck (Unlicense) during build; production deck is custom-designed (see §8).

```
parlour/
  packages/
    engine/        # @parlour/engine — game-agnostic core
    game-blitz/    # @parlour/game-blitz — 31 rules module
    game-wildpile/ # @parlour/game-wildpile — UNO-like (M5, name TBD)
  apps/
    web/           # the parlour app (Next.js)
```

## 4. Engine architecture (@parlour/engine)

The engine is a **pure, deterministic, transport-agnostic TS library**. No React, no DOM, no network imports. It must run identically in a browser tab, a web worker, and Node (tests/CLI sims). Design concepts are lifted from boardgame.io (`playerView`, phases, enumerate-bots) and bgio-effects (effects timeline) — see research doc.

### 4.1 Core model

```ts
// A game definition is data + pure functions:
interface GameDef<S, C extends RuleConfig> {
  id: string; // 'blitz'
  configSchema: C; // typed house-rule schema w/ defaults + presets
  setup(ctx: SetupCtx<C>): S; // seeded: ctx.rng is the ONLY randomness source
  moves: Record<string, Move<S>>; // pure validated reducers
  flow: Flow<S>; // phase/turn machine (who acts, legal moves, auto-advance)
  playerView(s: S, seat: SeatId): RedactedState; // per-seat redaction
  end(s: S): MatchResult | null;
  bots: BotPolicy<S>[]; // enumerate legal moves + heuristic scoring
}

interface Move<S> {
  validate(s: S, seat: SeatId, payload: unknown): true | RuleError;
  apply(s: S, seat: SeatId, payload: unknown, fx: FxEmitter): S; // MUST also emit fx
}
```

- **Determinism**: seeded PRNG (e.g. `pure-rand` xoroshiro) created from a round seed. Same seed + same event log ⇒ identical state on every peer. No `Date.now`/`Math.random` anywhere in engine code (enforce via ESLint rule).
- **Event log**: append-only `{seq, seat, move, payload, ts}` list. State = `replay(seed, log)`. This single decision buys: replays, reconnect, host migration, spectate-later, and bug reports (a failing log is a repro).
- **Zones**: first-class zone primitives (`stock`, `discard`, `hand(seat)`, plus grid/meld zones later) with ordered card ids. Cards are ids; the deck definition maps id → face. Custom decks (UNO-like) are just a different deck definition.
- **Redaction**: `playerView` strips hidden info per seat (opponents' hands → counts, stock → count). NOTE (owner-accepted trade-off): in P2P full-resilience mode every client _technically_ holds the seed and could derive hidden state — redaction is honest-UI, not cryptography. Fine for friends play; document it in the README.
- **Effects timeline (`fx`)**: every applied move emits an ordered list of presentation hints with relative timings, e.g. `fx.emit('card.fly', {card, from:'hand:2', to:'discard', dur:200})`, `fx.emit('burst.knock', {seat:1, at:+120})`. **The UI animates ONLY from fx events, never by diffing state.** State is final instantly; pixels catch up beautifully. This is the load-bearing architectural rule — it is the documented failure mode of boardgame.io UIs and the reason animation quality survives multiplayer latency.
- **Rule config**: typed schema per game with defaults + named presets. Room settings UI is generated from the schema (toggle/enum/int with labels), so new house rules never require UI work.
- **Bot harness**: `enumerate(s, seat)` yields legal moves; a `BotPolicy` scores them (see §9). Bots are engine clients — same API as humans, zero special-casing. A CLI sim (`pnpm sim -- --games 10000`) plays bots vs bots headless for balance/regression testing; build it in M1 and keep it green.

### 4.2 Transport layer (apps/web, not engine)

```ts
interface Transport {
  create(room: RoomSettings): Promise<RoomHandle>; // host
  join(code: string): Promise<RoomHandle>; // guest
  send(action: PlayerAction): void; // seat intent → authority
  onEvent(cb: (e: AppliedEvent) => void): void; // authority → all seats (log entries + fx)
  onPresence(cb: (p: PresenceEvent) => void): void;
}
```

- **LocalTransport** (M2): solo/CPU play, host loop in-process. Works offline; zero network.
- **P2PTransport** (M4): host-authoritative mesh.
  - Room create → 4-char code (unambiguous alphabet, no 0/O/1/I) → publish ephemeral Nostr event to ≥3 healthy relays (health-check + fallback list per voidstrike `NostrRelays.ts`); guests resolve code → SDP exchange over relays → `RTCPeerConnection` DataChannels, full mesh (4 players = 6 links, trivial).
  - ICE: public STUN + free TURN (Open Relay `metered.ca` or Cloudflare). Share URL = `parlour.app/join/CODE` (auto-join on open).
  - **Authority**: host applies moves via the engine, broadcasts `AppliedEvent`s (log entry + fx). Guests send intents only. Guests ALSO validate applied events locally (deterministic engine ⇒ divergence detection for free; on mismatch, resync from host snapshot).
  - **Round seed**: host generates, broadcasts in `round.start`. All peers can replay the full log ⇒ full resilience.
  - **Heartbeats** every 1 s per link; peer considered gone after ~3.5 s silence.
  - **Host migration**: on host loss, surviving peers elect deterministically (lowest connected peerId), new host resumes from its own replayed state, broadcasts `host.changed` + state hash; bots continue on the new host. Mid-flight intents are re-sent after migration (idempotent by client-generated action ids).
  - **Seat drop**: bot takes the seat immediately (marked `(bot)` in UI); the human can rejoin with the same code + profile id and reclaim it.
  - **Reconnect**: rejoining peer receives `{seed, log}` (or snapshot + tail) from any peer and replays.

## 5. Game #1: Blitz (@parlour/game-blitz)

2–4 seats (solo = you + 1–3 bots; multiplayer fills empty seats with bots at host's option). 52-card deck.

### 5.1 Core rules (base, before toggles)

- Deal 3 cards each; flip 1 to start discard; rest is stock.
- Hand value = max over suits of (sum of that suit's cards). A=11, K/Q/J=10, pips face value. Max 31 (A+10+10 suited).
- On your turn: **draw** (top of stock OR top of discard) then **discard** one card face-up. You may not discard the card you just took from the discard pile.
- **Knock**: on your turn, _instead of_ drawing, knock. Every other player then gets exactly one more turn; then showdown.
- **Showdown**: lowest hand value loses. If the knocker is lowest (or tied for lowest), the knocker takes the penalty instead.
- **Blitz**: reaching exactly 31 (declared automatically the moment you hold it after a draw) ends the round instantly; every other player takes a loss. A Blitz on the deal (before any turn) triggers immediately.
- Stock exhausted → reshuffle discard (minus top card) into a new stock, same round seed stream.

### 5.2 House-rule schema (config toggles; defaults ★)

| Rule           | Options                                                                                                                 |
| -------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `lives`        | 1–5 (★3) — Classic mode only                                                                                            |
| `honorRound`   | on/★off — after losing the last life you're "riding the bus": one extra loss allowed before elimination                 |
| `knockPenalty` | knocker-lowest loses ★2 lives / 1 life                                                                                  |
| `tieLowest`    | ★both lose / nobody loses / redeal between tied                                                                         |
| `threeOfAKind` | counts ★30.5 / 30 / off                                                                                                 |
| `blitzPenalty` | ★all others lose 1 / only lowest loses 1                                                                                |
| `discardLock`  | ★can't rediscard the card just drawn from discard / allowed                                                             |
| `turnTimer`    | ★off / 5 / 7 / 10 / 15 s (auto-play on expiry: draw stock, discard worst off-suit card) — forced ON (7 s) in Timed mode |
| `seats`        | 2–4 (★4), `fillWithBots` ★on                                                                                            |

### 5.3 Match formats (mode select — all first-class)

1. **Classic** — lives + elimination. Round loss → lose life (chip animation). Last player with lives wins the match. ~5–10 min.
2. **Fast** — single self-contained rounds, winner = highest hand at showdown/Blitz; instant redeal loop with a running win counter; first-to-N toggle (★3).
3. **Timed** — match clock (★3:00, toggle 2/3/5 min): continuous Fast rounds; most round-wins at the buzzer; tie → one sudden-death round. Per-turn timer forced on. This is the "extremely fast paced" flagship — UNO! quick-match energy.

## 6. App screens & flows (apps/web)

Reference frames noted as `[NN]` = `research/uno-frames/NN-*.jpg`.

1. **Title / Home** — logo, ambient diorama background already alive; buttons: Play Solo, Create Room, Join, Profile. `[01]` for layout energy, not style.
2. **Mode select** — three big card-shaped mode tiles (Classic / Fast / Timed) in a carousel, each with a live-animated preview inside the tile. `[01, 02]`
3. **Room lobby (host & guest)** — seat slots w/ avatars filling as friends join (voidstrike lobby UX), room code HUGE with tap-to-copy + share button, house-rule panel (generated from config schema, presets dropdown: Classic Pub / Cutthroat / Custom), bot-fill toggles, Start. `[11]` for VS/energy.
4. **Table** — THE screen; see §7/§8.
5. **Round end** — showdown reveal choreography → result banner (KNOCKED! / BLITZ!) → life chips animate away → interstitial standings strip → next round auto-deals in ≤4 s. `[07, 09, 10]`
6. **Match end** — podium: player frames slide in staggered as trading-card plaques (1st–4th), stats (blitzes, knock wins), win jingle + confetti/coin shower for winner; Play Again (same room, same settings, one tap) + Back. `[07, 08, 09]`
7. **Profile** — name + avatar picker (grid of built-in characters), lifetime stats panel (games, wins, blitz count, knock success %, best streak). localStorage only.
8. **Join** — `/join/CODE` deep link auto-joins; manual 4-char entry with big friendly keypad.

Landscape-first: phones in portrait get a charming rotate prompt (diorama tips sideways). Desktop = same landscape stage, letterboxed with ambient margins.

## 7. Motion & feel spec (REQUIRED reading: `research/UNO-VISUAL-ANALYSIS.md`)

Non-negotiable principles measured from the reference:

1. **≤250 ms interaction feedback.** Local action animates immediately (optimistic); remote confirmation reconciles. Card flight hand→discard: **~200 ms** arc w/ slight rotation + colored streak trail; landing squash-settle ~80 ms; discard pile keeps last 2–3 cards at random ±10° offsets.
2. **Spatial cause→effect.** Effects travel to their target: knock thud ripples the table THEN a token arcs to the knocker's seat plaque (~500 ms); Blitz explodes on the blitzing seat then radiates a life-loss chip flying to EACH other seat. Nothing is just floating text.
3. **Overshoot everything.** Scale-ins overshoot ~1.1×; springy fan re-layout when hand changes (~250 ms); avatar rings pop on turn start.
4. **One big burst per event, ≤1.2 s,** and the next turn NEVER waits for a cosmetic tail — effects play out while play continues.
5. **Stagger, don't batch.** Deal: cards streak stock→each seat 120–200 ms per card, 60–90 ms stagger, hand fans open on completion. Podium plaques, standings rows: 60–100 ms cascade.
6. **Ambient life always** (low amplitude): drifting light/particles in the diorama, idle avatar bob, discard shimmer, turn-ring pulse. The scene must never be frozen — but ambient motion stays far below gameplay motion so reads never compete.
7. **Round intro**: quick brand wipe → camera settles on diorama → big 3-2-1 countdown numerals popping w/ overshoot (~700 ms each) → deal choreography (GSAP timeline).
8. Implementation: cards are DOM nodes animated ONLY via `transform`/`opacity` (Motion `layoutId` across zones); GSAP timelines for deal/win set pieces; effects driven exclusively by the engine `fx` stream. 60 fps on a mid phone is a hard target — no layout thrash, no shadows repainting per frame.

Blitz-specific signature moments to design large: **KNOCK** (fist thud, table shake ~4 px 150 ms, "KNOCKED" stamp slams down, final-turn rings light up around remaining players in sequence) · **BLITZ!** (screen-edge flash, 31 numeral slams w/ starburst, life chips fly out to every opponent) · **showdown** (hands flip in sequence around the table, per-hand suit-sum counter rolls up, loser's chip cracks/falls).

## 8. Art direction: cozy diorama world

- The table is a **miniature diorama scene**: a warm card table in a tiny world — reference vibe: rooftop at dusk / cabin by firelight; soft rim lighting, tilt-shift depth, gentle parallax on a ~30–40° camera angle so seats sit "around" the space. NOT the UNO planet — same _idea class_ (the table is a place), original execution.
- Palette: warm ambers/teals with saturated card faces popping against the scene. Chunky rounded UI, soft bevels, zero hard edges. Fat friendly display type for numerals (countdown, 31, scores).
- Custom card faces (production): large readable indices, suit-colored accents, backs carry the parlour brand. Placeholder during build: Cardmeister SVGs.
- Seats: avatar plaques (rounded-square, per-player accent color, name pill, life chips + turn ring) — layout mirrors `[04]`.
- Deliverable checkpoint: before building all screens, the agent produces the diorama stage + one seat + one card in final art style and gets owner sign-off (single screenshot review).

## 9. Bots: 3 tiers + personas

Heuristic policies over enumerated moves (no ML). Core evaluation: current best-suit value, draw-improvement odds (discard pile is open information), discard danger (feeding opponents' visible suit collections), knock threshold, blitz distance.

- **Tier 1 "Easy"**: myopic — takes obvious suit matches, knocks at high thresholds (≥27), never tracks opponents' pickups.
- **Tier 2 "Medium"**: tracks what each opponent has drawn from discard (suit inference), avoids dangerous discards, knock threshold ~21–24 adjusted by lives and cards seen.
- **Tier 3 "Hard"**: full open-information inference, expected-value knock timing (probability lowest given inferences), early-knock pressure plays, blitz-chase vs safe-knock tradeoffs.
- **Personas** (~6 named characters w/ avatars): a persona = tier + parameter skews + emote flavor. Examples: cautious granny (high knock threshold, apologetic emotes), blitz-chaser kid (holds for 31 too long), poker-faced regular (median everything), aggressive knocker (knocks early). Personas fill seats in solo AND multiplayer bot-fill.
- Bots "think" 400–900 ms (persona-skewed) in casual rooms for humanity, snap-play (<150 ms) when a timer is active or a seat is in bot-takeover.
- CLI sim harness validates: Hard beats Easy ≥70 % head-to-head; no persona degenerate (win rate 15–35 % band in 4-seat mixed games, 10k-game runs).

## 10. Audio

- SFX set: card slide/whoosh (flight), snap (land), riffle (deal), thud + rumble (knock), rising shimmer + fanfare hit (Blitz), chip clink (life loss), soft tick (turn pass), pop (UI), win jingle, lose sting. Sourced free/CC0 (freesound/Kenney), curated hard for cohesion; normalize loudness.
- Ambient loop matching diorama (fireplace crackle / evening air + distant city), −18 LUFS-ish under SFX.
- Channels: master/music/SFX mutes, persisted in profile. Audio unlocks on first user gesture (mobile autoplay policy).

## 11. Engine validation: game #2 (UNO-like, M5)

`@parlour/game-wildpile` (working name) proves the engine generalizes. It must require **zero changes to @parlour/engine** beyond what M1 scoped — if it does, the engine API failed and gets fixed. Stresses: custom 108-card deck definition, action/effect cards pipeline (skip/reverse/draw-N/wild via move-triggered flow mutations), interrupt windows (jump-in as an out-of-turn legal move), direction state, color-choice sub-decision, stacking toggle. Same table scene, different deck skin + fx set. MIT reference for rules shape: `danguilherme/uno` (research doc §1). Ship as a second tile on mode select when ready.

## 12. Non-goals (v1)

No accounts/server persistence · no public lobby/matchmaking · no spectator mode (log architecture keeps it cheap later) · no chat beyond quick-emotes (P2P DataChannel emote wheel IS in scope — small, huge social payoff) · no real-money anything · no portrait layout · no i18n (structure strings for it) · no native wrappers (but ship PWA manifest + icons so it installs to home screen).

## 13. Milestones (each independently verifiable)

- **M1 — Engine + Blitz rules, headless.** `@parlour/engine` + `@parlour/game-blitz` complete w/ full house-rule schema, event log/replay, fx emission, bot harness + 3 tiers, CLI sim, vitest suite incl. every toggle and edge (deal-blitz, tie showdowns, stock reshuffle, knock-lowest). Exit: 10k-game sim clean, deterministic replay hash-stable.
- **M2 — Solo vertical slice, the FEEL milestone.** Table screen in placeholder-but-composed art, full motion system (deal/draw/discard/knock/blitz/showdown choreography from fx stream), LocalTransport, bots w/ personas, all 3 modes, mode select + title. Exit: playable solo build on Vercel that already _feels_ premium; owner review of feel is the gate.
- **M3 — Art + audio + meta.** Final diorama art pass (after §8 checkpoint), full SFX/music, profile + stats, round/match-end celebrations, PWA. Exit: solo experience is ship-quality.
- **M4 — Multiplayer.** P2PTransport (Nostr signaling + WebRTC mesh + TURN), lobby/room flow, share links, full resilience (host migration, bot takeover, rejoin), emote wheel, divergence detection. Exit: 4 real devices (incl. one on cellular) complete matches through forced host-kill and rejoin tests.
- **M5 — Engine proof.** Wildpile prototype playable solo; write-up of any engine friction found. Exit: second tile works with zero engine API breaks.

Deploy continuously to Vercel from M2 (static). Repo: `braedonsaunders/parlour`, MIT, README in the voidstrike style (it's a portfolio piece).

## 14. Reference index for the build agent

- Motion bible: `research/UNO-VISUAL-ANALYSIS.md` + `research/uno-frames/` (contact sheets = whole-game scan; `play_sheet_*` = 100 ms/tile animation timing)
- Research + all sources/URLs: `research/RESEARCH.md`
- P2P prior art: voidstrike `src/hooks/useMultiplayer.ts`, `src/engine/network/p2p/NostrRelays.ts`, `docs/architecture/networking.md`
- Engine concept sources: boardgame.io docs (playerView/phases/ai.enumerate), bgio-effects README (fx timeline), danguilherme/uno (headless engine API), RLCard (bot heuristics)
- Assets: Cardmeister (Unlicense placeholder deck), Kenney/freesound (audio)
