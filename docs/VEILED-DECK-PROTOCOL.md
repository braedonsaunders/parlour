# Parlour Veil — private cards without a game server

## Status

Built and under test, not yet independently reviewed.

- `packages/engine/src/veil.ts` — opaque card handles, reveals and re-veilings
  recorded on the event log, the `veilSupport()` game-pack contract.
- `apps/web/src/lib/multiplayer/veil/` — the commutative shuffle ceremony,
  private dealing, the signed transcript, threshold recovery and the audit.
- Blitz, Wild Pile and Rat Screw each opt in with one `veil:` block.

Do not describe Veil as production-secure until the cryptographic review in
slice 5 has happened. Everything below states plainly what it does and does not
promise; the room UI repeats those words rather than paraphrasing them.

## Product boundary

Veil is the privacy tier for competitive friend rooms. It preserves Parlour's
static Vercel deploy and WebRTC mesh: no database, account service,
long-running authority, or server-held round seed.

The open room stays the fast default. Veil is a second tier because it adds a
shuffle ceremony before the deal, a round trip per hidden card, and a different
reconnect trade-off.

**Players are not asked to choose between them, and no longer choose at all.**
The tier picker is gone and so is the room option behind it: `tierFor` reads the
tier off the game pack. A pack that ships a `veil` block hides hands, so its
rooms do; one that does not plays the open tier with the collaborative deal
below. **Every shipped game ships a veil block**, so every room is a veiled
room and no game is left on a different path. The open tier is the floor for a
future pack that has little or nothing to hide.

Deriving rather than announcing the tier also means a joining peer computes the
same answer as the host from the same game id, so a forged announcement cannot
talk a room down into the open tier.

Veil is still pre-review (slice 8). Nothing here changes that, and the badge
still says what is and is not covered.

## The collaborative deal — always on, every room

The open room's real weakness between friends was never that a determined
opponent could read a hand with a modified client. It was that the player who
opens the table also picked the deck, and could keep reopening it until the deal
suited them. That costs nothing to close, so it is closed for everybody.

Before the deal, each seat commits to 32 random bytes:

```text
commit = SHA-256("parlour.deal/commit" || roomCode || seat || nonce)
```

Commitments are broadcast as seats arrive. When the host deals, it reveals its
own share and every other seat answers with theirs; each is checked against the
commitment it was published under, and the seed is
`SHA-256("parlour.deal/mix" || roomCode || seat:nonce…)` over all of them in seat
order. Because every seat committed before any revealed, no seat can pick its
contribution after seeing the others: **one honest seat is enough to make the
deck unpredictable to everyone, including the host.**

Guests recompute the seed and compare it against the deal they were handed, so a
host that deals from its own number is caught at the first hand rather than
never. Neither message carries a seat number — the receiving peer attributes a
share to whichever seat actually sent it, so no peer can contribute on another's
behalf.

**Limits, stated as plainly as the rest of this document.**

- It does **not** hide hands. An open room still replays the whole game on every
  device. That is what Veil is for, and the badge says so.
- Whoever reveals last sees the other shares before sending its own. It cannot
  steer the seed, only withhold — and withholding is visible, because the deal
  does not happen and the room names the seat that is missing.
- A veiled room does not run this round. Its unpredictability comes from the
  ceremony itself, which is strictly stronger: every seat permutes a deck no
  seat can read.

Implementation: `apps/web/src/lib/multiplayer/dealSeed.ts`, wired through
`deal.commit` / `deal.reveal` on the existing mesh.

## What it guarantees

- No peer receives a round seed or a full cleartext deck.
- With at least two non-colluding peers, no participant — including the host —
  can map the encrypted deck to card faces before cards are deliberately opened.
- A dealt private card is opened only to its owner. Not "only the owner is told
  the answer": no other seat ever computes the plaintext.
- Public cards carry openings that the engine checks for deck conservation, and
  the whole ceremony is recomputed at match end.
