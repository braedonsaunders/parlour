# Parlour Veil — private cards without a game server

## Status and product boundary

Parlour Veil is the proposed opt-in privacy protocol for competitive friend
rooms. It preserves Parlour's static Vercel deploy and WebRTC mesh: no database,
account service, long-running authority, or server-held round seed is required.

The current room protocol remains the fast default. Veil is a second security
tier because it adds a shuffle ceremony, more peer messages, and a different
reconnect trade-off. This document is a design, not a claim that the current P2P
transport already protects hidden hands.

## What it guarantees

- No peer receives a round seed or full cleartext deck.
- With at least two non-colluding peers, no single participant can map the
  encrypted deck to card faces before cards are deliberately revealed.
- A dealt private card is opened only to its owner.
- Public cards and showdown hands carry proofs linking them to the committed
  deck; invented or duplicated cards fail the reveal checks or after-match
  audit.
- Every ceremony, draw, reveal, and authority change is hash-chained and signed,
  so the room can perform a full after-match audit.
- The protocol uses browser-native Web Crypto primitives and DataChannels, so a
  static Vercel export can run it.

It does **not** make collusion impossible. If every other participant colludes,
they can pool their secrets. Nor can a two-player room simultaneously promise
perfect hand privacy, automatic recovery after either player disappears, and no
third party: recovery requires somebody else to hold enough key material. Veil
surfaces this honestly in the room's security badge.

## The protocol

### 1. Ephemeral room identities

Each seat creates an ephemeral P-256 signing key and ECDH key for the room.
Public keys, seat order, game definition hash, and rules hash form the signed
round header. Long-lived local profile IDs are used only for seat reclaim and
head-to-head history; they are not cryptographic keys.

All Veil messages extend the existing event chain:

```text
entryHash = SHA-256(previousHash || kind || canonicalPayload || signer)
```

The room rejects duplicate sequence numbers, invalid signatures, and a chain
that does not extend its accepted head.

### 2. Onion shuffle

The canonical deck begins as tagged plaintext records:

```text
{ gameId, roundId, cardId, cardNonce }
```

In deterministic seat order, every peer performs one layer:

1. Wrap every incoming blob with a fresh AES-GCM key and nonce.
2. Index each private peel key by the SHA-256 hash of its output blob.
3. Cryptographically shuffle the wrapped blobs with a private permutation.
4. Broadcast the new opaque deck, its Merkle root, and a signed commitment to
   the layer's peel table and permutation.

The last shuffler knows the final ordering but cannot see card identities. The
first shuffler may know the original identities but cannot follow later honest
permutations. No shared seed ever exists.

### 3. Private draw

The public log consumes the top opaque handle. Its onion is peeled in reverse
shuffle order over pairwise encrypted DataChannels. Every peeling peer signs a
receipt containing the input and output hashes, but sends the intermediate blob
only to the next peeler. The final plaintext and nonce go only to the receiving
seat.

The owner's engine view records a private card face. Other views record only the
opaque handle and owner. This requires a `PrivateCardResolver` beside the pure
engine; the ordinary public reducer continues to own turn order, counts, zones,
and visible cards.

### 4. Public reveal and ownership proof

When a card is discarded, melded, played to a trick, or shown down, its owner
broadcasts the plaintext record, the per-handle layer keys, and the peel
receipts. Peers replay each AES-GCM peel and verify:

- the handle was assigned to that seat and has not already been spent;
- every onion hop matches the committed layer root;
- the plaintext is a member of the canonical game deck; and
- no `(cardId, cardNonce)` pair appears twice.

The public engine then receives a normal deterministic reveal move. Replays can
render the card from that point onward without learning cards that remained
private.

### 5. Hidden-rule claims

Deck privacy and rule integrity are different problems. A peer that alone knows
its hand could falsely claim "Blitz" or an eligible secret bid. Veil uses two
levels:

- **Audited friends mode:** accept the signed claim immediately for low latency;
  reveal the necessary cards at showdown or match end and mark the result
  verified or disputed. A dispute prevents the result from entering trusted
  head-to-head totals.
- **Proof mode:** game modules may provide a small, rule-specific zero-knowledge
  verifier for claims that must remain secret. This is practical for narrow
  predicates such as set membership or a committed numeric total, but is not a
  generic free feature for every future game.

The UI must never label audited mode as cheat-proof. Preventing arbitrary hidden
state lies in every possible game requires either those proofs or an independent
referee.

## Disconnects and host migration

The transcript and opaque deck are replicated to every peer, so host election
works exactly as it does today. Peel secrets need a separate recovery policy:

- Each seat encrypts its peel table under a random recovery key.
- Before play, it Shamir-splits that key among the other active seats and
  commits to the encrypted table.
- For 3–4 seats, a room-selected threshold can recover a disconnected peer's
  layer. A higher threshold protects better against collusion; a lower threshold
  recovers more reliably.
- A returning peer rotates its recovery material for the next round.
- In two-seat Veil, loss of either peer pauses or abandons the round. Automatic
  recovery would give the opponent the missing decryption power and defeat the
  privacy promise.

Bot takeover can continue public turn structure, but a bot cannot play a missing
human's still-private hand until the room's recovery threshold opens that layer.

## Match-end audit

At match end, peers may reveal their layer tables and permutations. The audit
reconstructs the ceremony, verifies every draw/reveal receipt, and proves deck
conservation. Unplayed private card faces can remain hidden by revealing only
the keys needed for consumed handles; a full diagnostic replay is a separate,
unanimous opt-in.

Local history stores an audit state with each result:

- `open` — ordinary current protocol;
- `veiled` — hand privacy held, audit incomplete;
- `verified` — transcript and required claims passed; or
- `disputed` — at least one proof failed.

Only `verified` results should count in a future competitive ladder. The local
friends W/L display may include all states with a visible badge.

## Vercel compatibility

All live state resides in browsers and travels through the existing Nostr
signaling plus WebRTC DataChannels. AES-GCM, ECDH/ECDSA P-256, SHA-256, random
bytes, and key wrapping are supplied by `crypto.subtle`; static hosting serves
only code and assets.

An optional later **stateless referee** could run in a Vercel Function: clients
would carry an encrypted, signed state token between calls, so the function
needs no database. That is useful for stronger rule enforcement but is still a
server authority and therefore is not the Veil default.

## Implementation slices

1. Add signed transcript, canonical encoding, Merkle helpers, and hostile-input
   tests in `apps/web/src/lib/multiplayer/veil/`.
2. Add the onion-shuffle ceremony and private draw/reveal harness with fixed
   test vectors.
3. Introduce opaque card handles and `PrivateCardResolver` without changing the
   public deterministic reducer contract.
4. Integrate room security selection, ceremony progress, audit badges, and
   explicit two-player disconnect messaging.
5. Add threshold recovery for 3–4 seats, forced host-loss tests, and independent
   cryptographic review before describing Veil as production-secure.
