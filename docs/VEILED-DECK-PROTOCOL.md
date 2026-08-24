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

Veil is the opt-in privacy tier for competitive friend rooms. It preserves
Parlour's static Vercel deploy and WebRTC mesh: no database, account service,
long-running authority, or server-held round seed.

The open room stays the fast default. Veil is a second tier because it adds a
shuffle ceremony before the deal, a round trip per hidden card, and a different
reconnect trade-off.

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

A bot can continue public turn structure but cannot play a missing human's still
private hand until the threshold opens that layer.

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

## Cost, measured

A 52-card ceremony is `seats × 52` modular exponentiations at 2048 bits — on the
order of a second or two of main-thread work, which is why the lobby shows
ceremony progress. Each hidden card costs one `seats - 1` hop chain. Both are
stated in the tier picker before the room is opened.

## Implementation slices

1. ✅ Signed transcript, canonical encoding, hostile-input tests.
2. ✅ Commutative shuffle ceremony and private draw/open, with a mesh harness.
3. ✅ Opaque handles and reveal/conceal in the engine, without changing the
   public deterministic reducer contract.
4. ✅ Room security selection, ceremony progress, audit badge and explicit
   two-player disconnect messaging.
5. ✅ Threshold recovery wired into live seat loss (including the host), with
   forced-disconnect integration tests over the mesh harness.
6. ⬜ Independent cryptographic review before calling Veil production-secure.