- Every ceremony step is hash-chained and signed, so the room can run a full
  after-match audit.
- Browser-native primitives only (`crypto.subtle` plus `BigInt`), so a static
  export can run it.

It does **not** make collusion impossible. If every other participant colludes
they can pool their secrets. Nor does it prevent all cheating in real time — see
"Detection, not prevention". Nor can a two-player room promise perfect hand
privacy, automatic recovery when either player disappears, and no third party
at once: recovery needs somebody else to hold key material.

## The protocol

### 1. Ephemeral room identities

Each seat mints a P-256 signing key for the round. Public keys, seat order, game
id, resolved-rules hash and the deck form the signed round header. Long-lived
profile ids are used only for seat reclaim and head-to-head history; they are
never cryptographic keys.

Every Veil message extends one hash chain:

```text
entryHash = SHA-256("parlour.veil/entry" || canonical({seq, kind, seat, signer, previous, payload}))
```

The transcript rejects out-of-order sequence numbers, entries that do not extend
the accepted head, unregistered signers, altered payloads and bad signatures,
and it leaves its head untouched when it rejects.

### 2. The commutative shuffle

**This replaces the AES onion the first draft of this document described.**

An onion of AES layers is peeled from the outside in, so somebody holds the
innermost layer and computes the plaintext. Under that construction the first
shuffler learns the face of every privately drawn card — which is exactly the
guarantee above. The onion cannot deliver it, so Veil uses a commutative cipher
instead.

SRA over a fixed 2048-bit safe prime (RFC 3526 group 14): each seat draws a
secret exponent `e` coprime to `p - 1` and encrypts with `mᵉ mod p`. Because
`E_a(E_b(m)) = E_b(E_a(m))`, layers come off in any order.

1. Every peer computes the same starting deck: each card id maps deterministically
   to a group element, squared so that every card is a quadratic residue. (SRA
   leaks the Legendre symbol; a deck of mixed residues would split visibly in
   two before a single layer came off.)
2. In seat order, each seat encrypts every element under its layer, applies a
   private permutation, and broadcasts the new deck plus a commitment to its key
   and permutation.
3. The last seat closes the epoch. No seat knows the mapping: a seat's own
   permutation was applied to a deck it could not read, and later seats permuted
   again on top.

Structural checks reject a layer laid out of turn, one that changes the deck
size, one holding values outside the group, one that collapses two positions
onto the same element, and one that passes the deck through untouched.

### 3. Private dealing

To open deck position _p_ for a seat, every **other** seat removes its own layer
in turn and hands the still-locked value to the next; the recipient removes the
last layer itself. Exponents compose rather than combine, so this is a chain of
`seats - 1` hops, not a broadcast — that latency is the real price of Veil.

Intermediate values are addressed to a single peer and never broadcast;
publishing one would let any onlooker finish the chain. Each hop keeps a hash of
the value it produced so a dishonest partial decryption can be attributed once
keys are disclosed.

A partial decryption computed with the wrong exponent yields a value that
decodes to no card at all, so it is caught the moment the chain completes rather
than at the audit.

### 4. Opening a card in public

Playing, discarding, flipping or showing down a card makes it public. The acting
client sends the move with the `[handle, cardId]` openings it needs, and the
engine substitutes them **before** validation, so every existing rule keeps
working unchanged. The engine enforces conservation itself: the handle must be
in play, the face must be in the deck, and no opening may mint a card the table
can already see. Openings are recorded on the applied event, so a veiled round
replays bit-for-bit from `(seed, ceremony deck order, log)`.

### 5. Recycling a spent discard

Reshuffling a face-up discard pile back into the stock would make every
remaining draw readable. A veiled room refuses that draw until the pile has been
re-veiled: the cards start a fresh epoch with new handles and a new ceremony.
The table still knows _which_ cards are in the stock — it does in a physical
game too — but no longer their order.

The event records two unpaired lists — public cards retired and fresh handles
issued. It never records `[card, handle]` pairs, because that would publish the
new order Veil is meant to hide. If somebody has already left, only connected
seats contribute layers to the fresh epoch; the signed declaration names that
participant set and the audit recomputes exactly those layers.

### 6. Hidden-rule claims

Deck privacy and rule integrity are different problems. A seat that alone can
read its hand could falsely claim a Blitz.

- **Audited friends mode (what ships):** the claim opens exactly the cards it
  needs and the table checks the arithmetic itself. Blitz's `blitz.claim` opens
  the claimant's whole hand and is rejected outright if it is not 31, so a bluff
  never enters the log. Legality stays public — it depends on card _counts_,
  which everyone can see — so offering the move leaks nothing.
- **Proof mode (not built):** a game module could supply a rule-specific
  zero-knowledge verifier for claims that must stay secret. Practical for narrow
  predicates; not a free feature for every future game.

The UI must never label audited mode cheat-proof.

## Detection, not prevention

Two things the live protocol does not prove:

- that a seat **shuffled** rather than substituted cards, and
- that a partial decryption was computed honestly.

Both are caught after the fact. At match end every seat discloses its layer
exponents and permutation; the audit recomputes the entire ceremony and checks
it against the signed transcript, verifies deck conservation, and re-derives
every opening. A seat whose disclosure does not reproduce what it published is
named in the findings.

This is why only `verified` results should ever feed a competitive ladder.

## Disconnects and host migration

The transcript and locked deck are replicated to every peer, so host election
works as it does today. Layer secrets need their own policy:

- Each seat seals its layer secrets under a random recovery key.
- That key is Shamir-split (GF(256)) among the other active seats.
- **3–4 seats:** a room-selected threshold recovers a missing layer. Each seat
  hands every other seat exactly one share, addressed — broadcasting the package
  would give every peer every share and quietly reduce the threshold to one.
  When a seat drops, the remaining seats collect a quorum, rebuild its layer,
  and stand in for it on the peel chain so the round continues. The threshold is
  exactly the number of seats who, colluding, could open a live hand — the room
  states that number out loud rather than hiding it.
- **2 seats:** no recovery. Any share that lets your opponent resume also lets
  them read your hand, so the round pauses instead. `recoveryPolicyFor(2)`
  returns `mode: 'none'` and says so.

**What recovery is actually for.** Every peel chain needs every seat's layer, so
one missing seat blocks _everyone's_ cards, not just its own. Rebuilding the
departed layer is what lets the remaining players keep drawing and playing their
own hands. Reading the departed player's hand is a side effect of holding their
layer, not the goal.

**Resume before recovery.** A dropped seat is held open for a grace window
first, because a player who comes back rebuilds their own layer and nothing is
opened to anybody. Layers are no longer drawn but *derived*: the exponent, the
permutation and the salt all come from a stream keyed by a per-room master seed
and the epoch, so the same seat reproduces the same layer, and its round signing
key is kept so it returns as the identity the header registered. The returning
peer asks the table to replay the round — `veil.catchup` carries the header and
every entry, each re-validated on arrival — then re-derives its secrets and
checks them against commitments the transcript already holds. A layer that does
not match is refused rather than played on with.

This is what makes a two-seat disconnect survivable. Recovery still exists for
the seat that never comes back, and is still reported as a privacy loss; it is
simply no longer the first answer to a phone changing networks. Material lives
in `localStorage` for the life of the room, keyed by room and profile: whoever
can read it is already sitting at the browser holding the hand.

**Bot takeover.** The authority host immediately drives a dropped seat through
the game pack's ordinary bot policy, using the same legal-move enumeration and
reducers as a human. In a veiled room the host opens the departed hand only as
a surrogate view: enough to choose its move, never enough to render that hand
on the host's table. Only the card the bot actually makes public enters the log.
A host migration resumes the same deterministic decision from the same log
position, and a returning profile reclaims the seat before another scheduled
bot move can fire. Takeover bots snap-play in under 150 ms.

**Recovery is a privacy loss and is reported as one.** Rebuilding a departed
seat's layer means whoever holds it can read every card that seat was dealt. The
room names those seats in the badge for the rest of the round rather than
letting the loss pass quietly, and a seat is only ever recovered after the room
agrees it has actually gone. A seat that comes back rotates its material for the
next round; the current round's layer stays open.

## Match-end audit

Local history stores an audit state with each result:

- `open` — ordinary room; every peer replayed the full state.
- `veiled` — hand privacy held, audit incomplete.
- `verified` — the ceremony recomputed and every check passed.
- `disputed` — at least one check failed.

Only `verified` counts as ranked. The local friends W/L display may show all
states with a visible badge.

## Vercel compatibility

All live state resides in browsers and travels over the existing Nostr signaling
plus WebRTC DataChannels. SHA-256, ECDSA P-256, AES-GCM and random bytes come
from `crypto.subtle`; the group arithmetic is `BigInt`. Static hosting serves
only code and assets.

An optional later **stateless referee** could run in a Vercel Function with
clients carrying an encrypted, signed state token between calls, so the function
needs no database. Useful for stronger rule enforcement, still a server
authority, and therefore not the Veil default.

## Several deals in one session

A veiled deal is one ceremony over one deck, so a match spanning several hands
needs a ceremony per hand. Epochs were always general — a recycled stock opens a
fresh one, numbered on from where the last stopped — so the next hand's deck is
that machinery pointed at the whole deck, and `redealPlan` reads the order off
any epoch. A second hand therefore cannot reissue a handle the first one spent.

The seam is the move. An open room deals its next hand from the session rng,
which under Veil would hand every seat a readable deck mid-match, so the game
stops and reports `VEILED_REDEAL_PENDING` through ordinary validation. The host
sees it, runs a ceremony, and injects the move with the deck it produced; the
move's own validation still runs, so an injected event cannot deal a hand the
rules would refuse. Gin and cribbage both work this way.

## Cost, measured

A 52-card ceremony is `seats × 52` modular exponentiations at 2048 bits — on the
order of a second or two of work, which is why the lobby shows ceremony
progress. Each hidden card costs one `seats - 1` hop chain.

**The arithmetic runs on a worker.** A deck of modular exponentiations on the
main thread blocks animation, input and the heartbeat timer — and a seat that
misses enough heartbeats is declared gone, so a table could lose a player to its
own shuffle. `shuffleClient` posts each layer to a shared worker and the ceremony
awaits the answer.

Two properties matter more than the speed. The worker and the fallback run the
*same* pure job, so they cannot shuffle differently — a layer that differed
between paths would fail its own commitment check and wedge the round. And a
worker that cannot be created, dies or reports an error is not fatal: the job
runs in-thread instead, chunked so the timers still turn. Losing the worker
costs smoothness, never the round.

## Implementation slices

1. ✅ Signed transcript, canonical encoding, hostile-input tests.
2. ✅ Commutative shuffle ceremony and private draw/open, with a mesh harness.
3. ✅ Opaque handles and reveal/recycle metadata in the engine, without changing the
   public deterministic reducer contract.
4. ✅ Room security selection, ceremony progress, audit badge and explicit
   two-player disconnect messaging.
5. ✅ Threshold recovery wired into live seat loss (including the host), with
   forced-disconnect integration tests over the mesh harness.
6. ✅ Host-owned bot takeover for dropped seats in open and Veil rooms, including
   deterministic host handoff, surrogate-only hidden faces and profile reclaim.
7. ✅ Re-veiling a recycled stock with a signed fresh epoch, unpaired engine
   metadata, active-seat participant sets and replay-stable reducer support.
8. ⬜ Independent cryptographic review before calling Veil production-secure.
